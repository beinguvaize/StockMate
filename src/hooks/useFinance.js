import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeNumericRows } from '../lib/numeric';

// Coerce Postgres `numeric` -> JS number at fetch boundary.
const EXPENSE_NUMERIC = ['amount', 'tax', 'total'];
const DAYBOOK_NUMERIC = ['opening_balance', 'closing_balance', 'total_sales', 'total_cash_in', 'total_expenses', 'total_cash_out'];

export const useFinance = (tenantId) => {
  const [expenses, setExpenses] = useState([]);
  const [dayBook, setDayBook] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFinanceData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        { data: expData, error: expErr },
        { data: dbData, error: dbErr }
      ] = await Promise.all([
        supabase.from('expenses').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(500),
        supabase.from('day_book').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(31)
      ]);

      if (expErr) throw expErr;
      if (dbErr) throw dbErr;

      setExpenses(normalizeNumericRows(expData, EXPENSE_NUMERIC));
      setDayBook(normalizeNumericRows(dbData, DAYBOOK_NUMERIC));
    } catch (err) {
      console.error("useFinance Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchFinanceData();
  }, [fetchFinanceData]);

  // Map camelCase form fields → snake_case DB columns
  const toDbRow = (expense) => {
    const { splitType, routeId, ...rest } = expense;
    return {
      ...rest,
      split_type: splitType ?? rest.split_type ?? null,
      route_id: routeId ?? rest.route_id ?? null,
    };
  };

  const addExpense = async (expense) => {
    const { error } = await supabase
      .from('expenses')
      .insert({ ...toDbRow(expense), tenant_id: tenantId });
    if (error) console.error('addExpense error:', error);
    else await fetchFinanceData();
    return { error };
  };

  const updateExpense = async (expense) => {
    const { id, ...data } = expense;
    const { error } = await supabase
      .from('expenses')
      .update(toDbRow(data))
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) console.error('updateExpense error:', error);
    else await fetchFinanceData();
    return { error };
  };

  const deleteExpense = async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id).eq('tenant_id', tenantId);
    if (!error) await fetchFinanceData();
    return { error };
  };

  const updateDayBook = async (record) => {
    const { error } = await supabase.from('day_book').upsert({ ...record, tenant_id: tenantId });
    if (!error) await fetchFinanceData();
    return { error };
  };

  const addExpenseCategory = async (category) => {
    // In this app, categories might be stored in the business_profile or a separate table.
    // Based on legacy, we'll just log it for now or update a local state if it's dynamic.
    console.log("Adding Category:", category);
    return { success: true };
  };

  const updateExpenseCategory = async (oldCat, newCat) => {
    console.log("Updating Category:", oldCat, "to", newCat);
    return { success: true };
  };

  const deleteExpenseCategory = async (category) => {
    console.log("Deleting Category:", category);
    return { success: true };
  };

  return { 
    expenses, 
    dayBook, 
    loading, 
    error, 
    refetch: fetchFinanceData, 
    addExpense, 
    updateExpense,
    deleteExpense,
    updateDayBook,
    getDayBookForDate: (date) => dayBook.find(db => db.date === date),
    expenseCategories: ['Petrol', 'Food', 'Salary', 'Rent', 'Utility', 'Purchase', 'Maintenance', 'Credit Card Payment', 'Delivery Charge', 'Other'],
    addExpenseCategory,
    updateExpenseCategory,
    deleteExpenseCategory
  };
};
