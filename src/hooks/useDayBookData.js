// Day Book data — date-scoped + narrow columns.
//
// The Day Book shows ONE day. The shared useFinance/useSales hooks fetch the
// last 500 rows of every table (+ big jsonb) and are consumed by many pages, so
// we don't touch them. This hook fetches only the selected day's rows with only
// the columns the ledger needs — server-side filtered (`.eq('date', …)`) so the
// payload is a single day, not 500 rows. The day_book table itself is small and
// fetched in full (needed for opening-balance lookups + previous-day closing).
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithCache } from '../lib/offline/hookAdapter';
import { supabase } from '../lib/supabase';
import useRefetchOnFocus from './useRefetchOnFocus';

const ALL_STORES = '00000000-0000-0000-0000-000000000000';

// Narrow column lists — only what DayBook's ledger reads.
// updated_at is needed to tell money taken at the counter from money a later
// settlement wrote back onto the sale. Without it the DayBook credits a
// settlement to the day of the sale rather than the day it was received.
const SEL_SALES    = 'id, tenant_id, deleted_at, date, totalAmount, paidAmount, paymentStatus, paymentMethod, location_id, created_at, updated_at, customerInfo, items';
const SEL_EXPENSE  = 'id, tenant_id, deleted_at, date, amount, payment_method, category, note, created_at, location_id';
const SEL_PURCHASE = 'id, tenant_id, deleted_at, date, total_amount, paid_amount, payment_type, created_at';
const SEL_CLIENTPAY = 'id, tenant_id, deleted_at, date, amount, payment_method, notes, created_at';
const SEL_SUPPLIERPAY = 'id, tenant_id, deleted_at, date, amount, payment_method, purchase_id, supplier_name, supplier_id, created_at';

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
      // Reads go through the offline cache on desktop. Without this the DayBook
      // was blank with no network -- the same gap that showed Cash Balance as
      // zero: writes queued, reads did not.
      //
      // The cache holds whole tables, so the filters the query applied
      // server-side have to be applied again to whatever comes back. Getting
      // this wrong would show another day's takings under today's date.
      // Every SEL_ above must carry tenant_id and deleted_at, because this
      // filters on them. When they were missing the comparison was against
      // undefined, every row was discarded, and the DayBook showed "no
      // transactions" on days that had them -- 7 Aug had 2 sales and 3 supplier
      // payments and rendered empty. Guarded by a test.
      const forDay = (rows) => (rows || []).filter(r =>
        r && r.tenant_id === tenantId
          && String(r.date || '').slice(0, 10) === selectedDate
          && !r.deleted_at);

      const [sRes, eRes, pRes, cpRes, spRes] = await Promise.all([
        fetchWithCache('sales', () => supabase.from('sales').select(SEL_SALES).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate)),
        fetchWithCache('expenses', () => supabase.from('expenses').select(SEL_EXPENSE).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate)),
        fetchWithCache('purchases', () => supabase.from('purchases').select(SEL_PURCHASE).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate)),
        fetchWithCache('client_payments', () => supabase.from('client_payments').select(SEL_CLIENTPAY).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate)),
        fetchWithCache('supplier_payments', () => supabase.from('supplier_payments').select(SEL_SUPPLIERPAY).eq('tenant_id', tenantId).eq('date', selectedDate).is('deleted_at', null)),
      ]);
      setSales(forDay(sRes.data));
      setExpenses(forDay(eRes.data));
      setPurchases(forDay(pRes.data));
      setClientPayments(forDay(cpRes.data));
      setSupplierPayments(forDay(spRes.data));
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
