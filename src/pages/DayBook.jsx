import React, { useState, useMemo } from 'react';
import {
  Calendar, Save, ChevronLeft, ChevronRight, ChevronDown, Check,
  RefreshCcw, FileText, Lock, Banknote, Receipt, History,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useDayBookData } from '../hooks/useDayBookData';
import { useAccounts, accountForMethod } from '../hooks/useAccounts';
import { useNotifications } from '../context/NotificationContext';
import { useInventory } from '../hooks/useInventory';
import { PageSkeleton } from '../components/ui/States';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Eyebrow } from '../components/ui/FigureStrip';
import { RowMenu, MenuItem } from '../components/ui/RowMenu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import WriteFailure from '../components/invoices/WriteFailure';
import DailyLedgerDetail from '../components/reports/DailyLedgerDetail';
import BankReconciliation from '../components/daybook/BankReconciliation';
import CloseDayDialog from '../components/daybook/CloseDayDialog';
import DayBookHistory from '../components/daybook/DayBookHistory';
import { Tile, Tiles, Box, Line, VarianceStrip, Banner, AmountField, money } from '../components/daybook/parts';
import {
  ALL_STORES, buildDayLedger, varianceOf, varianceLook, dayPills, methodLabel, entryPill,
  dayLabel, timeLabel, closedAtLabel,
} from '../lib/dayBookView';
import { todayISOInAppTZ, cn } from '../lib/utils';

// Kept exactly as before the redesign (see the report: in the shop's time
// zone this steps by the UTC date, not the local one).
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Day Book (web redesign, approved mockups daybook-01 to 12).
 *
 * The ledger is lib/dayBookView.buildDayLedger, moved out of this page
 * unchanged. Every write below is the one the page made before: day_book
 * through useDayBookData.updateDayBook, and on closing with a variance one
 * DAY_CLOSE_VARIANCE row through useAccounts.addTxn. Failures that used to
 * be dropped are now shown (WriteFailure); the writes themselves are as
 * they were.
 */
