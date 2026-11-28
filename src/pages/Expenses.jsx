import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Download, X, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronDown, ReceiptText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useFinance } from '../hooks/useFinance';
import { useInventory } from '../hooks/useInventory';
import { todayISOInAppTZ, cn } from '../lib/utils';
import { paymentLabel } from '../lib/recurring';
import {
  PERIODS, periodWindow, filterExpenses, summarize, categoryTotals, pageOf, windowWords, expenseDay, dayMonth,
  monthToDateComparison, lastSixMonths, shortAmount, csvRows, toCsv, amountOf,
} from '../lib/expenseList';
import { expenseRowActions } from '../lib/expenseRowActions';
import { Tabs } from '../components/ui/Tabs';
import { FigureStrip, Figure } from '../components/ui/FigureStrip';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { RowMenu, MenuItem, MenuRule } from '../components/ui/RowMenu';
import SegmentedTabs from '../components/motion/SegmentedTabs';
import HoldButton from '../components/motion/HoldButton';
import WriteFailure from '../components/invoices/WriteFailure';
import ExpenseForm, { formFromExpense } from '../components/expenses/ExpenseForm';
import ExpenseDetail from '../components/expenses/ExpenseDetail';
import RepeatingTab from '../components/expenses/RepeatingTab';
import { CategoryChip, Pill, rowTags, rupees, rupeesPaise } from '../components/expenses/parts';

const PAGE_SIZE = 50;
const SORT_WORDS = { 'date:desc': 'newest first', 'date:asc': 'oldest first', 'amount:desc': 'biggest first', 'amount:asc': 'smallest first' };

/**
 * Expenses (web redesign, approved mockups expenses-01 to 09).
 *
 * Every figure is a plain sum of the expenses' amounts over the rows shown
 * (lib/expenseList). Saves go through useFinance as before; the database
 * posts each expense to Cash & Bank. What a row allows (edit, delete) is
 * decided in one place: lib/expenseRowActions.
 */
