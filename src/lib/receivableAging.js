/**
 * How old is the money customers owe.
 *
 * Rows come from get_unpaid_sales, the one definition of what is owed on a
 * sale. Bills carry no due dates here (invoices.due_date is empty on every
 * row), so this ages from the sale date and says "unpaid for", never
 * "overdue": nothing tells us what was agreed.
 */

export const AGE_BUCKETS = ['0-30', '31-60', '61-90', '91-120', '120+'];

const r2 = (n) => Math.round(n * 100) / 100;
const dayNo = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };

export const daysUnpaid = (saleDate, today) => Math.max(0, Math.round(dayNo(today) - dayNo(saleDate)));

export function ageBucket(days) {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  if (days <= 120) return '91-120';
  return '120+';
}

const emptyBuckets = () => Object.fromEntries(AGE_BUCKETS.map((b) => [b, 0]));

/**
 * @param unpaid  rows from get_unpaid_sales
 * @param clients the shop's clients, for the tie-out to outstanding_balance
 * @returns bills, per-customer rows, bucket totals, and the tie-out
 */
export function buildAging(unpaid, clients, today) {
  const bills = (unpaid || []).map((s) => {
    const days = daysUnpaid(s.sale_date, today);
    return { ...s, unpaid: r2(Number(s.unpaid) || 0), days_unpaid: days, bucket: ageBucket(days) };
  }).sort((a, b) => b.days_unpaid - a.days_unpaid);

  const byClient = new Map();
  const totals = emptyBuckets();
  let total = 0;
  for (const b of bills) {
    const key = b.client_id || `name:${b.client_name}`;
    if (!byClient.has(key)) {
      byClient.set(key, { client_id: b.client_id, client_name: b.client_name, phone: b.phone || '', total: 0, bills: 0, oldest: 0, ...emptyBuckets() });
    }
    const c = byClient.get(key);
    c[b.bucket] = r2(c[b.bucket] + b.unpaid);
    c.total = r2(c.total + b.unpaid);
    c.bills += 1;
    c.oldest = Math.max(c.oldest, b.days_unpaid);
    totals[b.bucket] = r2(totals[b.bucket] + b.unpaid);
    total = r2(total + b.unpaid);
  }

  const outstanding = r2((clients || []).reduce((s, c) => s + (Number(c.outstanding_balance) || 0), 0));
  return {
    bills,
    customers: [...byClient.values()].sort((a, b) => b.total - a.total),
    totals,
    total,
    over30: r2(total - totals['0-30']),
    over90: r2(totals['91-120'] + totals['120+']),
    outstanding,
    // Shown, never hidden: customer credit, a balance out of step with its
    // sales, or a sale with no customer on it.
    difference: r2(total - outstanding),
  };
}
