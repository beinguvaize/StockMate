/**
 * Day Book view logic (web redesign, approved mockups daybook-01 to 12).
 *
 * buildDayLedger is the page's ledger computation MOVED out of DayBook.jsx
 * unchanged, so it can be tested without opening the page. Every rule in it
 * (what counts as cash, what moves the drawer, the carried opening) is the
 * one the page used before the redesign; nothing here adds money maths.
 * The rest are display helpers: labels, tones, the history table's rows.
 */
import { receivedOnDay, carriedOpening, isBankMethod, saleReceiptsByMode } from './dayBook';
import { formatDate, formatTime, formatShortDateTime } from './utils';

export const ALL_STORES = '00000000-0000-0000-0000-000000000000';

const isCashM = (m) => (m || 'CASH').toUpperCase() === 'CASH';

/**
 * The selected day's ledger. Same inputs and same figures as the page's
 * former useMemo; `record` / `prevRecord` are the day_book rows the page
 * looked up with getDayBookForDate / getPrevDayBook.
 */
export function buildDayLedger({
  sales, expenses, clientPayments, purchases, supplierPayments, saleReceipts, dayBook,
  selectedDate, storeFilter = ALL_STORES, record, prevRecord,
}) {
  const storeMatch = (s) => storeFilter === ALL_STORES || (s.location_id || ALL_STORES) === storeFilter;
  const daySales      = (sales      || []).filter(s => s.date === selectedDate && storeMatch(s));
  const dayExpenses   = (expenses   || []).filter(e => e.date === selectedDate && storeMatch(e));
  const dayCollect    = (clientPayments || []).filter(p => p.date === selectedDate);
  const dayPurchases  = (purchases  || []).filter(p => p.date === selectedDate);
  // Supplier repayments: no location_id on the table, so business-wide.
  const daySupPays    = (supplierPayments || []).filter(p => p.date === selectedDate);

  // ── Receipts ──────────────────────────────────────────────────────────────
  const recv = receivedOnDay;
  // Sale receipts come from the ledger (account_transactions), by the day the
  // money arrived — see saleReceiptsByMode.
  const receipts    = saleReceiptsByMode((saleReceipts || []).filter(storeMatch));
  const cashSales   = receipts.cash;
  const bankSales   = receipts.bank;
  const creditSales = daySales.reduce((t, s) => t + Math.max(0, (Number(s.totalAmount) || 0) - recv(s)), 0);
  const creditPaid  = daySales.filter(s => (s.paymentMethod || '').toUpperCase() === 'CREDIT')
                              .reduce((t, s) => t + recv(s), 0);
  const cashCollect = dayCollect.filter(p => (p.payment_method || '').toUpperCase() === 'CASH')
                                .reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const bankCollect = dayCollect.filter(p => isBankMethod(p.payment_method))
                                .reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const cashIn       = cashSales + cashCollect + creditPaid;
  const bankIn       = bankSales + bankCollect;
  const totalReceipts = cashIn + bankIn;

  // ── Payments ──────────────────────────────────────────────────────────────
  const isCash = isCashM;
  const totalExpenses   = dayExpenses.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const cashExpenses    = dayExpenses.filter(e => isCash(e.payment_method))
    .reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const bankExpenses    = totalExpenses - cashExpenses;
  const cashPurchPaid   = dayPurchases
    .filter(p => (p.payment_type || 'CASH').toUpperCase() === 'CASH')
    .reduce((t, p) => t + (Number(p.total_amount) || 0), 0);
  const bankPurchPaid   = dayPurchases
    .filter(p => isBankMethod(p.payment_type))
    .reduce((t, p) => t + (Number(p.total_amount) || 0), 0);
  const cashSupPay      = daySupPays.filter(p => isCash(p.payment_method))
    .reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const bankSupPay      = daySupPays.filter(p => !isCash(p.payment_method))
    .reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const totalPurchPaid  = cashPurchPaid + bankPurchPaid + cashSupPay + bankSupPay;
  const cashOut        = cashExpenses + cashPurchPaid + cashSupPay;
  const totalPayments  = cashOut + bankPurchPaid + bankSupPay + bankExpenses;

  // ── Net cash movement per day (to carry a balance across unopened days) ──
  const netByDay = {};
  const bump = (d, v) => { const k = String(d || '').slice(0, 10); if (k) netByDay[k] = (netByDay[k] || 0) + v; };
  (sales || []).filter(storeMatch).forEach(s => {
    const m = (s.paymentMethod || '').toUpperCase();
    if (m === 'CASH' || m === 'CREDIT') bump(s.date, recv(s));
  });
  (clientPayments || []).filter(p => isCashM(p.payment_method)).forEach(p => bump(p.date, Number(p.amount) || 0));
  (expenses || []).filter(storeMatch).filter(e => isCashM(e.payment_method)).forEach(e => bump(e.date, -(Number(e.amount) || 0)));
  (purchases || []).filter(p => (p.payment_type || 'CASH').toUpperCase() === 'CASH')
    .forEach(p => bump(p.date, -(Number(p.total_amount) || 0)));
  (supplierPayments || []).filter(p => isCashM(p.payment_method))
    .forEach(p => bump(p.date, -(Number(p.amount) || 0)));

  const carried     = record?.id ? null : carriedOpening(selectedDate, dayBook || [], netByDay);
  const openingBal  = record?.id
    ? (Number(record.opening_balance) || 0)
    : (carried ? carried.opening : 0);
  const closingBal  = openingBal + cashIn - cashOut;
  const isLocked          = !!record?.is_closed;
  const closedAt          = record?.closed_at || null;
  const hasOpening        = !!record?.id;
  const savedPhysicalCash = record?.physical_cash != null ? Number(record.physical_cash) : null;
  const savedVariance     = record?.variance      != null ? Number(record.variance)      : null;

  // ── Transaction log ───────────────────────────────────────────────────────
  const entries = [
    ...daySales.map(s => {
      const tot = Number(s.totalAmount) || 0;
      const got = recv(s);
      const due = Math.max(0, tot - got);
      const items = s.items?.map(i => i.name || i.productName).filter(Boolean).slice(0, 3).join(', ') || '';
      return {
        id:        s.id,
        type:      (s.paymentMethod || '').toUpperCase() === 'CREDIT' ? 'CREDIT_SALE' : 'INCOME',
        category:  'Sale',
        title:     s.customerInfo?.name ? `Sale — ${s.customerInfo.name}` : 'Sale (Walk-in)',
        note:      due > 0 ? `${items}${items ? ' · ' : ''}Paid ${got} of ${tot} · due ${due}` : items,
        method:    s.paymentMethod || 'CASH',
        amount:    got,
        invoiceAmount: tot,
        createdAt: s.created_at || selectedDate,
      };
    }),
    ...dayCollect.map(p => ({
      id: p.id, type: 'INCOME', category: 'Collection', title: 'Client Collection',
      note: p.notes || '', method: p.payment_method || 'CASH',
      amount: Number(p.amount) || 0, createdAt: p.created_at || selectedDate,
    })),
    ...dayExpenses.map(e => ({
      id: e.id, type: 'EXPENSE', category: e.category || 'Expense', title: e.category || 'Expense',
      note: e.note || '', method: e.payment_method || 'CASH',
      amount: Number(e.amount) || 0, createdAt: e.created_at || selectedDate,
    })),
    ...dayPurchases.map(p => ({
      id: p.id, type: 'EXPENSE', category: 'Purchase', title: 'Purchase Payment',
      note: 'Supplier payment', method: p.payment_type || 'CASH',
      amount: Number(p.total_amount) || 0, createdAt: p.created_at || selectedDate,
    })),
    ...daySupPays.map(p => ({
      id: p.id, type: 'EXPENSE', category: 'Supplier Payment',
      title: p.supplier_name ? `Supplier — ${p.supplier_name}` : 'Supplier Payment',
      note: p.purchase_id ? 'Order settlement' : 'On-account',
      method: p.payment_method || 'CASH',
      amount: Number(p.amount) || 0, createdAt: p.created_at || selectedDate,
    })),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Running balance: the physical drawer only. `movesCash` says whether this
  // line changed it, so the table can draw the unchanged ones quietly.
  let running = openingBal;
  const entriesWithBal = entries.map(e => {
    const movesCash = e.type !== 'CREDIT_SALE' && isCash(e.method);
    if (movesCash) {
      running = e.type === 'INCOME' ? running + e.amount : running - e.amount;
    }
    return { ...e, runningBalance: running, movesCash };
  });

  return {
    openingBal, closingBal, isLocked, closedAt, hasOpening, carried,
    savedPhysicalCash, savedVariance,
    cashSales, bankSales, creditSales,
    cashCollect, bankCollect,
    cashIn, bankIn, cashOut, bankPurchPaid,
    cashExpenses, bankExpenses, cashSupPay, bankSupPay,
    totalReceipts, totalExpenses, cashPurchPaid, totalPurchPaid, totalPayments,
    entries: entriesWithBal,
    sales: daySales, expenses: dayExpenses, collect: dayCollect,
    txCount: entries.filter(e => e.type !== 'CREDIT_SALE').length,
    prevClosing: Number(prevRecord?.closing_balance) || null,
    expenseCount: dayExpenses.length,
    collectCount: dayCollect.length,
  };
}

/** Physical count minus book, to the paisa; null when nothing is entered. */
export function varianceOf(physical, closingBal) {
  if (physical === '' || physical == null) return null;
  return (parseFloat(physical) || 0) - closingBal;
}

/** How a count compares with the book: tone + words, as the page has always said them. */
export function varianceLook(v, { surplusWord = 'Cash Over' } = {}) {
  if (v == null) return null;
  if (Math.abs(v) < 0.01) return { tone: 'good', label: '✓ Balanced', exact: true };
  return v > 0 ? { tone: 'info', label: surplusWord, exact: false } : { tone: 'bad', label: 'Cash Short', exact: false };
}

/** The pills beside the date line (mockups 01, 02, 04, 06). */
export function dayPills({ isLocked, hasOpening, isFuture }) {
  const out = [];
  if (isLocked) out.push({ tone: 'good', label: 'Closed' });
  if (!hasOpening && !isFuture) out.push({ tone: 'warn', label: 'Opening not set' });
  if (isFuture) out.push({ tone: 'neutral', label: 'Future date' });
  return out;
}

/**
 * Method words, the page's existing mapping: CREDIT → Credit; BANK, UPI,
 * TRANSFER, NEFT, RTGS → UPI or Bank; anything else → Cash.
 */
export function methodLabel(method = '') {
  const m = String(method || '').toUpperCase();
  if (m === 'CREDIT') return 'Credit';
  if (['BANK', 'UPI', 'TRANSFER', 'NEFT', 'RTGS'].includes(m)) return m === 'UPI' ? 'UPI' : 'Bank';
  return 'Cash';
}

/** Type pill for a log line: money in is green, a credit sale blue, money out red. */
export function entryPill(e) {
  if (e.type === 'CREDIT_SALE') return { tone: 'info', label: 'Credit' };
  if (e.type === 'INCOME') return { tone: 'good', label: e.category };
  return { tone: 'bad', label: e.category };
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymdParts = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return { wd: WD[d.getUTCDay()], day: +m[3], mo: MO[+m[2] - 1], y: +m[1] };
};

/** "Thu 26 Nov 2026" for a YYYY-MM-DD shop day; `year: false` drops the year. */
export function dayLabel(s, { year = true } = {}) {
  const p = ymdParts(s);
  if (!p) return '';
  return `${p.wd} ${p.day} ${p.mo}${year ? ` ${p.y}` : ''}`;
}

/** "9:12 am" in the shop's time zone, '' for a date-only value. */
export const timeLabel = (v) => formatTime(v);

/** "25 Nov 2026, 9:42 pm" for when a day was closed. */
export function closedAtLabel(v) {
  if (!v || isNaN(new Date(v).getTime())) return '';
  const time = formatTime(v);
  return time ? `${formatDate(v)}, ${time}` : formatDate(v);
}

/** History strip: the same counts and sums the page showed. */
export function historySummary(dayBook = []) {
  const rows = dayBook || [];
  const totalSales = rows.reduce((s, r) => s + (Number(r.total_sales) || 0), 0);
  const totalExp = rows.reduce((s, r) => s + (Number(r.total_expenses) || 0), 0);
  return {
    totalDays: rows.length,
    closedDays: rows.filter(r => r.is_closed).length,
    totalSales,
    totalExp,
    net: totalSales - totalExp,
    discrepDays: rows.filter(r => r.variance != null && Math.abs(Number(r.variance)) >= 0.01).length,
    shortDays: rows.filter(r => r.variance != null && Number(r.variance) < -0.01).length,
  };
}

/**
 * History table rows, newest first. A figure the day_book row does not
 * hold (an open day has no totals until it is closed) is null, drawn "—".
 */
export function historyRows(dayBook = [], { today, selectedDate } = {}) {
  const n = (v) => (v == null ? null : Number(v) || 0);
  return [...(dayBook || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(rec => {
      const sales = n(rec.total_sales);
      const exp = n(rec.total_expenses);
      const variance = rec.variance != null ? Number(rec.variance) : null;
      return {
        key: rec.id || rec.date,
        date: rec.date,
        isToday: rec.date === today,
        isSelected: rec.date === selectedDate,
        isClosed: !!rec.is_closed,
        opening: n(rec.opening_balance),
        sales,
        expenses: exp,
        closing: n(rec.closing_balance),
        net: sales == null && exp == null ? null : (sales || 0) - (exp || 0),
        variance,
        hasDiscrep: variance != null && Math.abs(variance) >= 0.01,
        closedAt: rec.closed_at ? formatShortDateTime(rec.closed_at) : '',
      };
    });
}
