import React, { createContext, useContext, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { purchaseSchema } from '../lib/validation';
import { logError } from '../lib/errorLogger';
import { useTenant } from './TenantContext';
import { useSync } from './SyncContext';
import { useNotifications } from './NotificationContext';
import { useAuth } from './AuthContext';
import { useInventory } from './InventoryContext';

const PurchasesContext = createContext();

export const usePurchases = () => useContext(PurchasesContext);

export const PurchasesProvider = ({ children }) => {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const { currentTenantId } = useTenant();
  const { setSyncStatus } = useSync();
  const { addNotification } = useNotifications();
  const { currentUser } = useAuth();
  const { products, setProducts } = useInventory();

  // ---------- Purchases ----------
  const addPurchase = async (purchase) => {
    const val = purchaseSchema.safeParse(purchase);
    if (!val.success) {
      addNotification('Validation failed:' + val.error.errors[0].message, 'error');
      return false;
    }

    const newPurchase = {
      id: `PUR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      date: purchase.date || new Date().toISOString().split('T')[0],
      linked_product_id: purchase.linked_product_id || null,
      quantity: Number(purchase.quantity) || 0,
      unit_cost: Number(purchase.unit_cost) || 0,
      total_cost: (Number(purchase.quantity) || 0) * (Number(purchase.unit_cost) || 0),
      supplier_id: purchase.supplier_id || null,
      supplier_name: purchase.supplier_name || 'Unspecified',
      payment_type: purchase.payment_type || 'cash',
      notes: purchase.notes || '',
      created_at: new Date().toISOString(),
      tenant_id: currentTenantId,
    };

    if (isSupabaseConfigured) {
      const prevPurchases = [...purchases];
      const prevProducts = [...products];

      const { error: rpcError } = await supabase.rpc('process_purchase', {
        p_id: newPurchase.id,
        p_product_id: newPurchase.linked_product_id,
        p_quantity: newPurchase.quantity,
        p_total_amount: newPurchase.total_cost,
        p_supplier_id: newPurchase.supplier_id || newPurchase.supplier_name,
        p_payment_type: newPurchase.payment_type,
        p_date: newPurchase.date,
        p_notes: newPurchase.notes,
        p_user_id: currentUser?.id,
        p_tenant_id: currentTenantId,
      });

      if (rpcError) {
        console.error('❌ Atomic Purchase Failed:', rpcError);
        setPurchases(prevPurchases);
        setProducts(prevProducts);
        logError({
          module: 'Inventory',
          action: 'Add Purchase (Atomic)',
          error_code: rpcError.code,
          error_message: rpcError.message,
          severity: 'High',
        });
        addNotification(
          `Critical: Failed to sync purchase. Transaction reverted. ${rpcError.message}`,
          'error',
        );
        return false;
      }
    }

    setPurchases((prev) => [newPurchase, ...prev]);

    if (newPurchase.linked_product_id) {
      // ── Weighted Average Cost (WAC) recalculation ──
      // new_wac = (existing_stock × existing_cost + qty × unit_cost) / (existing_stock + qty)
      const product = products.find(p => p.id === newPurchase.linked_product_id);
      const existingStock = Number(product?.stock)      || 0;
      const existingCost  = Number(product?.costPrice)  || 0;
      const incomingQty   = Number(newPurchase.quantity) || 0;
      const incomingCost  = Number(newPurchase.unit_cost) || 0;
      const totalUnits    = existingStock + incomingQty;
      const newWAC = totalUnits > 0
        ? ((existingStock * existingCost) + (incomingQty * incomingCost)) / totalUnits
        : incomingCost;
      const roundedWAC = Math.round(newWAC * 100) / 100;

      // Persist WAC to DB (best-effort, non-blocking)
      if (isSupabaseConfigured) {
        supabase
          .from('products')
          .update({ cost_price: roundedWAC })
          .eq('id', newPurchase.linked_product_id)
          .eq('tenant_id', currentTenantId)
          .then(({ error }) => { if (error) console.warn('WAC update warn:', error.message); });
      }

      setProducts((prev) =>
        prev.map((p) =>
          p.id === newPurchase.linked_product_id
            ? { ...p, stock: totalUnits, costPrice: roundedWAC }
            : p,
        ),
      );
      addNotification(`Stock +${incomingQty} units · WAC ₹${roundedWAC.toFixed(2)}`, 'success');
    } else {
      addNotification('Purchase recorded', 'success');
    }

    return true;
  };

  // ---------- Suppliers ----------
  const addSupplier = async (supplier) => {
    const id = `SUP-${Date.now()}`;
    const newSupplier = {
      ...supplier,
      id,
      created_at: new Date().toISOString(),
      tenant_id: currentTenantId,
    };

    if (isSupabaseConfigured) {
      const dbSupplier = {
        id,
        name: supplier.name,
        contact_person: supplier.contact_person,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes || '',
        created_at: new Date().toISOString(),
        tenant_id: currentTenantId,
      };

      const { error } = await supabase.from('suppliers').insert(dbSupplier);
      if (error) {
        console.error('Error adding supplier:', error);
        logError({
          module: 'Suppliers',
          action: 'Add Supplier',
          error_code: error.code,
          error_message: error.message,
          severity: 'High',
        });
        addNotification('Failed to save supplier to cloud', 'error');
        return false;
      }
    }
    setSuppliers((prev) => [newSupplier, ...prev]);
    return true;
  };

  const updateSupplier = async (updatedSupplier) => {
    if (isSupabaseConfigured) {
      const dbSupplier = {
        name: updatedSupplier.name,
        contact_person: updatedSupplier.contact_person,
        phone: updatedSupplier.phone,
        email: updatedSupplier.email,
        address: updatedSupplier.address,
        notes: updatedSupplier.notes || '',
        tenant_id: currentTenantId,
      };

      const { error } = await supabase
        .from('suppliers')
        .update(dbSupplier)
        .eq('id', updatedSupplier.id)
        .eq('tenant_id', currentTenantId);

      if (error) {
        console.error('Error updating supplier:', error);
        logError({
          module: 'Suppliers',
          action: 'Update Supplier',
          error_code: error.code,
          error_message: error.message,
          severity: 'High',
        });
        addNotification(`Failed to update supplier: ${error.message}`, 'error');
        return false;
      }
    }
    setSuppliers((prev) =>
      prev.map((s) => (s.id === updatedSupplier.id ? { ...s, ...updatedSupplier } : s)),
    );
    return true;
  };

  const deleteSupplier = async (supplierId) => {
    console.log(`[Suppliers] Intent: Delete. ID: ${supplierId}, Tenant: ${currentTenantId}`);

    if (isSupabaseConfigured) {
      const { error, count } = await supabase
        .from('suppliers')
        .delete({ count: 'exact' })
        .eq('id', supplierId)
        .eq('tenant_id', currentTenantId);

      if (error) {
        console.error('❌ Supplier Deletion REJECTED:', error);
        logError({
          module: 'Suppliers',
          action: 'Delete Supplier',
          error_code: error.code,
          error_message: error.message,
          severity: 'High',
        });
        return { success: false, error: error.message };
      }

      if (count === 0) {
        console.warn(
          `[Suppliers] Silent Fail: Row not found or RLS blocked. ID: ${supplierId}`,
        );
        logError({
          module: 'Suppliers',
          action: 'Delete Supplier (Silent Fail)',
          error_code: 'ERR_ZERO_ROWS',
          error_message: `Database returned success but 0 rows were deleted. This usually means the row exists but RLS blocked the operation for Tenant: ${currentTenantId}`,
          severity: 'High',
        });
        return { success: false, error: 'Deletion blocked or record not found.' };
      }
    }

    setSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
    return { success: true };
  };

  const value = {
    purchases, setPurchases,
    suppliers, setSuppliers,
    addPurchase,
    addSupplier, updateSupplier, deleteSupplier,
  };

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
};
