import React from 'react';
import { useDialogClose } from '../../hooks/useDialogClose';
import { X, Printer, ChevronLeft, FileText } from 'lucide-react';
import { parseLocalDate } from '../../lib/utils';
import { Button } from '../ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import { Tile, Tiles } from '../daybook/parts';

const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "Thursday, 26 November 2026" for a YYYY-MM-DD shop day.
const longDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/**
 * Daily Financial Ledger (mockup daybook-08): a paper sheet over the page.
 * Its figures are computed exactly as before the redesign (from the day's
 * sales and expenses only); see the report notes on what that leaves out.
 */
const DailyLedgerDetail = ({
  date,
  openingBalance = 0,
  closingBalance = 0,
  sales = [],
  expenses = [],
  businessProfile = {},
  onClose
}) => {
  useDialogClose(onClose);
  const currency = businessProfile?.currencySymbol || '₹';
  const isDeficit = closingBalance < 0;

  const transactions = [
    ...sales.map(s => ({
      id: s.id,
      type: 'INCOME',
      category: s.customerInfo?.name ? `Sale · ${s.customerInfo.name}` : 'Sale',
      description: s.paymentMethod || s.payment_method || 'CASH',
      amount: Number(s.totalAmount) || Number(s.total_amount) || 0,
      time: new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: parseLocalDate(s.date).getTime(),
    })),
    ...expenses.map(e => ({
      id: e.id,
      type: 'EXPENSE',
      category: e.category || 'General',
      description: e.note || e.description || 'Expense',
      amount: parseFloat(e.amount) || 0,
      time: new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: parseLocalDate(e.date).getTime(),
    }))
  ].sort((a, b) => a.timestamp - b.timestamp);

  // Running balance
  let running = openingBalance;
  const txWithBalance = transactions.map(tx => {
    running = tx.type === 'INCOME' ? running + tx.amount : running - tx.amount;
    return { ...tx, runningBalance: running };
  });

  const totalIncome = sales.reduce((s, x) => s + (Number(x.totalAmount) || Number(x.total_amount) || 0), 0);
  const totalExpense = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const netSurplus = totalIncome - totalExpense;

  const cashIn  = sales.filter(s => (s.paymentMethod || s.payment_method || '').toUpperCase() !== 'CREDIT')
                       .reduce((s, x) => s + (Number(x.totalAmount) || Number(x.total_amount) || 0), 0);
  const creditIn = totalIncome - cashIn;

  const money = (n) => `${currency}${fmt(n)}`;

  return (
    <div className="m-scrim fixed inset-0 z-[100] flex flex-col bg-frame no-print" role="dialog" aria-modal="true" aria-label="Daily Financial Ledger">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-sep bg-surface px-[22px] py-3.5">
        <Button variant="outline" size="icon" aria-label="Back to the Day Book" onClick={onClose}><ChevronLeft /></Button>
        <b className="font-tight text-[16px] font-semibold">Daily Financial Ledger</b>
        <span className="flex-1" />
        <Button variant="dark" size="sm" onClick={() => window.print()}><Printer /> Print</Button>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        <div className="m-dialog mx-auto my-[22px] w-full max-w-[860px] rounded-md bg-surface px-5 py-7 shadow-[0_1px_3px_rgba(17,20,24,0.12)] sm:px-10 sm:py-[34px]">
          <div className="mb-[18px] flex items-start justify-between border-b-2 border-ink pb-3.5">
            <div>
              <b className="font-tight text-[20px] font-semibold">{businessProfile?.name || 'Ledgr'}</b>
              <small className="mt-0.5 block text-[13px] text-body">Daily Financial Ledger · {date ? longDay(date) : 'Today'}</small>
            </div>
            <small className="text-[12.5px] text-mute">{transactions.length} transactions</small>
          </div>

          <Tiles>
            <Tile label="Opening" value={money(openingBalance)} />
            <Tile label="Revenue" tone="pos" value={money(totalIncome)} sub={creditIn > 0 ? `${money(creditIn)} credit` : undefined} />
            <Tile label="Expenses" tone="neg" value={money(totalExpense)} />
            <Tile label="Closing" tone={isDeficit ? 'deficit' : 'dark'}
              value={`${isDeficit ? '−' : ''}${money(Math.abs(closingBalance))}`}
              sub={isDeficit ? 'Cash deficit' : 'Surplus'} />
          </Tiles>

          <div className="mb-2.5 flex items-baseline gap-2.5">
            <h3 className="font-tight text-[15px] font-semibold">Transaction Log</h3>
            <span className="flex-1" />
            <small className={`text-[12.5px] font-semibold ${netSurplus >= 0 ? 'text-good-text' : 'text-bad-text'}`}>
              {netSurplus >= 0 ? 'Surplus' : 'Deficit'} {money(Math.abs(netSurplus))}
            </small>
          </div>
          <Table wrapperClassName="rounded-[14px] border border-line">
            <TableHeader className="[&_th]:bg-tile [&_th]:whitespace-nowrap">
              <tr>
                <TableHead>Time</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Method</TableHead>
                <TableHead numeric>In (+)</TableHead>
                <TableHead numeric>Out (−)</TableHead>
                <TableHead numeric>Balance</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {txWithBalance.map((tx, idx) => (
                <TableRow key={tx.id || idx}>
                  <TableCell className="whitespace-nowrap text-ink-2">{tx.time}</TableCell>
                  <TableCell>
                    <b className="font-tight font-semibold">{tx.category}</b>
                  </TableCell>
                  <TableCell className="text-body">{tx.description || 'Cash'}</TableCell>
                  <TableCell numeric className="whitespace-nowrap">
                    {tx.type === 'INCOME' ? <span className="text-good-text">+{money(tx.amount)}</span> : <span className="text-faint">—</span>}
                  </TableCell>
                  <TableCell numeric className="whitespace-nowrap">
                    {tx.type === 'EXPENSE' ? <span className="text-bad-text">−{money(tx.amount)}</span> : <span className="text-faint">—</span>}
                  </TableCell>
                  <TableCell numeric className={`whitespace-nowrap ${tx.runningBalance < 0 ? 'text-bad-text' : ''}`}>
                    {tx.runningBalance < 0 ? '−' : ''}{money(Math.abs(tx.runningBalance))}
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center">
                    <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-mute"><FileText size={22} strokeWidth={1.8} /></span>
                    <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">No transactions recorded</span>
                  </td>
                </tr>
              )}
            </TableBody>
          </Table>
          <p className="mt-3 text-[12.5px] text-body">
            {sales.length} sales · {expenses.length} expenses ·{' '}
            <span className={netSurplus >= 0 ? 'text-good-text' : 'text-bad-text'}>Net {netSurplus >= 0 ? '+' : ''}{money(netSurplus)}</span>
          </p>

          <div className="mt-14 grid grid-cols-2 gap-[60px] text-center text-[12px] text-mute">
            <div><i className="mb-1.5 block border-t border-ink-2" />Manager Signature</div>
            <div><i className="mb-1.5 block border-t border-ink-2" />Auditor Signature</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyLedgerDetail;
