import React, { useMemo } from 'react';
import useReportData from './useReportData';
import PremiumReportView from './PremiumReportView';
import { BookOpen, TrendingUp, TrendingDown, Calendar, Receipt, Tag, Landmark } from 'lucide-react';
import { formatINR, round2 } from '../../utils/financialCalculations';
import { formatDate } from '../../lib/utils';

/**
 * General Ledger Report
 * ---------------------
 * Synthesizes journal entries from operational tables (sales, expenses, payroll, purchases, payments).
 * Each business event creates paired debit/credit lines to preserve double-entry integrity.
 *
 * Posting rules (simplified):
 *   SALE (CASH)   : DR Cash            CR Sales Revenue
 *   SALE (CREDIT) : DR Accounts Receivable  CR Sales Revenue
 *   COGS          : DR COGS            CR Inventory
 *   EXPENSE       : DR Operating Expense     CR Cash
 *   PAYROLL       : DR Payroll Expense       CR Cash
 *   PURCHASE      : DR Inventory       CR Accounts Payable (or Cash)
 */
const GeneralLedgerReport = () => {
  const { data: sales, loading: l1 } = useReportData({ table: 'sales', select: '*', dateColumn: 'date' });
  const { data: expenses, loading: l2 } = useReportData({ table: 'expenses', select: '*', dateColumn: 'date' });
  const { data: payroll, loading: l3 } = useReportData({ table: 'payroll', select: '*', dateColumn: 'processed_at' });
  const { data: purchases, loading: l4 } = useReportData({ table: 'purchases', select: '*', dateColumn: 'date' });

  const loading = l1 || l2 || l3 || l4;

  // Convert operational events to ledger entries
  const ledgerEntries = useMemo(() => {
    const entries = [];
    let seq = 0;
    const addEntry = (e) => entries.push({ ...e, id: `GL-${String(++seq).padStart(6, '0')}` });

    // Sales
    sales.forEach((s) => {
      const refId = (s.id || '').slice(0, 8).toUpperCase();
      const method = (s.paymentMethod || 'CASH').toUpperCase();
      const isCredit = method === 'CREDIT' || method === 'CREDIT_CARD_CREDIT' || !!s.customerInfo?.id;
      const amount = Number(s.totalAmount) || 0;
      const cogs = Number(s.totalCogs) || 0;

      // DR Cash or AR | CR Sales Revenue
      addEntry({
        date: s.date,
        reference: `SALE-${refId}`,
        description: `Sale ${isCredit ? '(Credit)' : `(${method})`}`,
        account: isCredit ? 'Accounts Receivable' : 'Cash & Bank',
        accountCode: isCredit ? '1100' : '1000',
        debit: amount,
        credit: 0,
        type: 'SALE',
      });
      addEntry({
        date: s.date,
        reference: `SALE-${refId}`,
        description: `Sale ${isCredit ? '(Credit)' : `(${method})`}`,
        account: 'Sales Revenue',
        accountCode: '4000',
        debit: 0,
        credit: amount,
        type: 'SALE',
      });

      // COGS posting (if tracked)
      if (cogs > 0) {
        addEntry({
          date: s.date,
          reference: `COGS-${refId}`,
          description: 'Cost of Goods Sold',
          account: 'Cost of Goods Sold',
          accountCode: '5000',
          debit: cogs,
          credit: 0,
          type: 'COGS',
        });
        addEntry({
          date: s.date,
          reference: `COGS-${refId}`,
          description: 'Inventory reduction',
          account: 'Inventory',
          accountCode: '1200',
          debit: 0,
          credit: cogs,
          type: 'COGS',
        });
      }
    });

    // Expenses
    expenses.forEach((e) => {
      const refId = (e.id || '').slice(0, 8).toUpperCase();
      const amount = Number(e.amount) || 0;
      addEntry({
        date: e.date,
        reference: `EXP-${refId}`,
        description: e.category || e.description || 'Operating Expense',
        account: 'Operating Expenses',
        accountCode: '5200',
        debit: amount,
        credit: 0,
        type: 'EXPENSE',
      });
      addEntry({
        date: e.date,
        reference: `EXP-${refId}`,
        description: e.category || 'Operating Expense',
        account: 'Cash & Bank',
        accountCode: '1000',
        debit: 0,
        credit: amount,
        type: 'EXPENSE',
      });
    });

    // Payroll
    payroll.forEach((p) => {
      const refId = (p.id || '').slice(0, 8).toUpperCase();
      const amount = Number(p.amount) || 0;
      const date = p.processed_at || p.date;
      addEntry({
        date,
        reference: `PAY-${refId}`,
        description: 'Payroll disbursement',
        account: 'Payroll Expense',
        accountCode: '5100',
        debit: amount,
        credit: 0,
        type: 'PAYROLL',
      });
      addEntry({
        date,
        reference: `PAY-${refId}`,
        description: 'Payroll disbursement',
        account: 'Cash & Bank',
        accountCode: '1000',
        debit: 0,
        credit: amount,
        type: 'PAYROLL',
      });
    });

    // Purchases
    purchases.forEach((p) => {
      const refId = (p.id || '').slice(0, 8).toUpperCase();
      const amount = Number(p.total_amount ?? p.amount) || 0;
      const isPaid = p.payment_status === 'PAID' || p.paid === true;

      addEntry({
        date: p.date,
        reference: `PUR-${refId}`,
        description: 'Inventory purchase',
        account: 'Inventory',
        accountCode: '1200',
        debit: amount,
        credit: 0,
        type: 'PURCHASE',
      });
      addEntry({
        date: p.date,
        reference: `PUR-${refId}`,
        description: isPaid ? 'Paid purchase' : 'Credit purchase',
        account: isPaid ? 'Cash & Bank' : 'Accounts Payable',
        accountCode: isPaid ? '1000' : '2000',
        debit: 0,
        credit: amount,
        type: 'PURCHASE',
      });
    });

    // Sort newest first
    return entries.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [sales, expenses, payroll, purchases]);

  // Account summary
  const accountSummary = useMemo(() => {
    const byAccount = {};
    ledgerEntries.forEach((e) => {
      const key = e.accountCode;
      if (!byAccount[key]) {
        byAccount[key] = { accountCode: e.accountCode, account: e.account, debit: 0, credit: 0, balance: 0, entries: 0 };
      }
      byAccount[key].debit += e.debit;
      byAccount[key].credit += e.credit;
      byAccount[key].balance = byAccount[key].debit - byAccount[key].credit;
      byAccount[key].entries += 1;
    });
    return Object.values(byAccount)
      .map((a) => ({ ...a, debit: round2(a.debit), credit: round2(a.credit), balance: round2(a.balance) }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }, [ledgerEntries]);

  const totals = useMemo(() => {
    const debit = ledgerEntries.reduce((a, e) => a + e.debit, 0);
    const credit = ledgerEntries.reduce((a, e) => a + e.credit, 0);
    return { debit: round2(debit), credit: round2(credit), count: ledgerEntries.length };
  }, [ledgerEntries]);

  const kpis = [
    { id: 'entries', label: 'Ledger Entries', value: totals.count, trend: 0, trendDir: 'none', color: 'indigo', chartData: [] },
    { id: 'dr', label: 'Total Debits', value: totals.debit, trend: 0, trendDir: 'up', color: 'emerald', chartData: [] },
    { id: 'cr', label: 'Total Credits', value: totals.credit, trend: 0, trendDir: 'up', color: 'rose', chartData: [] },
    { id: 'accts', label: 'Active Accounts', value: accountSummary.length, trend: 0, trendDir: 'none', color: 'amber', chartData: [] },
  ];

  const renderTypeBadge = (val) => {
    const colors = {
      SALE: 'bg-emerald-50 text-emerald-600',
      COGS: 'bg-accent-signature/10 text-accent-signature',
      EXPENSE: 'bg-rose-50 text-rose-600',
      PAYROLL: 'bg-accent-signature/10 text-accent-signature',
      PURCHASE: 'bg-sky-50 text-sky-600',
    };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-semibold uppercase ${colors[val] || 'bg-gray-50 text-gray-600'}`}>
        {val}
      </span>
    );
  };

  const journalTab = {
    id: 'GL_JOURNAL',
    label: 'Journal Entries',
    icon: <BookOpen size={18} />,
    data: ledgerEntries,
    loading: loading,
    totals: { debit: totals.debit, credit: totals.credit },
    columns: [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: 120 },
      { key: 'id', label: 'Entry #', sortable: true, width: 130, render: (val) => <span className="tabular-nums text-[10px] bg-canvas px-2 py-0.5 rounded border border-border/60 font-semibold">{val}</span> },
      { key: 'reference', label: 'Reference', sortable: true, width: 150, render: (val) => <span className="tabular-nums text-[10px] font-semibold text-muted-foreground">{val}</span> },
      { key: 'type', label: 'Type', width: 110, render: renderTypeBadge },
      { key: 'accountCode', label: 'GL', width: 80, render: (val) => <span className="tabular-nums text-[10px] bg-canvas px-2 py-0.5 rounded border border-border/60 font-semibold">{val}</span> },
      { key: 'account', label: 'Account', sortable: true, width: 200, render: (val) => <span className="font-semibold text-foreground uppercase tracking-tight">{val}</span> },
      { key: 'description', label: 'Description', width: 220, render: (val) => <span className="text-[11px] text-gray-600">{val}</span> },
      { key: 'debit', label: 'Debit', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => val > 0 ? <span className="font-semibold text-accent-signature">{formatINR(val)}</span> : <span className="text-gray-300">—</span> },
      { key: 'credit', label: 'Credit', type: 'currency', align: 'right', sortable: true, width: 150, render: (val) => val > 0 ? <span className="font-semibold text-emerald-600">{formatINR(val)}</span> : <span className="text-gray-300">—</span> },
    ],
    kpis: kpis,
    chartConfig: {
      title: 'Daily Activity',
      type: 'area',
      data: (() => {
        const byDay = {};
        ledgerEntries.forEach((e) => {
          const day = (e.date || '').slice(0, 10);
          if (!byDay[day]) byDay[day] = { name: day, Debits: 0, Credits: 0 };
          byDay[day].Debits += e.debit;
          byDay[day].Credits += e.credit;
        });
        return Object.values(byDay).sort((a, b) => a.name.localeCompare(b.name));
      })(),
      series: [
        { key: 'Debits', name: 'Debits', color: 'var(--color-accent-signature)' },
        { key: 'Credits', name: 'Credits', color: '#10b981' },
      ],
    },
    detailFields: [
      { key: 'debit', label: 'Debit', type: 'currency', isHero: true },
      { key: 'credit', label: 'Credit', type: 'currency' },
      { key: 'date', label: 'Posted', type: 'date', icon: <Calendar size={12} /> },
      { key: 'reference', label: 'Reference', icon: <Receipt size={12} /> },
      { key: 'account', label: 'Account', icon: <Landmark size={12} /> },
      { key: 'accountCode', label: 'GL Code' },
      { key: 'description', label: 'Description' },
      { key: 'type', label: 'Transaction Type', icon: <Tag size={12} /> },
    ],
    filterConfig: [
      {
        key: 'type', label: 'Entry Type',
        options: [
          { value: 'SALE', label: 'Sale' },
          { value: 'COGS', label: 'COGS' },
          { value: 'EXPENSE', label: 'Expense' },
          { value: 'PAYROLL', label: 'Payroll' },
          { value: 'PURCHASE', label: 'Purchase' },
        ],
      },
    ],
  };

  const accountTab = {
    id: 'GL_ACCOUNTS',
    label: 'Account Summary',
    icon: <Landmark size={18} />,
    data: accountSummary,
    loading: loading,
    totals: {
      debit: totals.debit,
      credit: totals.credit,
      balance: round2(totals.debit - totals.credit),
    },
    columns: [
      { key: 'accountCode', label: 'Code', sortable: true, width: 100, render: (val) => <span className="tabular-nums text-[10px] bg-canvas px-2 py-0.5 rounded border border-border/60 font-semibold">{val}</span> },
      { key: 'account', label: 'Account Name', sortable: true, width: 280, render: (val) => <span className="font-semibold text-foreground uppercase tracking-tight">{val}</span> },
      { key: 'entries', label: 'Entries', align: 'right', sortable: true, width: 110, render: (val) => <span className="tabular-nums font-semibold text-muted-foreground">{val}</span> },
      { key: 'debit', label: 'Total Debits', type: 'currency', align: 'right', sortable: true, width: 160, render: (val) => <span className="font-semibold text-accent-signature">{formatINR(val)}</span> },
      { key: 'credit', label: 'Total Credits', type: 'currency', align: 'right', sortable: true, width: 160, render: (val) => <span className="font-semibold text-emerald-600">{formatINR(val)}</span> },
      { key: 'balance', label: 'Net Balance', type: 'currency', align: 'right', sortable: true, width: 160, render: (val) => (
        <span className={`font-semibold ${val >= 0 ? 'text-foreground' : 'text-rose-500'}`}>{formatINR(val)}</span>
      )},
    ],
    kpis: kpis,
    chartConfig: {
      title: 'Net Balance by Account',
      type: 'bar',
      data: accountSummary.map((a) => ({ name: `${a.accountCode}`, value: a.balance })),
      series: [{ key: 'value', name: 'Balance', color: 'var(--color-accent-signature)' }],
    },
    detailFields: [
      { key: 'balance', label: 'Net Balance', type: 'currency', isHero: true },
      { key: 'accountCode', label: 'GL Code', icon: <Receipt size={12} /> },
      { key: 'account', label: 'Account', icon: <Landmark size={12} /> },
      { key: 'debit', label: 'Total Debits', type: 'currency' },
      { key: 'credit', label: 'Total Credits', type: 'currency' },
      { key: 'entries', label: 'Number of Entries' },
    ],
  };

  return <PremiumReportView title="General Ledger" tabs={[journalTab, accountTab]} />;
};

export default GeneralLedgerReport;
