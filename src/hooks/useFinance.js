import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, restInsert, restUpdate } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';
import useRefetchOnFocus from './useRefetchOnFocus';
import { queueMutation, upsertCachedRow, isOfflineError, readCacheThenRevalidate } from '../lib/offline/hookAdapter';

const EXPENSE_NUMERIC       = ['amount'];
const DAYBOOK_NUMERIC       = ['opening_balance', 'closing_balance', 'total_sales', 'total_expenses'];
const CLIENT_PAYMENT_NUMERIC = ['amount'];
const PURCHASE_NUMERIC      = ['total_amount', 'paid_amount'];
const SUPPLIER_PAYMENT_NUMERIC = ['amount'];

export const useFinance = (tenantId) => {
  const [expenses,        setExpenses]       = useState([]);
  const [dayBook,         setDayBook]        = useState([]);
  const [clientPayments,  setClientPayments] = useState([]);
  const [purchases,       setPurchases]      = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [loading,         setLoading]        = useState(true);
  const [error,           setError]          = useState(null);
  const initialLoadDone = useRef(false);

  const fetchFinanceData = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    try {
      const [expCached, dbCached, cpCached, purCached] = await Promise.all([
        readCacheThenRevalidate(
          'expenses',
          () => supabase.from('expenses').select('*').is('deleted_at', null).eq('tenant_id', tenantId).order('date', { ascending: false }).limit(500),
          (rows) => setExpenses(normalizeNumericRows(rows, EXPENSE_NUMERIC)),
        ),
        readCacheThenRevalidate(
          'day_book',
          () => supabase.from('day_book').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(60),
          (rows) => setDayBook(normalizeNumericRows(rows, DAYBOOK_NUMERIC)),
        ),
        readCacheThenRevalidate(
          'client_payments',
          () => supabase.from('client_payments').select('id, amount, date, payment_method, notes, client_id, created_at').is('deleted_at', null).eq('tenant_id', tenantId).order('date', { ascending: false }).limit(500),
          (rows) => setClientPayments(normalizeNumericRows(rows, CLIENT_PAYMENT_NUMERIC)),
        ),
        readCacheThenRevalidate(
          'purchases',
          () => supabase.from('purchases').select('id, total_amount, paid_amount, payment_type, date, supplier_id, created_at').is('deleted_at', null).eq('tenant_id', tenantId).order('date', { ascending: false }).limit(500),
          (rows) => setPurchases(normalizeNumericRows(rows, PURCHASE_NUMERIC)),
        ),
      ]);

      setExpenses(normalizeNumericRows(expCached, EXPENSE_NUMERIC));
      setDayBook(normalizeNumericRows(dbCached, DAYBOOK_NUMERIC));
      setClientPayments(normalizeNumericRows(cpCached, CLIENT_PAYMENT_NUMERIC));
      setPurchases(normalizeNumericRows(purCached, PURCHASE_NUMERIC));

      // Cache reads done — render immediately, remaining fetches run in background.
      setLoading(false);
      initialLoadDone.current = true;

      // Supplier payments — cache-first so Day Book shows correct cash flows offline.
      readCacheThenRevalidate(
        'supplier_payments',
        () => supabase.from('supplier_payments')
          .select('id, supplier_id, supplier_name, amount, payment_method, date, purchase_id, created_at')
          .eq('tenant_id', tenantId).is('deleted_at', null)
          .order('date', { ascending: false }).limit(500),
        (rows) => setSupplierPayments(normalizeNumericRows(rows, SUPPLIER_PAYMENT_NUMERIC)),
      ).then(cached => setSupplierPayments(normalizeNumericRows(cached, SUPPLIER_PAYMENT_NUMERIC)));

      // Recurring templates + settings: online-only, non-blocking.
      supabase.from('recurring_expense_templates')
        .select('*').eq('tenant_id', tenantId).is('deleted_at', null)
        .order('created_at', { ascending: false })
        .then(({ data: tpls }) => setRecurringTemplates(normalizeNumericRows(tpls || [], EXPENSE_NUMERIC)));

      supabase.from('settings').select('value')
        .eq('key', 'expense_categories').eq('tenant_id', tenantId).maybeSingle()
        .then(({ data: catSetting }) => {
          const arr = Array.isArray(catSetting?.value) ? catSetting.value : [];
          setCustomCategories(arr.filter(Boolean));
        });
    } catch (err) {
      console.error('useFinance error:', err);
      setError(err.message);
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [tenantId]);

  useEffect(() => { initialLoadDone.current = false; fetchFinanceData(); }, [fetchFinanceData]);

  useRefetchOnFocus(fetchFinanceData);

  // Map form fields → DB columns
  const toDbRow = (expense) => ({
    category: expense.category ?? null,
    amount:   expense.amount   ?? null,
    date:     expense.date     ?? null,
    note:     expense.note ?? expense.notes ?? expense.title ?? null,
    // How the expense was paid (CASH/UPI/BANK/CARD). Defaults to CASH so
    // older callers that don't send it stay valid.
    payment_method: (expense.payment_method ?? 'CASH'),
    // GST input-tax-credit capture (optional).
    gst_rate:     expense.gst_rate ?? null,
    gst_amount:   expense.gst_amount ?? 0,
    vendor_gstin: (expense.vendor_gstin ?? null) || null,
    // Store/till this expense was paid from. null = business-wide.
    location_id:  expense.location_id ?? null,
  });

  const addExpense = async (expense) => {
    const id = crypto.randomUUID();
    const row = { id, ...toDbRow(expense), tenant_id: tenantId };
    const { error } = await restInsert('expenses', row);
    if (!error) { await fetchFinanceData(); return { error: null }; }
    if (isOfflineError(error)) {
      try {
        await queueMutation({ table: 'expenses', type: 'insert', payload: row });
        await upsertCachedRow('expenses', row);
        setExpenses(prev => normalizeNumericRows([row, ...prev], EXPENSE_NUMERIC));
        return { error: null, queued: true };
      } catch (qErr) { console.error('addExpense queue error:', qErr); }
    }
    return { error };
  };

  const updateExpense = async (expense) => {
    const { id, ...data } = expense;
    const { error } = await restUpdate('expenses', toDbRow(data), { id, tenant_id: tenantId });
    if (!error) await fetchFinanceData();
    return { error };
  };

  const deleteExpense = async (id) => {
    const { error } = await restUpdate('expenses', { deleted_at: new Date().toISOString() }, { id, tenant_id: tenantId });
    if (!error) await fetchFinanceData();
    return { error };
  };

  // ── Custom expense categories ──────────────────────────────────────
  const DEFAULT_CATEGORIES = ['Petrol','Food','Salary','Rent','Utility','Purchase',
                              'Maintenance','Credit Card Payment','Delivery Charge','Other'];

  const saveCategories = async (list) => {
    const clean = Array.from(new Set(list.map(s => (s || '').trim()).filter(Boolean)));
    const { error } = await supabase.from('settings')
      .upsert({ key: 'expense_categories', value: clean, tenant_id: tenantId },
              { onConflict: 'key,tenant_id' });
    if (!error) setCustomCategories(clean);
    return { error };
  };
  const addExpenseCategory    = (name) => saveCategories([...customCategories, name]);
  const deleteExpenseCategory = (name) => saveCategories(customCategories.filter(c => c !== name));

  // ── Recurring expense templates ────────────────────────────────────
  const addRecurringTemplate = async (tpl) => {
    const row = {
      id: 'RET-' + (crypto.randomUUID?.() || Date.now().toString(36)),
      tenant_id:      tenantId,
      note:           tpl.note ?? null,
      amount:         tpl.amount,
      category:       tpl.category ?? 'Other',
      payment_method: tpl.payment_method ?? 'CASH',
      frequency:      'MONTHLY',
      day_of_month:   Math.min(Math.max(parseInt(tpl.day_of_month, 10) || 1, 1), 28),
      active:         true,
    };
    const { error } = await supabase.from('recurring_expense_templates').insert(row);
    if (!error) await fetchFinanceData();
    return { error };
  };

  const setRecurringActive = async (id, active) => {
    const { error } = await supabase
      .from('recurring_expense_templates').update({ active })
      .eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchFinanceData();
    return { error };
  };

  const deleteRecurringTemplate = async (id) => {
    // Soft delete so historical generated rows keep their back-link.
    const { error } = await supabase
      .from('recurring_expense_templates')
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchFinanceData();
    return { error };
  };

  // The all-zero UUID is the "All stores" aggregate drawer.
  const ALL_STORES = '00000000-0000-0000-0000-000000000000';

  const updateDayBook = async (record) => {
    const loc = record.location_id || ALL_STORES;
    const existing = dayBook.find(d => d.date === record.date && (d.location_id || ALL_STORES) === loc);
    const payload = {
      id: existing?.id || `DB-${record.date}-${loc.slice(0, 8)}-${tenantId}`.slice(0, 60),
      ...record,
      location_id: loc,
      tenant_id: tenantId,
    };
    const { error } = await supabase
      .from('day_book').upsert(payload, { onConflict: 'tenant_id,date,location_id' });
    if (!error) await fetchFinanceData();
    return { error };
  };

  return {
    expenses, dayBook, clientPayments, purchases, supplierPayments,
    loading, error,
    refetch:          fetchFinanceData,
    addExpense, updateExpense, deleteExpense,
    recurringTemplates,
    addRecurringTemplate, setRecurringActive, deleteRecurringTemplate,
    updateDayBook,
    getDayBookForDate: (date, locationId = ALL_STORES) =>
      dayBook.find(d => d.date === date && (d.location_id || ALL_STORES) === (locationId || ALL_STORES)),
    getPrevDayBook:    (date, locationId = ALL_STORES) => {
      const loc = locationId || ALL_STORES;
      const sorted = [...dayBook]
        .filter(d => (d.location_id || ALL_STORES) === loc)
        .sort((a, b) => b.date.localeCompare(a.date));
      return sorted.find(d => d.date < date) || null;
    },
    // Defaults + any custom categories the tenant added, deduped, with
    // "Other" kept last.
    expenseCategories: (() => {
      const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...customCategories]));
      return [...merged.filter(c => c !== 'Other'), 'Other'];
    })(),
    customCategories,
    addExpenseCategory, deleteExpenseCategory,
  };
};
