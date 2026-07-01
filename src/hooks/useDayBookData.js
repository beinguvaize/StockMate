// Day Book data — date-scoped + narrow columns.
//
// The Day Book shows ONE day. The shared useFinance/useSales hooks fetch the
// last 500 rows of every table (+ big jsonb) and are consumed by many pages, so
// we don't touch them. This hook fetches only the selected day's rows with only
// the columns the ledger needs — server-side filtered (`.eq('date', …)`) so the
// payload is a single day, not 500 rows. The day_book table itself is small and
// fetched in full (needed for opening-balance lookups + previous-day closing).
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import useRefetchOnFocus from './useRefetchOnFocus';

const ALL_STORES = '00000000-0000-0000-0000-000000000000';

// Narrow column lists — only what DayBook's ledger reads.
const SEL_SALES    = 'id, date, totalAmount, paidAmount, paymentStatus, paymentMethod, location_id, created_at, customerInfo, items';
const SEL_EXPENSE  = 'id, date, amount, payment_method, category, note, created_at, location_id';
const SEL_PURCHASE = 'id, date, total_amount, paid_amount, payment_type, created_at';
const SEL_CLIENTPAY = 'id, date, amount, payment_method, notes, created_at';
const SEL_SUPPLIERPAY = 'id, date, amount, payment_method, purchase_id, supplier_name, supplier_id, created_at';

export function useDayBookData(tenantId, selectedDate) {
  const [sales, setSales]                     = useState([]);
  const [expenses, setExpenses]               = useState([]);
  const [purchases, setPurchases]             = useState([]);
  const [clientPayments, setClientPayments]   = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [dayBook, setDayBook]                 = useState([]); // day_book records (for lookups)
  const [loading, setLoading]                 = useState(false);
  const fetchRef = useRef(null);
  const firstLoad = useRef(true);

  // day_book records — small table, fetched in full for opening/closing lookups.
  const fetchDayBookRecords = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('day_book').select('*').eq('tenant_id', tenantId)
      .order('date', { ascending: false }).limit(90);
    setDayBook(data || []);
  }, [tenantId]);

  const fetchDay = useCallback(async () => {
    if (!tenantId || !selectedDate) { setLoading(false); return; }
    if (firstLoad.current) setLoading(true); // later date-changes refresh silently
    try {
      const [sRes, eRes, pRes, cpRes, spRes] = await Promise.all([
        supabase.from('sales').select(SEL_SALES).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate).is('deleted_at', null),
        supabase.from('expenses').select(SEL_EXPENSE).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate),
        supabase.from('purchases').select(SEL_PURCHASE).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate).is('deleted_at', null),
        supabase.from('client_payments').select(SEL_CLIENTPAY).eq('tenant_id', tenantId).eq('date', selectedDate),
        supabase.from('supplier_payments').select(SEL_SUPPLIERPAY).eq('tenant_id', tenantId).eq('date', selectedDate).is('deleted_at', null),
      ]);
      setSales(sRes.data || []);
      setExpenses(eRes.data || []);
      setPurchases(pRes.data || []);
      setClientPayments(cpRes.data || []);
      setSupplierPayments(spRes.data || []);
      await fetchDayBookRecords();
    } catch (err) {
      console.error('useDayBookData error:', err);
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [tenantId, selectedDate, fetchDayBookRecords]);

  fetchRef.current = fetchDay;
  useEffect(() => { fetchRef.current?.(); }, [tenantId, selectedDate]);
  useRefetchOnFocus(fetchDay);

  const getDayBookForDate = (date, locationId = ALL_STORES) =>
    dayBook.find(d => d.date === date && (d.location_id || ALL_STORES) === (locationId || ALL_STORES));

  const getPrevDayBook = (date, locationId = ALL_STORES) => {
    const loc = locationId || ALL_STORES;
    return [...dayBook]
      .filter(d => (d.location_id || ALL_STORES) === loc)
      .sort((a, b) => b.date.localeCompare(a.date))
      .find(d => d.date < date) || null;
  };

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
    if (!error) await fetchDayBookRecords();
    return { error };
  };

  return {
    sales, expenses, purchases, clientPayments, supplierPayments, dayBook,
    loading,
    refetch: fetchDay,
    updateDayBook, getDayBookForDate, getPrevDayBook,
  };
}
