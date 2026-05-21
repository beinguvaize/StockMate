import React, { createContext, useContext, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { expenseSchema, dayBookSchema } from '../lib/validation';
import { generateUUID } from '../lib/utils';
import { useTenant } from './TenantContext';
import { useSync } from './SyncContext';
import { useNotifications } from './NotificationContext';
import { INITIAL_EXPENSE_CATEGORIES } from '../lib/constants';

const FinanceContext = createContext();

export const useFinance = () => useContext(FinanceContext);

export const FinanceProvider = ({ children }) => {
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState(INITIAL_EXPENSE_CATEGORIES);
  const [dayBook, setDayBook] = useState([]);

  const { currentTenantId } = useTenant();
  const { setSyncStatus, setLastSyncedAt } = useSync();
  const { addNotification } = useNotifications();

  // ---------- Expenses ----------
  const addExpense = async (expense) => {
    const val = expenseSchema.safeParse(expense);
    if (!val.success) {
      addNotification('Validation failed:' + val.error.issues?.[0]?.message, 'error');
      return;
    }
    const { title, date, routeId, splitType, notes, ...restExpense } = expense;
    const newExpense = {
      ...restExpense,
      id: expense.id || `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      date: date || new Date().toISOString(),
      route_id: routeId,
      split_type: splitType || null,
      note: title || notes || '',
      tenant_id: currentTenantId,
    };

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('expenses').upsert(newExpense);
      if (error) {
        console.error('Error adding expense to Supabase:', error);
        setSyncStatus('ERROR');
        addNotification(`Cloud Sync Failed: ${error.message}`, "error");
        return; // STOP
      }
      setSyncStatus('SYNCED');
      setLastSyncedAt(new Date().toISOString());
    }

    setExpenses((prev) => [newExpense, ...prev]);
    addNotification(`Expense recorded: ${expense.amount}`, 'expense');
  };

  const updateExpense = async (updatedExpense) => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('expenses').upsert(updatedExpense);
      if (error) {
        console.error('Error updating expense in Supabase:', error);
        setSyncStatus('ERROR');
        addNotification(`Update failed: ${error.message}`, "error");
        return; // STOP
      }
      setSyncStatus('SYNCED');
      setLastSyncedAt(new Date().toISOString());
    }
    setExpenses((prev) => prev.map((e) => (e.id === updatedExpense.id ? updatedExpense : e)));
    addNotification(`Expense updated: ${updatedExpense.amount}`, 'success');
  };

  const deleteExpense = async (expenseId) => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
      if (error) {
        console.error('Error deleting expense from Supabase:', error);
        setSyncStatus('ERROR');
        addNotification(`Delete failed: ${error.message}`, "error");
        return; // STOP
      }
      setSyncStatus('SYNCED');
      setLastSyncedAt(new Date().toISOString());
    }
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    addNotification('Expense record removed', 'success');
  };

  // ---------- Expense Categories ----------
  const addExpenseCategory = async (name) => {
    if (!name || expenseCategories.includes(name)) return;
    const newCategories = [...expenseCategories, name];

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'expense_categories', value: newCategories, tenant_id: currentTenantId });
      if (error) {
        console.error('Error adding expense category to Supabase:', error);
        addNotification(`Category sync failed: ${error.message}`, "error");
        return; // STOP
      }
    }

    setExpenseCategories(newCategories);
    addNotification(`Category added: ${name}`, 'success');
  };

  const updateExpenseCategory = async (oldName, newName) => {
    if (!newName || expenseCategories.includes(newName)) return;
    const newCategories = expenseCategories.map((c) => (c === oldName ? newName : c));

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'expense_categories', value: newCategories, tenant_id: currentTenantId });
      if (error) {
        console.error('Error updating expense category in Supabase:', error);
        addNotification(`Category sync failed: ${error.message}`, "error");
        return; // STOP
      }
    }

    setExpenseCategories(newCategories);
    setExpenses((prev) =>
      prev.map((e) => (e.category === oldName ? { ...e, category: newName } : e)),
    );
    addNotification(`Category updated: ${newName}`, 'success');
  };

  const deleteExpenseCategory = async (name) => {
    const newCategories = expenseCategories.filter((c) => c !== name);

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'expense_categories', value: newCategories, tenant_id: currentTenantId });
      if (error) {
        console.error('Error deleting expense category from Supabase:', error);
        addNotification('Failed to delete category from cloud', 'error');
        return;
      }
    }

    setExpenseCategories(newCategories);
    addNotification(`Category removed: ${name}`, 'success');
  };

  // ---------- Day Book ----------
  const updateDayBook = async (record) => {
    const val = dayBookSchema.safeParse(record);
    if (!val.success) {
      addNotification('Validation failed:' + val.error.issues?.[0]?.message, 'error');
      return null;
    }
    const payload = {
      ...record,
      id: record.id || generateUUID(),
      created_at: record.created_at || new Date().toISOString(),
      tenant_id: currentTenantId,
    };
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('day_book').upsert(payload);
      if (error) {
        console.error('Error updating Day Book in Supabase:', error);
        addNotification('Failed to sync Day Book to cloud', 'error');
        return null;
      }
    }

    setDayBook((prev) => {
      const exists = prev.find((db) => db.date === payload.date);
      if (exists) return prev.map((db) => (db.date === payload.date ? payload : db));
      return [payload, ...prev];
    });
    return payload.id;
  };

  const getDayBookForDate = (date) => dayBook.find((db) => db.date === date);

  const value = {
    expenses, setExpenses,
    expenseCategories, setExpenseCategories,
    dayBook, setDayBook,
    addExpense, updateExpense, deleteExpense,
    addExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
    updateDayBook, getDayBookForDate,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};