const Expenses = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { inventoryLocations } = useInventory(currentTenantId);
  const posStores = (inventoryLocations || []).filter((l) => (l.type || 'WAREHOUSE') !== 'VEHICLE' && !l.deleted_at);
  const {
    expenses, addExpense, updateExpense, deleteExpense, refetch,
    expenseCategories, loading,
    recurringTemplates, addRecurringTemplate, setRecurringActive, deleteRecurringTemplate,
    addExpenseCategory,
  } = useFinance(currentTenantId);
  const sym = businessProfile?.currencySymbol || '₹';
  const canAdd = hasPermission('ADD_EXPENSE');

  const [tab, setTab] = useState('EXPENSES');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('today');
  const [range, setRange] = useState({ from: '', to: '' });
  const [category, setCategory] = useState('ALL');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [paging, setPaging] = useState({ sig: '', page: 0 });
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);        // null | { editing, initial }
  const [rowFailure, setRowFailure] = useState(null);

  const openNew = useCallback(() => setForm({ editing: null, initial: null }), []);
  const openEdit = (e) => { setOpenId(null); setForm({ editing: e, initial: formFromExpense(e) }); };

  // The Dashboard's "Record expense" lands here as ?new=1: open the new-expense
  // form, then drop the param so a refresh does not open it again.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    if (hasPermission('ADD_EXPENSE')) openNew();
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, hasPermission, openNew]);

  const today = todayISOInAppTZ();
  const win = useMemo(() => periodWindow(period, today, range), [period, today, range]);
  const filters = useMemo(() => ({ query, category }), [query, category]);
  const rows = useMemo(() => filterExpenses(expenses, { win, query, category, sortKey, sortDir }), [expenses, win, query, category, sortKey, sortDir]);
  // The Category list: every category in the period, whatever is picked.
  const periodCats = useMemo(() => categoryTotals(filterExpenses(expenses, { win, query: '', category: 'ALL' })), [expenses, win]);
  const sum = useMemo(() => summarize(rows), [rows]);
  const cats = useMemo(() => categoryTotals(rows), [rows]);
  const cmp = useMemo(() => (period === 'month' ? monthToDateComparison(expenses, today, filters) : null), [period, expenses, today, filters]);
  const months = useMemo(() => lastSixMonths(expenses, today, filters), [expenses, today, filters]);
  // Any change of period, filter or sort goes back to the first page.
  const sig = JSON.stringify([win, query, category, sortKey, sortDir]);
  const page = paging.sig === sig ? paging.page : 0;
  const setPage = (fn) => setPaging({ sig, page: fn(page) });
  const pg = pageOf(rows, page, PAGE_SIZE);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const exportCSV = () => {
    const csv = toCsv(csvRows(rows));
    if (!csv) return;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `expenses-${today}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const removeExpense = async (e) => {
    setRowFailure(null);
    let res;
    try { res = await deleteExpense(e.id); } catch (err) { res = { error: err }; }
    return res;
  };
  const removeFromRow = async (e) => {
    const res = await removeExpense(e);
    if (res?.error) { console.error('[expenses] delete failed', res.error); setRowFailure(res.error); }
  };

  const storeName = (id) => (id ? (inventoryLocations || []).find((l) => l.id === id)?.name || 'A removed store' : null);
  const opened = openId ? (expenses || []).find((e) => e.id === openId) || null : null;
  const periodLabel = period === 'range' ? 'Selected range' : PERIODS.find((p) => p.key === period)?.label || 'All';
  const empty = !loading && rows.length === 0;

  const pickMonth = (m) => {
    const last = months[months.length - 2];
    if (m.current) { setPeriod('month'); return; }
    if (m.ym === last?.ym) { setPeriod('lastmonth'); return; }
    setRange({ from: m.from, to: m.to }); setPeriod('range');
  };

  const sortMark = (key) => (
    <span aria-hidden="true" className={cn('ml-[3px]', sortKey === key ? 'text-amber' : 'text-faint')}>
      {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const renderRow = (e) => {
    const acts = expenseRowActions(e, hasPermission);
    const itc = e.vendor_gstin ? (parseFloat(e.gst_amount) || 0) : 0;
    return (
      <TableRow key={e.id} onClick={() => setOpenId(e.id)} data-state={openId === e.id ? 'selected' : undefined} className="cursor-pointer">
        <TableCell className="w-[74px] whitespace-nowrap text-ink-2">{dayMonth(expenseDay(e.date))}</TableCell>
        <TableCell className="max-w-0 w-full">
          <span className="flex flex-wrap items-center gap-1.5 font-tight text-[14px] font-semibold text-ink">
            <span className="min-w-0 truncate">{e.note || '—'}</span>
            {rowTags(e).map((t) => <Pill key={t} small>{t}</Pill>)}
          </span>
          <small className="text-[12px] text-mute">{paymentLabel(e.payment_method)}</small>
        </TableCell>
        <TableCell><CategoryChip category={e.category} /></TableCell>
        <TableCell numeric className="whitespace-nowrap">
          {rupees(amountOf(e), sym)}
          {itc > 0 && <span className="mt-px block font-tight text-[12px] font-medium text-good-text">ITC {rupeesPaise(itc, sym)}</span>}
        </TableCell>
        <TableCell numeric className="w-9" onClick={(ev) => ev.stopPropagation()}>
          {(acts.canEdit || acts.canDelete) && (
            <RowMenu label={`Actions for ${e.note || 'expense'}`} width={210}>
              {(close) => (
                <>
                  {acts.canEdit && <MenuItem icon={Pencil} onClick={() => { close(); openEdit(e); }}>Edit expense</MenuItem>}
                  {acts.canEdit && acts.canDelete && <MenuRule />}
                  {acts.canDelete && (
                    <HoldButton onConfirm={() => { close(); removeFromRow(e); }} title="Hold 1.5s to delete this expense"
                      className="w-full rounded-pill px-3 py-2 text-left font-tight text-[13px] font-semibold text-bad-text hover:bg-bad-soft">
                      <Trash2 size={15} /> Hold to delete
                    </HoldButton>
                  )}
                </>
              )}
            </RowMenu>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const zero = (v) => (sum.entries === 0 ? <span className="text-faint">{v}</span> : v);
  const cmpLine = cmp && cmp.dir !== null ? (
    <span className={cn('font-tight text-[12px] font-semibold', cmp.dir > 0 ? 'text-amber-text' : cmp.dir < 0 ? 'text-good-text' : 'text-body')}>
      {cmp.dir > 0 ? '▲' : cmp.dir < 0 ? '▼' : ''} {rupees(Math.abs(cmp.diff), sym)} ({Math.round(Math.abs(cmp.pct))}%) vs last month
    </span>
  ) : null;
  const spentSub = cmp
    ? (cmp.before > 0 ? `${cmp.nowSpan} · ${cmp.beforeSpan} was ${rupees(cmp.before, sym)}` : `${cmp.nowSpan} · nothing spent ${cmp.beforeSpan}`)
    : windowWords(win);
  const maxMonth = Math.max(0, ...months.map((m) => m.total));

  return (
    <div className="flex flex-col pb-16">
      <Tabs className="m-rise mb-[18px]" ariaLabel="Expenses" value={tab} onChange={setTab}
        items={[
          { key: 'EXPENSES', label: 'Expenses', count: rows.length },
          { key: 'REPEATING', label: 'Repeating', count: (recurringTemplates || []).length },
        ]} />

      {tab === 'REPEATING' && (
        <RepeatingTab templates={recurringTemplates || []} sym={sym} canAdd={canAdd} onNew={openNew}
          setRecurringActive={setRecurringActive} deleteRecurringTemplate={deleteRecurringTemplate} onReread={refetch} />
      )}

      {tab === 'EXPENSES' && (
        <>
          <FigureStrip cols={4} className="m-rise mb-5" style={{ '--i': 1 }}>
            <Figure label="Spent" value={zero(rupees(sum.spent, sym))} sub={cmpLine || spentSub} cap={cmpLine ? spentSub : undefined} />
            <Figure label="Entries" value={zero(sum.entries.toLocaleString('en-IN'))} sub="in this period" />
            <Figure label="Avg per entry" value={zero(rupees(sum.avg, sym))} sub="spent ÷ entries" />
            <Figure label="GST to claim (ITC)" value={sum.itc > 0 ? <span className="text-good-text">{rupees(sum.itc, sym)}</span> : zero(rupees(0, sym))}
              sub="bills with a vendor GSTIN" />
          </FigureStrip>

          <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 2 }}>
            <div className="max-w-full overflow-x-auto no-scrollbar">
              <SegmentedTabs items={PERIODS} value={period} onChange={setPeriod}
                trackClass="bg-well" indicatorClass="bg-ink" activeClass="text-white"
                className="[&_button]:font-tight [&_button]:text-[12.5px] [&_button]:font-semibold [&_button]:px-[13px] [&_button]:h-[30px] [&_button:not([aria-selected=true])]:text-body" />
            </div>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={exportCSV} disabled={!rows.length} title="Export CSV"><Download /> Export</Button>
            {canAdd && <Button size="sm" onClick={openNew}><Plus /> New expense</Button>}
          </div>

          <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 3 }}>
            <div className="relative w-full sm:w-[280px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
              <input type="text" aria-label="Search note or category" placeholder="Search note or category" value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full rounded-pill bg-well pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
            </div>
            <label className="relative inline-flex h-9 items-center gap-1.5 rounded-pill pl-3.5 pr-8 font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <em className="not-italic font-medium text-mute">Category</em>
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"
                className="appearance-none bg-transparent outline-none [field-sizing:content]">
                <option value="ALL">All</option>
                {periodCats.map(([c]) => <option key={c} value={c}>{c}</option>)}
                {category !== 'ALL' && !periodCats.some(([c]) => c === category) && <option value={category}>{category}</option>}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 text-mute" />
            </label>
            <div className="flex-1" />
            {period === 'range' ? (
              <div className="flex items-center gap-1.5 text-[12.5px] text-mute">
                <Input type="date" aria-label="From" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="h-[34px] w-auto text-[13px]" />
                to
                <Input type="date" aria-label="To" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="h-[34px] w-auto text-[13px]" />
                {(range.from || range.to) && (
                  <Button variant="secondary" size="icon-sm" aria-label="Clear dates" onClick={() => setRange({ from: '', to: '' })} className="h-7 w-7"><X /></Button>
                )}
              </div>
            ) : (
              <span className="text-[12.5px] text-mute tabular-nums">{windowWords(win, { year: true })}</span>
            )}
          </div>

          {rowFailure && (
            <div className="mb-3 flex items-start gap-2">
              <WriteFailure error={rowFailure} noun="delete" onReread={() => { setRowFailure(null); refetch?.(); }} className="flex-1" />
              <Button variant="secondary" size="icon-sm" aria-label="Dismiss" onClick={() => setRowFailure(null)}><X /></Button>
            </div>
          )}

          {empty ? (
            <div className="m-rise rounded-[14px] border border-dashed border-[#E2E2E0] px-5 pt-14 pb-[60px] text-center" style={{ '--i': 4 }}>
              <div className="mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-tile text-body"><ReceiptText size={24} strokeWidth={1.7} /></div>
              <h3 className="font-tight text-[17px] font-semibold">No expenses found</h3>
              <p className="mt-1 mb-4 text-[13.5px] text-body">
                {period === 'all' && !query && category === 'ALL' ? 'Log your first business expense to start tracking spend.' : 'No expenses in this period. Try a wider range or clear filters.'}
              </p>
              {canAdd && <Button onClick={openNew}>Log expense</Button>}
            </div>
          ) : (
            <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_268px]">
              <div className="m-rise min-w-0" style={{ '--i': 4 }}>
                <Table>
                  <TableHeader>
                    <tr>
                      <TableHead className="w-[74px]" aria-sort={sortKey === 'date' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => toggleSort('date')} className="font-semibold hover:text-ink">Date{sortMark('date')}</button>
                      </TableHead>
                      <TableHead>Expense</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead numeric aria-sort={sortKey === 'amount' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => toggleSort('amount')} className="font-semibold hover:text-ink">Amount{sortMark('amount')}</button>
                      </TableHead>
                      <TableHead className="w-9"><span className="sr-only">Actions</span></TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {loading && rows.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-12 text-center text-[13px] text-mute">Loading expenses…</td></tr>
                    ) : pg.rows.map(renderRow)}
                  </TableBody>
                </Table>
                {pg.total > 0 && (
                  <div className="flex items-center justify-between gap-3 px-1 pt-3.5 text-[13px] text-body">
                    <span>{pg.shown.toLocaleString('en-IN')} of {pg.total.toLocaleString('en-IN')} shown · {SORT_WORDS[`${sortKey}:${sortDir}`]}</span>
                    {pg.pages > 1 && (
                      <div className="flex gap-1.5">
                        <Button variant="secondary" size="icon-sm" aria-label="Previous page" disabled={!pg.hasPrev} onClick={() => setPage((p) => p - 1)}><ChevronLeft /></Button>
                        <Button variant="secondary" size="icon-sm" aria-label="Next page" disabled={!pg.hasNext} onClick={() => setPage((p) => p + 1)}><ChevronRight /></Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <aside className="m-rise flex flex-col gap-4" style={{ '--i': 5 }}>
                <div className="rounded-[14px] border border-line bg-surface px-[18px] py-4">
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <h3 className="font-tight text-[14.5px] font-semibold">Last 6 months</h3>
                    <span className="ml-auto text-[12.5px] text-mute">Spent each month</span>
                  </div>
                  <div className="mt-3 grid h-[118px] grid-cols-6 items-end gap-2.5" role="group"
                    aria-label={`Spent per month: ${months.map((m) => `${m.label}${m.current ? ' so far' : ''} ${rupees(m.total, sym)}`).join(', ')}`}>
                    {months.map((m) => {
                      const on = win.from === m.from && win.to === m.to;
                      const h = maxMonth > 0 ? Math.max(m.total > 0 ? 2 : 0, Math.round((m.total / maxMonth) * 90)) : 0;
                      return (
                        <button key={m.ym} type="button" onClick={() => pickMonth(m)}
                          aria-label={`${m.long}${m.current ? ' so far' : ''}: ${rupees(m.total, sym)}. Show its expenses`}
                          className="m-press group/bar flex h-full flex-col items-center justify-end gap-[5px]">
                          <em className={cn('not-italic font-tight text-[10.5px] font-semibold tabular-nums', on ? 'text-ink' : 'text-mute')}>{shortAmount(m.total)}</em>
                          <i className={cn('block w-full max-w-[30px] rounded-t-[6px] rounded-b-[2px]', on ? 'bg-ink-2' : 'bg-[#D9DBDE] group-hover/bar:bg-[#C9CCD0]')} style={{ height: `${h}%` }} />
                          <span className={cn('font-tight text-[11px] font-semibold', on ? 'text-ink' : 'text-mute')}>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[12px] text-mute">{months[months.length - 1].long} is up to today. Click a month to show its expenses.</p>
                </div>

                {cats.length > 0 && (
                  <div className="rounded-[14px] border border-line bg-surface px-[18px] py-4">
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <h3 className="font-tight text-[14.5px] font-semibold">Where it went</h3>
                      {category !== 'ALL'
                        ? <button type="button" onClick={() => setCategory('ALL')} className="ml-auto font-tight text-[12.5px] font-semibold text-amber-text">Clear</button>
                        : <span className="ml-auto text-[12.5px] text-mute">{periodLabel}</span>}
                    </div>
                    {cats.map(([c, v]) => {
                      const on = category === c;
                      return (
                        <button key={c} type="button" data-card onClick={() => setCategory(on ? 'ALL' : c)} aria-pressed={on}
                          className={cn('m-press -mx-2 block w-[calc(100%+16px)] rounded-[10px] px-2 pt-1.5 pb-[7px] text-left', on ? 'bg-amber-soft' : 'hover:bg-tile')}>
                          <span className="flex items-baseline justify-between gap-2 text-[13px] text-ink-2">
                            <span className={cn('truncate', on && 'font-semibold text-amber-text')}>{c}</span>
                            <span className="font-semibold tabular-nums text-ink">{rupees(v, sym)}</span>
                          </span>
                          <span className="my-[6px] mb-[3px] block h-1.5 overflow-hidden rounded-pill bg-well">
                            <i className="block h-full rounded-pill bg-bad opacity-80" style={{ width: `${cats[0][1] ? Math.max(Math.round((v / cats[0][1]) * 100), 3) : 0}%` }} />
                          </span>
                          <small className="text-[11.5px] tabular-nums text-mute">{sum.spent ? Math.round((v / sum.spent) * 100) : 0}% of spending</small>
                        </button>
                      );
                    })}
                    <p className="mt-2 text-[12px] text-mute">Click a category to show only its expenses.</p>
                  </div>
                )}
              </aside>
            </div>
          )}
        </>
      )}

      <ExpenseDetail key={openId || 'none'} expense={opened} actions={expenseRowActions(opened, hasPermission)} sym={sym}
        storeName={opened ? storeName(opened.location_id) : null}
        onClose={() => setOpenId(null)} onEdit={openEdit} onDelete={removeExpense}
        onReread={() => { refetch?.(); setOpenId(null); }}
        onOpenRepeating={() => { setOpenId(null); setTab('REPEATING'); }}
        onOpenPayroll={() => navigate('/payroll')} />

      <ExpenseForm open={!!form} editing={form?.editing || null} initial={form?.initial || null}
        onClose={() => setForm(null)} onSaved={() => setForm(null)} refetch={refetch}
        categories={expenseCategories} posStores={posStores} sym={sym}
        addExpense={addExpense} updateExpense={updateExpense}
        addRecurringTemplate={addRecurringTemplate} addExpenseCategory={addExpenseCategory} />
    </div>
  );
};

export default Expenses;
