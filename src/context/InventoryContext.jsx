import React, { createContext, useContext, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { generateUUID } from '../lib/utils';
import { logError } from '../lib/errorLogger';
import { useAuth } from './AuthContext';
import { useTenant } from './TenantContext';
import { useSync } from './SyncContext';
import { useNotifications } from './NotificationContext';

const InventoryContext = createContext();

export const useInventory = () => useContext(InventoryContext);

export const InventoryProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [inventoryLocations, setInventoryLocations] = useState([]);
  const [inventoryBalances, setInventoryBalances] = useState([]);
  const [movementLog, setMovementLog] = useState([]);
  // Routes + vehicles are inventory movement artifacts (stock dispatched to
  // mobile warehouses). State lives here so Sales/Purchases contexts can read
  // route→location mapping without pulling from AppContext (circular dep).
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);

  const MAIN_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000001';

  // Consume infrastructure contexts via hooks (not props)
  const { currentUser } = useAuth();
  const { currentTenantId } = useTenant();
  const { setSyncStatus, setLastSyncedAt } = useSync();
  const { addNotification } = useNotifications();

  const adjustLocationStock = async (productId, amount, locationId = MAIN_WAREHOUSE_ID) => {
    if (!productId || !locationId) return;
    const prevBalances = [...inventoryBalances];
    const prevProducts = [...products];

    setInventoryBalances(prev => {
      const existing = prev.find(b => b.product_id === productId && b.location_id === locationId);
      if (existing) {
        return prev.map(b => (b.product_id === productId && b.location_id === locationId) 
          ? { ...b, quantity: Math.max(0, b.quantity + amount), updated_at: new Date().toISOString() } 
          : b
        );
      } else {
        return [...prev, { 
          id: generateUUID(), 
          product_id: productId, 
          location_id: locationId, 
          quantity: Math.max(0, amount), 
          updated_at: new Date().toISOString() 
        }];
      }
    });

    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('adjust_inventory_atomic', {
        p_product_id: productId,
        p_location_id: locationId,
        p_amount: amount,
        p_reason: 'Manual Adjustment',
        p_user_id: currentUser?.id,
        p_tenant_id: currentTenantId
      });
        
      if (error) {
        console.error("❌ Atomic Adjustment Failed:", error);
        setInventoryBalances(prevBalances);
        setProducts(prevProducts);
        logError({
          module: 'Inventory',
          action: 'Adjust Location Stock (Atomic)',
          error_code: error.code,
          error_message: error.message,
          severity: 'High'
        });
        addNotification("Failed to sync inventory change. Data reverted.", "error");
        return false;
      }
    }
    return true;
  };

  const adjustStock = async (productId, amount, reason, locationId = MAIN_WAREHOUSE_ID) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const prevProducts = [...products];
    const prevBalances = [...inventoryBalances];
    const prevLog = [...movementLog];

    const updatedProduct = { ...product }; // Optimistic update removed; relies on DB trigger & sync
    setProducts(prev => prev.map(p => p.id === productId ? updatedProduct : p));

    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('adjust_inventory_atomic', {
        p_product_id: productId,
        p_location_id: locationId,
        p_amount: amount,
        p_reason: reason,
        p_user_id: currentUser?.id,
        p_tenant_id: currentTenantId
      });

      if (error) {
        setProducts(prevProducts);
        setInventoryBalances(prevBalances);
        setMovementLog(prevLog);
        logError({
          module: 'Inventory',
          action: 'Adjust Stock (Atomic)',
          error_code: error.code,
          error_message: error.message,
          severity: 'High'
        });
        addNotification("Inventory update failed. Local state restored.", "error");
        return false;
      }
    }

    // Optimistic Update for Balances
    setInventoryBalances(prev => {
        const existing = prev.find(b => b.product_id === productId && b.location_id === locationId);
        if (existing) {
            return prev.map(b => (b.product_id === productId && b.location_id === locationId)
                ? { ...b, quantity: Math.max(0, b.quantity + amount), updated_at: new Date().toISOString() }
                : b
            );
        } else {
            return [...prev, {
                id: `TEMP-${Date.now()}`,
                product_id: productId,
                location_id: locationId,
                quantity: Math.max(0, amount),
                updated_at: new Date().toISOString(),
                tenant_id: currentTenantId
            }];
        }
    });

    const type = amount > 0 ? 'IN' : 'OUT';
    const locName = inventoryLocations.find(l => l.id === locationId)?.name || 'Storage';
    const newLogEntry = {
        id: `LOG-${Date.now()}`,
        date: new Date().toISOString(),
        product_id: productId,
        productName: product.name,
        type,
        quantity: Math.abs(amount),
        reason: `${reason} [Loc: ${locName}]`,
        userId: currentUser?.id,
        tenant_id: currentTenantId
    };
    setMovementLog(prev => [newLogEntry, ...prev]);
    return true;
  };

  const transferStock = async (fromLocId, toLocId, productId, qty, reason = 'Internal Transfer') => {
    if (!fromLocId || !toLocId || !productId || qty <= 0) return;
    const prevBalances = [...inventoryBalances];
    const prevProducts = [...products];
    const prevLog = [...movementLog];

    setInventoryBalances(prev => {
        return prev.map(b => {
            if (b.product_id === productId && b.location_id === fromLocId) {
                return { ...b, quantity: Math.max(0, b.quantity - qty), updated_at: new Date().toISOString() };
            }
            if (b.product_id === productId && b.location_id === toLocId) {
                return { ...b, quantity: (b.quantity || 0) + qty, updated_at: new Date().toISOString() };
            }
            return b;
        });
    });

    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('transfer_inventory_atomic', {
        p_product_id: productId,
        p_from_loc_id: fromLocId,
        p_to_loc_id: toLocId,
        p_qty: qty,
        p_reason: reason,
        p_user_id: currentUser?.id,
        p_tenant_id: currentTenantId
      });

      if (error) {
        setInventoryBalances(prevBalances);
        setProducts(prevProducts);
        setMovementLog(prevLog);
        logError({
          module: 'Inventory',
          action: 'Transfer Stock (Atomic)',
          error_code: error.code,
          error_message: error.message,
          severity: 'High'
        });
        addNotification(`Transfer Failed: ${error.message}. State restored.`, "error");
        return false;
      }
    }

    const fromName = inventoryLocations.find(l => l.id === fromLocId)?.name || 'Source';
    const toName = inventoryLocations.find(l => l.id === toLocId)?.name || 'Destination';
    const logEntries = [
        { id: `LOG-${Date.now()}-1`, product_id: productId, type: 'OUT', quantity: qty, reason: `${reason} (Transfer OUT: ${toName})`, userId: currentUser?.id, tenant_id: currentTenantId, date: new Date().toISOString() },
        { id: `LOG-${Date.now()}-2`, product_id: productId, type: 'IN', quantity: qty, reason: `${reason} (Transfer IN: ${fromName})`, userId: currentUser?.id, tenant_id: currentTenantId, date: new Date().toISOString() }
    ];
    setMovementLog(prev => [...logEntries, ...prev]);
    addNotification(`Asset Transfer: ${qty} units moved successfully`, "success");
    return true;
  };

  const value = {
    products, setProducts,
    productCategories, setProductCategories,
    inventoryLocations, setInventoryLocations,
    inventoryBalances, setInventoryBalances,
    movementLog, setMovementLog,
    vehicles, setVehicles,
    routes, setRoutes,
    MAIN_WAREHOUSE_ID,
    adjustLocationStock,
    adjustStock,
    transferStock
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};
