// R2 Table POS — restaurant floor tables + per-table running tabs.
//
// restaurant_tables: the physical tables (label/section/seats).
// table_orders: at most one OPEN tab per table (cart jsonb), settled into a
// sale when the guest pays.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useTables(tenantId) {
  const [tables, setTables] = useState([]);
  const [openTabs, setOpenTabs] = useState({}); // table_id -> tab row
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data: t, error: te }, { data: o, error: oe }] = await Promise.all([
        supabase.from('restaurant_tables').select('*')
          .eq('tenant_id', tenantId).is('deleted_at', null)
          .order('sort').order('created_at'),
        supabase.from('table_orders').select('*')
          .eq('tenant_id', tenantId).eq('status', 'OPEN'),
      ]);
      if (te) throw te;
      if (oe) throw oe;
      setTables(t || []);
      const map = {};
      (o || []).forEach(row => { map[row.table_id] = row; });
      setOpenTabs(map);
      setError(null);
    } catch (err) {
      console.error('[useTables] fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Table CRUD ───────────────────────────────────────────────
  const addTable = async ({ label, section = null, seats = 4 }) => {
    const sort = tables.length;
    const { error: e } = await supabase.from('restaurant_tables')
      .insert({ tenant_id: tenantId, label, section, seats, sort });
    if (!e) await fetchAll();
    return { error: e };
  };

  const deleteTable = async (id) => {
    const { error: e } = await supabase.from('restaurant_tables')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', tenantId);
    if (!e) await fetchAll();
    return { error: e };
  };

  // ── Tab lifecycle ────────────────────────────────────────────
  // Get the open tab for a table, creating one if none exists.
  const openTab = async (tableId) => {
    const existing = openTabs[tableId];
    if (existing) return { data: existing, error: null };
    const { data, error: e } = await supabase.from('table_orders')
      .insert({ tenant_id: tenantId, table_id: tableId, status: 'OPEN', cart: [] })
      .select().single();
    if (!e && data) setOpenTabs(prev => ({ ...prev, [tableId]: data }));
    return { data, error: e };
  };

  // Persist the cart on an open tab (called as the order is built).
  const saveTab = async (tabId, cart, extra = {}) => {
    const { error: e } = await supabase.from('table_orders')
      .update({ cart, ...extra }).eq('id', tabId).eq('tenant_id', tenantId);
    if (!e) {
      setOpenTabs(prev => {
        const next = { ...prev };
        for (const k in next) if (next[k].id === tabId) next[k] = { ...next[k], cart, ...extra };
        return next;
      });
    }
    return { error: e };
  };

  // Close a tab once it's been settled into a sale.
  const settleTab = async (tabId, saleId) => {
    const { error: e } = await supabase.from('table_orders')
      .update({ status: 'SETTLED', sale_id: saleId, settled_at: new Date().toISOString() })
      .eq('id', tabId).eq('tenant_id', tenantId);
    if (!e) await fetchAll();
    return { error: e };
  };

  const voidTab = async (tabId) => {
    const { error: e } = await supabase.from('table_orders')
      .update({ status: 'VOID', settled_at: new Date().toISOString() })
      .eq('id', tabId).eq('tenant_id', tenantId);
    if (!e) await fetchAll();
    return { error: e };
  };

  // Move an open tab to a different (free) table.
  const transferTab = async (tabId, toTableId) => {
    const { error: e } = await supabase.from('table_orders')
      .update({ table_id: toTableId }).eq('id', tabId).eq('tenant_id', tenantId);
    if (!e) await fetchAll();
    return { error: e };
  };

  // Total of a tab's cart (qty * price).
  const tabTotal = (tab) =>
    (tab?.cart || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);

  return {
    tables, openTabs, loading, error, refresh: fetchAll,
    addTable, deleteTable,
    openTab, saveTab, settleTab, voidTab, transferTab, tabTotal,
  };
}
