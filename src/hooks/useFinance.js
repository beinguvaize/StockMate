import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';
import useRefetchOnFocus from './useRefetchOnFocus';
import { queueMutation, upsertCachedRow, isOfflineError } from '../lib/offline/hookAdapter';

const EXPENSE_NUMERIC       = ['amount'];
const DAYBOOK_NUMERIC       = ['opening_balance', 'closing_balance', 'total_sales', 'total_expenses'];
const CLIENT_PAYMENT_NUMERIC = ['amount'];
const PURCHASE_NUMERIC      = ['total_amount'];

export const useFinance = (tenantId) => {
  const [expenses,        setExpenses]       = useState([]);
  const [dayBook,         setDayBook]        = useState([]);
  const [clientPayments,  setClientPayments] = useState([]);
  const [purchases,       setPurchases]      = useState([]);
  const [loading,         setLoading]        = useState(true);
  const [error,           setError]          = useState(null);
  const initialLoadDone = useRef(false);

  const fetchFinanceData = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    if (!initialLoadDone.current) setLoading(true);
    try {
      const [
        { data: expData,  error: expErr  },
        { data: dbData,   error: dbErr   },
        { data: cpData,   error: cpErr   },
        { data: purData,  error: purErr  },
      ] = await Promise.all([
        supabase.from('expenses')
          .select('*').eq('tenant_id', tenantId)
          .order('date', { ascending: false }).limit(500),
        supabase.from('day_book')
          .select('*').eq('tenant_id', tenantId)
          .order('date', { ascending: false }).limit(60),
        // Client collections — cash/bank payments received from debtors
        supabase.from('client_payments')
          .select('id, amount, date, payment_method, notes, client_id, created_at')
          .eq('tenant_id', tenantId)
          .order('date', { ascending: false }).limit(500),
        // All purchases — filtered by payment_type in DayBook for cash-only closing
        supabase.from('purchases')
          .select('id, total_amount, payment_type, date, supplier_id, created_at')
          .eq('tenant_id', tenantId)
          .order('date', { ascending: false }).limit(500),
      ]);

      if (expErr) throw expErr;
      if (dbErr)  throw dbErr;
      if (cpErr)  console.warn('client_payments fetch warn:', cpErr);
      if (purErr) console.warn('purchases fetch warn:', purErr);

      setExpenses(normalizeNumericRows(expData || [], EXPENSE_NUMERIC));
      setDayBook(normalizeNumericRows(dbData   || [], DAYBOOK_NUMERIC));
      setClientPayments(normalizeNumericRows(cpData  || [], CLIENT_PAYMENT_NUMERIC));
      setPurchases(normalizeNumericRows(purData  || [], PURCHASE_NUMERIC));
    } catch (err) {
      console.error('useFinance error:', err);
      setError(err.message);
    } finally {
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
  });

  const addExpense = async (expense) => {
    const id = crypto.randomUUID();
    const row = { id, ...toDbRow(expense), tenant_id: tenantId };
    const { error } = await supabase.from('expenses').insert(row);
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
    const { error } = await supabase
      .from('expenses').update(toDbRow(data)).eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchFinanceData();
    return { error };
  };

  const deleteExpense = async (id) => {
    const { error } = await supabase
      .from('expenses').delete().eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchFinanceData();
    return { error };
  };

  const updateDayBook = async (record) => {
    const existing = dayBook.find(d => d.date === record.date);
    const payload = {
      id: existing?.id || `DB-${record.date}-${tenantId}`.slice(0, 40),
      ...record,
      tenant_id: tenantId,
    };
    const { error } = await supabase
      .from('day_book').upsert(payload, { onConflict: 'tenant_id,date' });
    if (!error) await fetchFinanceData();
    return { error };
  };

  return {
    expenses, dayBook, clientPayments, purchases,
    loading, error,
    refetch:          fetchFinanceData,
    addExpense, updateExpense, deleteExpense,
    updateDayBook,
    getDayBookForDate: (date) => dayBook.find(d => d.date === date),
    getPrevDayBook:    (date) => {
      const sorted = [...dayBook].sort((a, b) => b.date.localeCompare(a.date));
      return sorted.find(d => d.date < date) || null;
    },
    expenseCategories: ['Petrol','Food','Salary','Rent','Utility','Purchase',
                        'Maintenance','Credit Card Payment','Delivery Charge','Other'],
  };
};
