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
// Sale receipts, by the day the money actually arrived.
// A sale row is dated when the BILL was raised, so money collected later
// against an older bill is not in this day's sales at all — while the sale's
// own day counts the whole paidAmount, later collections included. The ledger
// carries one row per payment event with its own date, so it is the only
// source that answers "what came in today". Restricted to ref_type=SALE:
// client payments reach the drawer through their own table below, and reading
// both would count them twice.
// ref_type is selected because it is FILTERED on: fetchWithCache replays the
// query's filters against cached rows, so a column it filters by but does not
// select silently matches nothing offline (selectFilterAgreement.test.js).
const SEL_SALETXN = 'id, tenant_id, date, direction, amount, mode, ref_type, ref_id, note, location_id';

export function useDayBookData(tenantId, selectedDate) {
  const [sales, setSales]                     = useState([]);
  const [expenses, setExpenses]               = useState([]);
  const [purchases, setPurchases]             = useState([]);
  const [clientPayments, setClientPayments]   = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [saleReceipts, setSaleReceipts]       = useState([]); // ledger rows for sales, by day received
  const [dayBook, setDayBook]                 = useState([]); // day_book records (for lookups)
  const [loading, setLoading]                 = useState(false);
  const fetchRef = useRef(null);
  const firstLoad = useRef(true);

  // day_book records — small table, fetched in full for opening/closing lookups.
  const fetchDayBookRecords = useCallback(async () => {
    if (!tenantId) return;
    // day_book has a deleted_at and neither read honoured it, so a deleted day
    // stayed in the ledger and went on supplying its opening balance — the
    // delete looked like it worked and changed nothing.
    const { data } = await supabase
      .from('day_book').select('*').eq('tenant_id', tenantId)
      .is('deleted_at', null)
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

      const [sRes, eRes, pRes, cpRes, spRes, stRes] = await Promise.all([
        fetchWithCache('sales', () => supabase.from('sales').select(SEL_SALES).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate)),
        fetchWithCache('expenses', () => supabase.from('expenses').select(SEL_EXPENSE).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate)),
        fetchWithCache('purchases', () => supabase.from('purchases').select(SEL_PURCHASE).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate)),
        fetchWithCache('client_payments', () => supabase.from('client_payments').select(SEL_CLIENTPAY).is('deleted_at', null).eq('tenant_id', tenantId).eq('date', selectedDate)),
        fetchWithCache('supplier_payments', () => supabase.from('supplier_payments').select(SEL_SUPPLIERPAY).eq('tenant_id', tenantId).eq('date', selectedDate).is('deleted_at', null)),
        fetchWithCache('account_transactions', () => supabase.from('account_transactions').select(SEL_SALETXN).eq('tenant_id', tenantId).eq('date', selectedDate).eq('ref_type', 'SALE')),
      ]);
      setSales(forDay(sRes.data));
      setExpenses(forDay(eRes.data));
      setPurchases(forDay(pRes.data));
      setClientPayments(forDay(cpRes.data));
      setSupplierPayments(forDay(spRes.data));
      setSaleReceipts((stRes.data || []).filter(r => r.date === selectedDate));
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
    sales, expenses, purchases, clientPayments, supplierPayments, saleReceipts, dayBook,
    loading,
    refetch: fetchDay,
    updateDayBook, getDayBookForDate, getPrevDayBook,
  };
}
