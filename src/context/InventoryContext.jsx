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

  // ── Product CRUD ─────────────────────────────────────────────────────────────
  const logMovement = async (productId, productName, type, quantity, reason, userId) => {
    const newLog = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      date: new Date().toISOString(),
      product_id: productId,
      product_name: productName,
      productId,
      productName,
      type,
      quantity,
      reason,
      user_id: userId,
      userId,
      tenant_id: currentTenantId,
    };

    if (isSupabaseConfigured) {
      const dbLog = {
        id: newLog.id,
        date: newLog.date,
        product_id: productId,
        product_name: productName,
        type,
        quantity,
        reason,
        user_id: userId,
        tenant_id: currentTenantId,
      };
      const { error } = await supabase.from('movement_log').insert(dbLog);
      if (error) console.error('Error logging movement to Supabase:', error);
    }

    setMovementLog(prev => [newLog, ...prev]);
  };

  const addProduct = async (product) => {
    const newProduct = {
      ...product,
      id: product.id || `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      stock: product.stock || 0,
      taxRate: product.taxRate || 0,
      tenant_id: currentTenantId,
    };

    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase.from('products').upsert(newProduct);
      if (error) {
        console.error('Error adding product to Supabase:', error);
        logError({ module: 'Inventory', action: 'Add Product', error_code: error.code, error_message: error.message, severity: 'High' });
        setSyncStatus('ERROR');
        addNotification(`Cloud Save Failed: ${error.message}`, 'error');
        return;
      }
      setSyncStatus('SYNCED');
      setLastSyncedAt(new Date().toISOString());
    }

    setProducts(prev => [...prev, newProduct]);
    if (newProduct.stock > 0) {
      logMovement(newProduct.id, newProduct.name, 'IN', newProduct.stock, 'Initial Stock', currentUser?.id);
    }
  };

  const updateProduct = async (updatedProduct) => {
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase.from('products').upsert({ ...updatedProduct, tenant_id: currentTenantId });
      if (error) {
        console.error('Error updating product in Supabase:', error);
        logError({ module: 'Inventory', action: 'Update Product', error_code: error.code, error_message: error.message, severity: 'Medium' });
        setSyncStatus('ERROR');
        addNotification(`Cloud Sync Failed: ${error.message}`, 'error');
        return;
      }
      setSyncStatus('SYNCED');
      setLastSyncedAt(new Date().toISOString());
    }
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const deleteProduct = async (id) => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', currentTenantId);
      if (error) {
        console.error('Error deleting product from Supabase:', error);
        logError({ module: 'Inventory', action: 'Delete Product', error_code: error.code, error_message: error.message, severity: 'Medium' });
        addNotification(`Cloud Delete Failed: ${error.message}`, 'error');
        return;
      }
    }
    setProducts(prev => prev.filter(p => p.id !== id));
    setMovementLog(prev => prev.filter(l => l.productId !== id));
  };

  // ── Product Category CRUD ─────────────────────────────────────────────────
  const addProductCategory = async (categoryName) => {
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { data, error } = await supabase
        .from('product_categories')
        .insert({ name: categoryName, tenant_id: currentTenantId })
        .select();
      if (error) {
        console.error('Error adding category:', error);
        setSyncStatus('ERROR');
        addNotification('Failed to add category: ' + error.message, 'error');
        return null;
      }
      setProductCategories(prev => [...prev, data[0]]);
      setSyncStatus('SYNCED');
      return data[0];
    }
    const newCat = { id: generateUUID(), name: categoryName };
    setProductCategories(prev => [...prev, newCat]);
    return newCat;
  };

  const updateProductCategory = async (updatedCategory) => {
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase
        .from('product_categories')
        .update({ name: updatedCategory.name })
        .eq('id', updatedCategory.id)
        .eq('tenant_id', currentTenantId);
      if (error) {
        setSyncStatus('ERROR');
        addNotification('Failed to update category: ' + error.message, 'error');
        return;
      }
      setSyncStatus('SYNCED');
    }
    setProductCategories(prev => prev.map(c => c.id === updatedCategory.id ? updatedCategory : c));
  };

  const deleteProductCategory = async (categoryId) => {
    if (isSupabaseConfigured) {
      setSyncStatus('SYNCING');
      const { error } = await supabase
        .from('product_categories')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', categoryId)
        .eq('tenant_id', currentTenantId);
      if (error) {
        setSyncStatus('ERROR');
        addNotification('Failed to delete category: ' + error.message, 'error');
        return false;
      }
      setSyncStatus('SYNCED');
    }
    setProductCategories(prev => prev.filter(c => c.id !== categoryId));
    return true;
  };

  // ── Vehicle CRUD ──────────────────────────────────────────────────────────
  const addVehicle = async (vehicle) => {
    const newVehicle = { ...vehicle, id: vehicle.id || `VH-${Date.now()}`, tenant_id: currentTenantId };
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('vehicles').upsert(newVehicle);
      if (error) {
        console.error('Error adding vehicle to Supabase:', error);
        addNotification(`Cloud Sync Failed: ${error.message}`, 'error');
        return;
      }
    }
    setVehicles(prev => [...prev, newVehicle]);
    addNotification(`${vehicle.name} registered and synced`, 'success');
  };

  const updateVehicle = async (updated) => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('vehicles').upsert({ ...updated, tenant_id: currentTenantId });
      if (error) {
        console.error('Error updating vehicle in Supabase:', error);
        addNotification(`Cloud Sync Failed: ${error.message}`, 'error');
        return;
      }
    }
    setVehicles(prev => prev.map(v => v.id === updated.id ? updated : v));
  };

  const deleteVehicle = async (vehicleId) => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('vehicles').update({ deleted_at: new Date().toISOString() }).eq('id', vehicleId).eq('tenant_id', currentTenantId);
      if (error) {
        console.error('Error deleting vehicle from Supabase:', error);
      }
    }
    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
    addNotification('Vehicle clearance revoked', 'success');
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
    transferStock,
    logMovement,
    addProduct,
    updateProduct,
    deleteProduct,
    addProductCategory,
    updateProductCategory,
    deleteProductCategory,
    addVehicle,
    updateVehicle,
    deleteVehicle,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};
