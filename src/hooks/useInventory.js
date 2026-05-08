import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Postgres `numeric` arrives as string over the wire (supabase-js preserves
// precision). Mixing those with JS math causes subtle bugs: `0 + "100"` is
// `"0100"` (string concat), `Math.min("10",5)` coerces but silently, and
// `.toFixed` on strings throws outright. Coerce once at the fetch boundary
// so every caller sees clean numbers.
const NUMERIC_PRODUCT_COLS = ['costPrice', 'sellingPrice', 'stock', 'taxRate', 'mrp', 'discount', 'min_margin'];
const NUMERIC_BALANCE_COLS = ['quantity'];

const normalizeRow = (row, cols) => {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const col of cols) {
    if (out[col] != null) out[col] = Number(out[col]);
  }
  return out;
};

export const useInventory = (tenantId) => {
  const [products, setProducts] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [inventoryBalances, setInventoryBalances] = useState([]);
  const [inventoryLocations, setInventoryLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const MAIN_WAREHOUSE_ID = 'MAIN-WH';

  const fetchInventory = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const [
        { data: prodData, error: prodErr },
        { data: catData, error: catErr },
        { data: balData, error: balErr },
        { data: locData, error: locErr }
      ] = await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('product_categories').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('inventory_balances').select('*').eq('tenant_id', tenantId),
        supabase.from('inventory_locations').select('*').eq('tenant_id', tenantId).order('name')
      ]);

      if (prodErr) throw prodErr;
      if (catErr) throw catErr;
      if (balErr) throw balErr;
      if (locErr) throw locErr;

      setProducts((prodData || []).map(r => normalizeRow(r, NUMERIC_PRODUCT_COLS)));
      setProductCategories(catData || []);
      setInventoryBalances((balData || []).map(r => normalizeRow(r, NUMERIC_BALANCE_COLS)));
      setInventoryLocations(locData || []);
    } catch (err) {
      console.error("useInventory Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const add = async (product) => {
    const id = product.id || `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const { data: newProd, error } = await supabase
      .from('products')
      .insert({ ...product, id, tenant_id: tenantId })
      .select()
      .single();
    if (!error) fetchInventory().catch(e => console.error('add product refetch error:', e));
    return { data: newProd, error };
  };

  const update = async (id, updates) => {
    const { error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) fetchInventory().catch(e => console.error('update product refetch error:', e));
    return { error };
  };

  const remove = async (id) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) fetchInventory().catch(e => console.error('remove product refetch error:', e));
    return { error };
  };

  const adjustStock = async (productId, delta, reason, locationId) => {
    // Legacy support for AppContext RPC call logic
    const { error } = await supabase.rpc('adjust_inventory_atomic', {
      p_product_id: productId,
      p_location_id: locationId ?? null,
      p_amount:      delta,
      p_reason:      reason,
      p_user_id:     null,
      p_tenant_id:   tenantId
    });
    if (!error) await fetchInventory();
    return { error };
  };

  const transferStock = async (productId, fromLocId, toLocId, quantity) => {
    const { error } = await supabase.rpc('transfer_inventory_atomic', {
      p_product_id: productId,
      p_from_location_id: fromLocId,
      p_to_location_id: toLocId,
      p_qty: quantity,
      p_tenant_id: tenantId
    });
    if (!error) await fetchInventory();
    return { error };
  };

  const addProductCategory = async (name) => {
    const { data: newCat, error } = await supabase.from('product_categories').insert([{ name, tenant_id: tenantId }]).select().single();
    if (!error) await fetchInventory();
    return { data: newCat, error };
  };

  const updateProductCategory = async (cat) => {
    const { error } = await supabase.from('product_categories').update({ name: cat.name }).eq('id', cat.id).eq('tenant_id', tenantId);
    if (!error) await fetchInventory();
    return { error };
  };

  const deleteProductCategory = async (id) => {
    const { error } = await supabase.from('product_categories').delete().eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchInventory();
    return { error };
  };

  return { 
    products, 
    productCategories, 
    inventoryBalances, 
    inventoryLocations,
    MAIN_WAREHOUSE_ID,
    loading, 
    error, 
    refetch: fetchInventory, 
    addProduct: add, 
    updateProduct: update, 
    deleteProduct: remove,
    adjustStock,
    transferStock,
    addProductCategory,
    updateProductCategory,
    deleteProductCategory
  };
};