const DayBook = () => {
  const { hasPermission, currentUser } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const currentUserId = currentUser?.id || null;
  const [selectedDate, setSelectedDate] = useState(todayISOInAppTZ());
  const {
    sales, expenses, clientPayments, purchases, supplierPayments, saleReceipts, dayBook,
    loading: dbLoading, updateDayBook, getDayBookForDate, getPrevDayBook, refetch,
  } = useDayBookData(currentTenantId, selectedDate);
  const { addNotification } = useNotifications();
  const { inventoryLocations } = useInventory(currentTenantId);

  const posStores = (inventoryLocations || []).filter(l => (l.type || 'WAREHOUSE') !== 'VEHICLE' && !l.deleted_at);

  const cy = businessProfile?.currencySymbol || '₹';
  const today = todayISOInAppTZ();
  const { accounts, addTxn } = useAccounts(currentTenantId);

  const [storeFilter,    setStoreFilter]   = useState(ALL_STORES);
  const [openingInput,   setOpeningInput]  = useState('');
  const [physicalCash,   setPhysicalCash]  = useState('');
  const [isSaving,       setIsSaving]      = useState(false);
  const [isClosing,      setIsClosing]     = useState(false);
  const [showReport,     setShowReport]    = useState(false);
  const [showHistory,    setShowHistory]   = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [failure,        setFailure]       = useState(null); // { error, noun }

  const record = getDayBookForDate(selectedDate, storeFilter);
  const prevRecord = getPrevDayBook(selectedDate, storeFilter);
  const ledger = useMemo(() => buildDayLedger({
    sales, expenses, clientPayments, purchases, supplierPayments, saleReceipts, dayBook,
    selectedDate, storeFilter, record, prevRecord,
  }), [sales, expenses, clientPayments, purchases, supplierPayments, saleReceipts, dayBook, selectedDate, storeFilter, record, prevRecord]);

  const isDeficit  = ledger.closingBal < 0;
  const variance   = varianceOf(physicalCash, ledger.closingBal);
  const isFuture   = selectedDate > today;
  const canEdit    = hasPermission('finance', 'edit');

  // Load saved physical cash when date changes
  React.useEffect(() => {
    setPhysicalCash(ledger.savedPhysicalCash != null ? String(ledger.savedPhysicalCash) : '');
    setFailure(null);
  }, [selectedDate, storeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (noun, error) => { console.error(`[daybook] ${noun} failed`, error); setFailure({ noun, error }); };

  // ── Actions (the same writes as before the redesign) ──────────────────────
  const handleSaveOpening = async () => {
    if (isSaving || !openingInput) return;
    setIsSaving(true);
    setFailure(null);
    const { error } = await updateDayBook({
      date: selectedDate,
      location_id: storeFilter,
      opening_balance: parseFloat(openingInput),
    });
    setIsSaving(false);
    if (error) {
      fail('opening balance', error);
      addNotification?.(`Could not save opening balance: ${error.message || 'error'}`, 'error');
      return; // keep the input so the user can retry
    }
    addNotification?.('Opening balance saved', 'success');
    setOpeningInput('');
  };

  const handleUseYesterdayClosing = async () => {
    if (!ledger.prevClosing) return;
    setIsSaving(true);
    setFailure(null);
    const { error } = await updateDayBook({
      date: selectedDate,
      location_id: storeFilter,
      opening_balance: ledger.prevClosing,
    });
    if (error) fail('opening balance', error);
    setIsSaving(false);
  };

  const handleSavePhysicalCash = async () => {
    const pc = parseFloat(physicalCash);
    if (isNaN(pc)) return;
    setFailure(null);
    const v = Math.round((pc - ledger.closingBal) * 100) / 100;
    const res = await updateDayBook({
      date:            selectedDate,
      location_id:     storeFilter,
      opening_balance: ledger.openingBal,
      physical_cash:   pc,
      variance:        v,
    });
    if (res?.error) fail('cash count', res.error);
  };

  const handleCloseDay = async (physicalCount, note) => {
    if (isClosing) return;
    setIsClosing(true);
    setFailure(null);
    const pc  = typeof physicalCount === 'number' ? physicalCount : parseFloat(physicalCash);
    const v   = isNaN(pc) ? null : Math.round((pc - ledger.closingBal) * 100) / 100;
    const { error } = await updateDayBook({
      date:             selectedDate,
      location_id:      storeFilter,
      opening_balance:  ledger.openingBal,
      closing_balance:  ledger.closingBal,
      total_sales:      ledger.cashSales + ledger.bankSales + ledger.creditSales,
      total_expenses:   ledger.totalExpenses + ledger.totalPurchPaid,
      is_closed:        true,
      closed_at:        new Date().toISOString(),
      closed_by:        currentUserId,
      ...(v != null ? { physical_cash: pc, variance: v } : {}),
    });
    if (!error && v != null && Math.abs(v) >= 0.01) {
      const cashAccId = accountForMethod(accounts, 'CASH');
      if (cashAccId) {
        let res;
        try {
          res = await addTxn({
            account_id: cashAccId,
            date:       selectedDate,
            direction:  v > 0 ? 'IN' : 'OUT',
            amount:     Math.abs(v),
            mode:       'CASH',
            ref_type:   'DAY_CLOSE_VARIANCE',
            note:       note ? `Day close variance · ${note}` : `Day close variance ${selectedDate}`,
          });
        } catch (err) { res = { error: err }; }
        // The day is closed either way; a failed adjustment is now said.
        if (res?.error) fail('cash variance entry', res.error);
      }
    }
    if (error) {
      fail('day close', error);
      addNotification?.(`Close failed: ${error.message || 'error'}`, 'error');
    } else {
      addNotification?.('Day closed & locked', 'success');
    }
    setIsClosing(false);
  };

  if (dbLoading) return <PageSkeleton cards={4} rows={9} />;

  if (showHistory) {
    return (
      <DayBookHistory dayBook={dayBook || []} cy={cy} today={today} selectedDate={selectedDate}
        onBack={() => setShowHistory(false)}
        onPick={(d) => { setSelectedDate(d); setShowHistory(false); }} />
    );
  }

  const storeName = storeFilter === ALL_STORES ? 'All Stores' : posStores.find(s => s.id === storeFilter)?.name || 'All Stores';
  const net = ledger.cashIn - ledger.cashOut;
  const noRows = ledger.entries.length === 0;
  const countLook = varianceLook(variance);
  const savedLook = varianceLook(ledger.savedVariance);
  const varWords = (look, v) => look && (look.exact ? 'Exact match' : money(v, cy, { signed: true, plus: true }));

  return (
    <div className="flex flex-col pb-16">

      {/* ── Page head ─────────────────────────────────────────────────────── */}
      <div className="m-rise mb-4 flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0">
            <h2 className="font-tight text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Day Book</h2>
            <p className="mt-[3px] text-[13px] text-body">Cash &amp; transaction ledger</p>
          </div>
          {/* Per-store cash drawer when the shop has more than one store. */}
          {posStores.length > 1 && (
            <RowMenu label="Store" width={240}
              trigger={({ ref, onClick, open }) => (
                <button ref={ref} type="button" onClick={onClick} aria-haspopup="menu" aria-expanded={open}
                  className="m-press inline-flex items-center gap-1.5 rounded-pill py-[7px] pl-3.5 pr-3 font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
                  {storeName}<ChevronDown size={14} className="text-mute" />
                </button>
              )}>
              {(close) => [{ id: ALL_STORES, name: 'All Stores' }, ...posStores].map(s => (
                <MenuItem key={s.id} icon={storeFilter === s.id ? Check : undefined} onClick={() => { close(); setStoreFilter(s.id); }}>
                  {storeFilter !== s.id && <span className="inline-block w-4" />}{s.name}
                </MenuItem>
              ))}
            </RowMenu>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <Button variant="outline" size="icon" className="h-[34px] w-[34px]" aria-label="Previous day" onClick={() => setSelectedDate(d => addDays(d, -1))}><ChevronLeft /></Button>
          <label className="inline-flex h-[34px] items-center gap-2 rounded-[10px] bg-surface px-3 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
            <Calendar size={14} className="text-mute" aria-hidden="true" />
            <input type="date" aria-label="Day" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent tabular-nums outline-none" />
          </label>
          <Button variant="outline" size="icon" className="h-[34px] w-[34px]" aria-label="Next day" disabled={selectedDate >= today}
            onClick={() => setSelectedDate(d => addDays(d, 1))}><ChevronRight /></Button>
          {selectedDate !== today && <Button variant="outline" size="sm" onClick={() => setSelectedDate(today)}>Today</Button>}
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}><History /> History</Button>
          <Button variant="dark" size="sm" onClick={() => setShowReport(true)}><FileText /> Report</Button>
        </div>
      </div>

      {/* ── Date + status ─────────────────────────────────────────────────── */}
      <div className="m-rise -mt-1 mb-3.5 flex flex-wrap items-center gap-2.5" style={{ '--i': 1 }}>
        <b className="font-tight text-[15px] font-semibold">{dayLabel(selectedDate)}</b>
        {dayPills({ isLocked: ledger.isLocked, hasOpening: ledger.hasOpening, isFuture }).map(p => (
          <Badge key={p.label} tone={p.tone}>{p.label}</Badge>
        ))}
      </div>

      {/* ── Balance tiles ─────────────────────────────────────────────────── */}
      <Tiles className="m-rise" style={{ '--i': 2 }}>
        <Tile label="Opening Balance" value={money(ledger.openingBal, cy)} />
        <Tile label="Cash Receipts" tone="pos" value={money(ledger.cashIn, cy)}
          sub={`${ledger.txCount} transactions · bank: ${money(ledger.bankIn, cy)}`} />
        <Tile label="Cash Payments" tone="neg" value={money(ledger.cashOut, cy)}
          sub={`${ledger.expenseCount} expenses · bank purch: ${money(ledger.bankPurchPaid, cy)}`} />
        <Tile label="Closing Balance" tone={isDeficit ? 'deficit' : 'dark'}
          value={money(ledger.closingBal, cy, { signed: true })}
          sub={isDeficit ? 'Cash deficit' : ledger.isLocked ? 'Day closed' : 'Estimated'} />
      </Tiles>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">

        {/* ── Transaction log ─────────────────────────────────────────────── */}
        <Box className="m-rise min-w-0" style={{ '--i': 3 }} title="Transaction Log" flush
          right={(
            <>
              <Badge tone="neutral">{ledger.txCount}</Badge>
              <span className="flex-1" />
              {!(isFuture && noRows) && (
                <Badge tone={net >= 0 ? 'good' : 'bad'}>Net {money(Math.abs(net), cy)}</Badge>
              )}
            </>
          )}>
          {!(isFuture && noRows) && (
            <Table wrapperClassName="border-t border-line">
              <TableHeader className="[&_th]:bg-tile [&_th]:whitespace-nowrap">
                <tr>
                  <TableHead>Time</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead numeric>In (+)</TableHead>
                  <TableHead numeric>Out (−)</TableHead>
                  <TableHead numeric>Balance</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {ledger.entries.map((tx, i) => {
                  const isCreditSale = tx.type === 'CREDIT_SALE';
                  const isIncome = tx.type === 'INCOME';
                  const pill = entryPill(tx);
                  return (
                    <TableRow key={tx.id || i} className={isCreditSale ? '[&>td]:text-mute' : ''}>
                      <TableCell className="whitespace-nowrap">{timeLabel(tx.createdAt) || '—'}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <b className="block truncate font-tight font-semibold">{tx.title}</b>
                        {tx.note && <small className="block truncate text-[12px] text-mute">{tx.note}</small>}
                      </TableCell>
                      <TableCell><Badge tone={pill.tone}>{pill.label}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap">{methodLabel(tx.method)}</TableCell>
                      <TableCell numeric className="whitespace-nowrap">
                        {isIncome
                          ? <span className="text-good-text">+{money(tx.amount, cy)}</span>
                          : isCreditSale
                            ? <span className="text-faint">{money(tx.invoiceAmount ?? tx.amount, cy)}</span>
                            : <span className="text-faint">—</span>}
                      </TableCell>
                      <TableCell numeric className="whitespace-nowrap">
                        {!isIncome && !isCreditSale
                          ? <span className="text-bad-text">−{money(tx.amount, cy)}</span>
                          : <span className="text-faint">—</span>}
                      </TableCell>
                      <TableCell numeric className="whitespace-nowrap">
                        <span className={cn(tx.movesCash ? 'font-semibold' : 'text-mute', tx.runningBalance < 0 && 'text-bad-text')}>
                          {money(tx.runningBalance, cy, { signed: true })}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {noRows && (
            <div className="px-5 py-14 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-mute"><Receipt size={22} strokeWidth={1.8} /></div>
              <Eyebrow>No transactions for this date</Eyebrow>
            </div>
          )}
        </Box>

        {/* ── Rail ────────────────────────────────────────────────────────── */}
        <div className="m-rise grid gap-3" style={{ '--i': 4 }}>
          {failure && (
            <WriteFailure error={failure.error} noun={failure.noun}
              onReread={() => { setFailure(null); refetch?.(); }} />
          )}

          <Box title="Opening Balance" icon={Lock}>
            <div className="mb-3 border-b border-sep pb-3">
              <Line label="Opening" value={money(ledger.openingBal, cy)} />
              <Line label="+ Cash Receipts" tone="good" value={money(ledger.cashIn, cy)} />
              <Line label="− Cash Payments" tone="bad" value={money(ledger.cashOut, cy)} />
              <Line label="= Closing" total big value={<span className={isDeficit ? 'text-bad-text' : ''}>{money(ledger.closingBal, cy, { signed: true })}</span>} />
            </div>

            {ledger.isLocked ? (
              <Banner tone="good">
                <b className="font-semibold">Day Closed &amp; Locked</b><br />
                {ledger.closedAt ? `Closed ${closedAtLabel(ledger.closedAt)} · No further edits allowed` : 'No further edits allowed'}
              </Banner>
            ) : canEdit ? (
              <div className="grid gap-2">
                {/* A carried figure must never read as a counted one. */}
                {ledger.carried && !ledger.hasOpening && (
                  <Banner tone="amber" className="mb-0.5">
                    <Eyebrow className="text-amber-text">Carried forward</Eyebrow><br />
                    {money(ledger.openingBal, cy)} — from the {ledger.carried.counted ? 'count' : 'closing'} on {dayLabel(ledger.carried.from)}, plus every day since.<br />
                    <small className="opacity-85">Nobody opened this day. Enter the counted amount to make it a real opening.</small>
                  </Banner>
                )}
                {ledger.prevClosing !== null && !ledger.hasOpening && (
                  <Button variant="outline" size="sm" className="w-full" onClick={handleUseYesterdayClosing} disabled={isSaving}>
                    <ChevronRight /> Use prev. closing ({money(ledger.prevClosing, cy)})
                  </Button>
                )}
                <AmountField cy={cy} placeholder="Enter opening amount" aria-label="Opening amount"
                  value={openingInput} onChange={e => setOpeningInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveOpening()} />
                <Button variant="dark" size="sm" className="w-full" onClick={handleSaveOpening} disabled={isSaving || !openingInput}>
                  {isSaving ? <RefreshCcw className="animate-spin" /> : <Save />} Save Opening Balance
                </Button>
              </div>
            ) : (
              <Eyebrow className="block text-center">View-only</Eyebrow>
            )}
          </Box>

          <Box title="Cash breakdown">
            <Eyebrow className="mt-0.5 mb-1.5 block">Receipts</Eyebrow>
            <Line label="Cash Sales" tone={ledger.cashSales > 0 ? 'good' : 'plain'} value={money(ledger.cashSales, cy)} />
            <Line label="Bank / UPI Sales" tone={ledger.bankSales > 0 ? 'amber' : 'plain'} value={money(ledger.bankSales, cy)} />
            <Line label="Credit Sales" muted value={<>{money(ledger.creditSales, cy)} <em className="font-sans text-[11px] font-medium not-italic text-mute">(excl.)</em></>} />
            <Line label="Cash Collections" tone={ledger.cashCollect > 0 ? 'good' : 'plain'} value={money(ledger.cashCollect, cy)} />
            <Line label="Bank Collections" tone={ledger.bankCollect > 0 ? 'amber' : 'plain'} value={money(ledger.bankCollect, cy)} />
            <Line label="Total Cash In" total tone="good" value={money(ledger.cashIn, cy)} />
            <Line label="+ Bank / UPI In" value={money(ledger.bankIn, cy)} />

            <Eyebrow className="mt-3.5 mb-1.5 block">Payments</Eyebrow>
            <Line label="Expenses" tone={ledger.totalExpenses > 0 ? 'bad' : 'plain'} value={money(ledger.totalExpenses, cy)} />
            <Line label="Purchase Payments" tone={ledger.totalPurchPaid > 0 ? 'amber' : 'plain'} value={money(ledger.totalPurchPaid, cy)} />
            <Line label="Total Cash Out" total tone="bad" value={money(ledger.cashOut, cy)} />
            <Line label="+ Bank / UPI Purchases" value={money(ledger.bankPurchPaid, cy)} />
          </Box>

          <Box title="Cash Reconciliation" icon={Banknote}
            right={savedLook && (
              <><span className="flex-1" /><Badge tone={savedLook.tone} className="px-[7px] py-0.5 text-[10.5px]"><Check size={10} /> Saved</Badge></>
            )}>
            <Line label="Book Balance" value={<span className={isDeficit ? 'text-bad-text' : ''}>{money(ledger.closingBal, cy)}</span>} />
            {ledger.isLocked ? (
              <>
                <Line label="Counted" value={ledger.savedPhysicalCash != null ? money(ledger.savedPhysicalCash, cy) : '—'} />
                <VarianceStrip look={savedLook} value={savedLook && !savedLook.exact ? varWords(savedLook, ledger.savedVariance) : null} />
              </>
            ) : (
              <>
                <div className="mt-2 flex gap-2">
                  <AmountField cy={cy} className="min-w-0 flex-1" placeholder="Enter physical cash count" aria-label="Physical cash count"
                    value={physicalCash} onChange={e => setPhysicalCash(e.target.value)} />
                  {variance !== null && !isFuture && (
                    <Button variant="outline" size="sm" className="h-10" onClick={handleSavePhysicalCash}><Save /> Save Count</Button>
                  )}
                </div>
                <VarianceStrip look={countLook} value={varWords(countLook, variance)} />
              </>
            )}
          </Box>

          {!ledger.isLocked && ledger.hasOpening && canEdit && !isFuture && (
            <Button size="lg" className="w-full" onClick={() => setShowCloseModal(true)} disabled={isClosing}>
              {isClosing ? <RefreshCcw className="animate-spin" /> : <Lock />} Close &amp; Lock Day
            </Button>
          )}
          {ledger.isLocked && (
            <Banner tone="good" className="text-center"><b className="font-semibold">Day Closed</b></Banner>
          )}
        </div>
      </div>

      {/* ── Bank Reconciliation ───────────────────────────────────────────── */}
      <BankReconciliation className="m-rise mt-4" style={{ '--i': 5 }}
        tenantId={currentTenantId}
        currentUserId={currentUserId}
        selectedDate={selectedDate}
        daySales={ledger.sales}
        dayCollect={ledger.collect}
        dayExpenses={ledger.expenses}
      />

      {showCloseModal && (
        <CloseDayDialog open
          date={selectedDate}
          closingBal={ledger.closingBal}
          cy={cy}
          initialPhysical={physicalCash}
          isClosing={isClosing}
          onCancel={() => setShowCloseModal(false)}
          onConfirm={(pc, note) => { setShowCloseModal(false); handleCloseDay(pc, note); }}
        />
      )}

      {showReport && (
        <DailyLedgerDetail
          date={selectedDate}
          sales={ledger.sales}
          expenses={ledger.expenses}
          openingBalance={ledger.openingBal}
          closingBalance={ledger.closingBal}
          businessProfile={businessProfile}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
};

export default DayBook;
