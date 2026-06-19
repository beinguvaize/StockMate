import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import useRefetchOnFocus from './useRefetchOnFocus';
import { fetchWithCache, readCacheThenRevalidate } from '../lib/offline/hookAdapter';

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
  const tabId = useRef(Math.random().toString(36).slice(2, 8));
  const initialLoadDone = useRef(false);
  const fetchRef = useRef(null);

  const fetchInventory = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      // Cache-first: read every table from IDB synchronously, render
      // immediately, then revalidate in the background. The
      // onRefresh callbacks update state when fresh server data arrives.
      const [cachedProds, cachedCats, cachedBals, cachedLocs] = await Promise.all([
        readCacheThenRevalidate(
          'products',
          () => supabase.from('products').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('name'),
          (rows) => setProducts(rows.map(r => normalizeRow(r, NUMERIC_PRODUCT_COLS))),
        ),
        readCacheThenRevalidate(
          'product_categories',
          () => supabase.from('product_categories').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('name'),
          (rows) => setProductCategories(rows),
        ),
        readCacheThenRevalidate(
          'inventory_balances',
          () => supabase.from('inventory_balances').select('*').eq('tenant_id', tenantId),
          (rows) => setInventoryBalances(rows.map(r => normalizeRow(r, NUMERIC_BALANCE_COLS))),
        ),
        readCacheThenRevalidate(
          'inventory_locations',
          () => supabase.from('inventory_locations').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('name'),
          (rows) => setInventoryLocations(rows),
        ),
      ]);

      setProducts(cachedProds.map(r => normalizeRow(r, NUMERIC_PRODUCT_COLS)));
      setProductCategories(cachedCats);
      setInventoryBalances(cachedBals.map(r => normalizeRow(r, NUMERIC_BALANCE_COLS)));
      setInventoryLocations(cachedLocs);
    } catch (err) {
      console.error("useInventory Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [tenantId]);

  fetchRef.current = fetchInventory;

  useEffect(() => {
    initialLoadDone.current = false;
    fetchRef.current?.();
  }, [tenantId]);

  // Re-fetch when tab becomes visible after idle (handles stale data after lock-screen / sleep)
  useRefetchOnFocus(fetchInventory);

  // Auto-retry once after 4 s if initial fetch fails (handles DB cold-start)
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => { fetchRef.current?.(); }, 4000);
    return () => clearTimeout(t);
  }, [error]);

  // ── Realtime — products + inventory_balances ──────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`inventory-realtime-${tenantId}-${tabId.current}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'products',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'inventory_balances',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchRef.current?.())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  const add = async (product) => {
    const id = product.id || `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const { created_at: _ca, updated_at: _ua, ...safeProduct } = product;
    const row = { ...safeProduct, id, tenant_id: tenantId };
    // Plain insert — no .select().single() read-back. The post-insert SELECT
    // adds an RLS round-trip that can stall; we already refetch the list after.
    const { error } = await supabase.from('products').insert(row);
    if (!error) fetchInventory().catch(e => console.error('add product refetch error:', e));
    return { data: error ? null : row, error };
  };

  const update = async (id, updates) => {
    // Strip immutable / server-managed columns so Postgres never rejects the UPDATE
    const { id: _id, tenant_id: _tid, created_at: _ca, updated_at: _ua, ...safeUpdates } = updates;
    const { error } = await supabase
      .from('products')
      .update(safeUpdates)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) fetchInventory().catch(e => console.error('update product refetch error:', e));
    return { error };
  };

  const remove = async (id) => {
    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
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

  // ── Location (Branch) CRUD ────────────────────────────────────────────────
  const addLocation = async ({ name, type = 'BRANCH', address = '' }) => {
    const id = crypto.randomUUID();
    const { data, error } = await supabase
      .from('inventory_locations')
      .insert([{ id, name, type, address, tenant_id: tenantId }])
      .select()
      .single();
    if (!error) await fetchInventory();
    return { data, error };
  };

  const updateLocation = async ({ id, name, type, address }) => {
    const { error } = await supabase
      .from('inventory_locations')
      .update({ name, type, address })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (!error) await fetchInventory();
    return { error };
  };

  const deleteLocation = async (id) => {
    const MAIN = '00000000-0000-0000-0000-000000000001';
    if (id === MAIN) return { error: new Error('Cannot delete main warehouse.') };
    const { error } = await supabase
      .from('inventory_locations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
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
    const { error } = await supabase.from('product_categories').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId);
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
    deleteProductCategory,
    addLocation,
    updateLocation,
    deleteLocation,
  };
};
