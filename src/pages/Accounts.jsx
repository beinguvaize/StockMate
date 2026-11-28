import React, { useMemo, useState } from 'react';
import { Plus, ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Pencil, Wallet, AlertTriangle, X } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { useAccounts, loanStats } from '../hooks/useAccounts';
import { cn, formatDate } from '../lib/utils';
import {
  inr, visibleAccounts, upiHandlesFor, mergedBalance, totalBalance, linkedUpiIds, ledgerRows,
  accountSubline, LEDGER_FILTERS,
} from '../lib/accountsView';
import { Button } from '../components/ui/button';
import { CloseButton } from '../components/ui/SidePanel';
import { Pill } from '../components/payroll/parts';
import WriteFailure from '../components/invoices/WriteFailure';
import { AccountIcon, Chips } from '../components/accounts/parts';
import {
  AddAccountDialog, EditAccountDialog, TransferDialog, EntryDialog, PayEmiDialog,
} from '../components/accounts/AccountDialogs';

/**
 * Cash and Bank (web redesign, approved mockups accounts-01 to 13).
 *
 * What the cards and the ledger show is lib/accountsView; every save goes
 * through useAccounts exactly as before (this page adds no writes). A failed
 * save stays in its dialog with the real reason.
 */
const Accounts = () => {
  const { currentTenantId } = useTenant();
  const { addNotification } = useNotifications();
  const {
    accounts, txns, balances, loading, error, refetch,
    createAccount, updateAccount, removeAccount, setDefaultAccount, addTxn, transfer, loanPayments, payEMI,
  } = useAccounts(currentTenantId);

  const [modal, setModal] = useState(null);       // 'add' | 'txn' | 'transfer' | null
  const [editAcc, setEditAcc] = useState(null);
  const [emiFor, setEmiFor] = useState(null);
  const [active, setActive] = useState(null);     // account id whose ledger is open
  const [ledgerFilter, setLedgerFilter] = useState('ALL');
  const [failure, setFailure] = useState(null);   // a failed Set as default

  const cards = useMemo(() => visibleAccounts(accounts), [accounts]);
  const handles = useMemo(() => upiHandlesFor(accounts), [accounts]);
  const total = useMemo(() => totalBalance(accounts, balances), [accounts, balances]);
  const linkedIds = useMemo(() => linkedUpiIds(accounts, active), [accounts, active]);
  const rows = useMemo(() => ledgerRows(txns, active, linkedIds, ledgerFilter), [txns, active, linkedIds, ledgerFilter]);
  const activeAcc = accounts.find((a) => a.id === active);
  const statsOf = (a) => loanStats(a, loanPayments?.[a.id] || []);
  const activeLoan = activeAcc?.type === 'LOAN' ? statsOf(activeAcc) : null;
  const bal = (id) => mergedBalance(id, accounts, balances);

  const openLedger = (id) => { setActive(id); setLedgerFilter('ALL'); };
  const reread = () => refetch?.();
  const done = (res, word) => {
    if (res?.error) return res;
    addNotification(word, 'success');
    return res;
  };

  const makeDefault = async (a) => {
    setFailure(null);
    let res;
    try { res = await setDefaultAccount(a.id); } catch (err) { res = { error: err }; }
    if (res?.error) { console.error('[accounts] set default failed', res.error); setFailure(res.error); return; }
    addNotification(`${a.name} set as default ${a.type.toLowerCase()}`, 'success');
  };

  let body;
  if (error && !loading) {
    // An error must not read as "still loading": the desktop app once sat on
    // "Loading accounts…" forever when the fetch failed.
    body = (
      <div className="m-rise px-5 py-14 text-center" style={{ '--i': 2 }}>
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-bad-soft text-bad-text"><AlertTriangle size={22} strokeWidth={1.8} /></div>
        <h3 className="font-tight text-[16px] font-semibold text-bad-text">Could not load accounts</h3>
        <p className="mt-1 text-[13px] text-body break-words">{error.message || String(error)}</p>
        <Button variant="outline" size="sm" className="mt-3.5" onClick={refetch}>Try again</Button>
      </div>
    );
  } else if (loading) {
    body = <div className="py-16 text-center text-[13px] font-medium text-mute animate-pulse">Loading accounts…</div>;
  } else if (accounts.length === 0) {
    body = (
      <div className="m-rise px-5 py-14 text-center" style={{ '--i': 2 }}>
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-mute"><Wallet size={22} strokeWidth={1.8} /></div>
        <h3 className="font-tight text-[16px] font-semibold text-ink">No accounts yet.</h3>
        <p className="mt-1 text-[13px] text-body">Add a Cash, Bank or Loan account to track money.</p>
      </div>
    );
  } else {
    body = (
      <div className="m-rise grid gap-3 sm:grid-cols-2 lg:grid-cols-3" style={{ '--i': 2 }}>
        {cards.map((a) => {
          const isLoan = a.type === 'LOAN';
          const ls = isLoan ? statsOf(a) : null;
          const ups = handles[a.id];
          const sub = isLoan ? '' : accountSubline(a);
          return (
            <div key={a.id} className={cn('flex flex-col rounded-[14px] border bg-surface p-4 transition-shadow duration-(--dur-press)',
              active === a.id ? 'border-transparent shadow-[inset_0_0_0_2px_var(--color-amber)]' : 'border-line')}>
              <button type="button" onClick={() => openLedger(a.id)} aria-pressed={active === a.id}
                aria-label={`${a.name}: show ${isLoan ? 'repayment history' : 'ledger'}`} className="w-full text-left">
                <span className="flex items-center gap-2">
                  <AccountIcon type={a.type} />
                  <b className="min-w-0 truncate font-tight text-[14px] font-semibold text-ink">{a.name}</b>
                  <span className="flex-1" />
                  {a.is_default && !isLoan && <Pill tone="warn" small>Default</Pill>}
                  <span className="font-tight text-[10.5px] font-semibold tracking-[0.06em] text-mute">{a.type}</span>
                </span>
                {isLoan ? (
                  <>
                    <span className="mt-3 block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Outstanding</span>
                    <span className="mt-0.5 block font-tight text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-bad-text">{inr(ls.outstanding)}</span>
                    <small className="mt-0.5 block text-[12.5px] text-mute">EMI {inr(ls.emi)} · {ls.paid}/{ls.total} paid · {a.loan_rate}% p.a.</small>
                  </>
                ) : (
                  <>
                    <span className="mt-3 block font-tight text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-ink">{inr(bal(a.id))}</span>
                    {sub && <small className="mt-0.5 block text-[12.5px] text-mute">{sub}</small>}
                    {ups?.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">{ups.map((h) => <Pill key={h} small>{h}</Pill>)}</span>
                    )}
                  </>
                )}
              </button>
              <div className="mt-auto flex gap-2 pt-3.5">
                {isLoan ? (
                  ls.outstanding > 0 && <Button variant="dark" size="xs" className="flex-1" onClick={() => setEmiFor(a)}>Pay EMI {inr(ls.emi)}</Button>
                ) : (
                  <>
                    {!a.is_default && <Button variant="outline" size="xs" className="flex-1" onClick={() => makeDefault(a)}>Set as default</Button>}
                    <Button variant="outline" size="xs" className={cn(a.is_default && 'flex-1', '[&_svg]:size-[13px]')}
                      aria-label="Edit account" title="Edit account" onClick={() => setEditAcc(a)}>
                      <Pencil />{a.is_default && 'Edit'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-16">
      <div className="m-rise mb-4 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="font-tight text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">Cash &amp; bank</h1>
          <p className="mt-[3px] text-[13px] text-body">Accounts, balances and money movement</p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setModal('transfer')}><ArrowRightLeft /> Transfer</Button>
          <Button size="sm" onClick={() => setModal('add')}><Plus /> Add account</Button>
        </div>
      </div>

      <div className="m-rise mb-4 flex items-baseline gap-3 rounded-[14px] border border-line px-[18px] py-4" style={{ '--i': 1 }}>
        <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Total balance</span>
        <b className="ml-auto font-tight text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-ink">{inr(total)}</b>
      </div>

      {failure && (
        <div className="mb-3 flex items-start gap-2">
          <WriteFailure error={failure} noun="change" onReread={() => { setFailure(null); reread(); }} className="flex-1" />
          <Button variant="secondary" size="icon-sm" aria-label="Dismiss" onClick={() => setFailure(null)}><X /></Button>
        </div>
      )}

      {body}

      {active && activeAcc && (
        <section className="m-rise mt-4 overflow-hidden rounded-[14px] border border-line bg-surface" aria-label={`${activeAcc.name} ${activeLoan ? 'repayment history' : 'ledger'}`}>
          <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
            <h3 className="min-w-0 truncate font-tight text-[15px] font-semibold text-ink">{activeAcc.name} · {activeLoan ? 'repayment history' : 'ledger'}</h3>
            <span className="flex-1" />
            <b className={cn('font-tight text-[16px] font-semibold tabular-nums', activeLoan ? 'text-bad-text' : 'text-ink')}>
              {activeLoan ? inr(activeLoan.outstanding) : inr(bal(active))}
            </b>
            {!activeLoan && <Button variant="outline" size="xs" className="ml-1.5 [&_svg]:size-[13px]" onClick={() => setModal('txn')}><Plus /> Entry</Button>}
            {activeLoan && activeLoan.outstanding > 0 && <Button variant="dark" size="xs" className="ml-1.5" onClick={() => setEmiFor(activeAcc)}>Pay</Button>}
            <CloseButton onClick={() => setActive(null)} />
          </div>

          {activeLoan ? (
            <>
              <div className="grid grid-cols-3 border-t border-line text-center">
                {[['EMI', inr(activeLoan.emi), ''], ['Interest paid', inr(activeLoan.interestPaid), 'text-amber-text'], ['Paid', `${activeLoan.paid}/${activeLoan.total}`, '']].map(([k, v, c]) => (
                  <div key={k} className="px-4 py-2.5 [&+&]:border-l [&+&]:border-line">
                    <small className="block font-tight text-[10.5px] font-semibold uppercase tracking-[0.06em] text-mute">{k}</small>
                    <b className={cn('font-tight text-[14.5px] font-semibold tabular-nums', c)}>{v}</b>
                  </div>
                ))}
              </div>
              <div className="max-h-[420px] overflow-auto border-t border-line">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="bg-tile text-left font-tight text-[12px] font-semibold text-mute">
                      <th className="px-4 py-2.5 font-semibold">Date</th>
                      <th className="px-4 py-2.5 font-semibold">#</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Interest</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Principal</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {activeLoan.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-7 text-center text-[13px] text-body">No repayments yet.</td></tr>}
                    {activeLoan.rows.map((p, i) => (
                      <tr key={p.id} className="border-t border-sep">
                        <td className="whitespace-nowrap px-4 py-2.5 text-ink-2">{formatDate(p.date)}</td>
                        <td className="px-4 py-2.5"><b className="font-tight font-semibold">{inr(p.amount)}</b> <small className="text-[12px] text-mute">#{i + 1}</small></td>
                        <td className="px-4 py-2.5 text-right text-amber-text">{inr(p.interest)}</td>
                        <td className="px-4 py-2.5 text-right text-good-text">{inr(p.principal)}</td>
                        <td className="px-4 py-2.5 text-right text-ink-2">{inr(p.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              {linkedIds.length > 0 && (
                <Chips ariaLabel="Show entries" className="px-4 pb-2.5" items={LEDGER_FILTERS} value={ledgerFilter} onChange={setLedgerFilter} />
              )}
              {rows.length === 0 ? (
                <p className="px-7 py-7 text-center text-[13px] text-body">No transactions yet.</p>
              ) : (
                <ul className="max-h-[520px] overflow-auto">
                  {rows.map((t) => {
                    const isIn = t.direction === 'IN';
                    return (
                      <li key={t.id} className="flex items-center gap-3 border-t border-sep px-4 py-[11px]">
                        <span aria-hidden="true" className={cn('grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px]', isIn ? 'bg-good-soft text-good-text' : 'bg-bad-soft text-bad-text')}>
                          {isIn ? <ArrowDownLeft size={14} strokeWidth={2.2} /> : <ArrowUpRight size={14} strokeWidth={2.2} />}
                        </span>
                        <div className="min-w-0">
                          <b className="flex flex-wrap items-center gap-1.5 font-tight text-[13.5px] font-semibold text-ink">
                            <span className="min-w-0 break-words">{t.note || t.ref_type}</span>
                            {t.isUpi && <Pill small>UPI</Pill>}
                          </b>
                          <small className="block text-[12px] text-mute">{formatDate(t.date)} · {t.ref_type}</small>
                        </div>
                        <span className="flex-1" />
                        <b className={cn('whitespace-nowrap font-tight text-[13.5px] font-semibold tabular-nums', isIn ? 'text-good-text' : 'text-bad-text')}>
                          {isIn ? '+' : '−'}{inr(t.amount)}
                        </b>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {modal === 'add' && (
        <AddAccountDialog open accounts={accounts} onClose={() => setModal(null)} onReread={reread}
          onSave={async (a) => {
            const res = done(await createAccount(a), 'Account added');
            if (!res?.error) setModal(null);
            return res;
          }} />
      )}

      {editAcc && (
        <EditAccountDialog key={editAcc.id} account={editAcc} accounts={accounts} onClose={() => setEditAcc(null)} onReread={reread}
          onSave={async (patch) => {
            const res = done(await updateAccount(editAcc.id, patch), 'Account updated');
            if (!res?.error) setEditAcc(null);
            return res;
          }}
          onDelete={async () => {
            const res = done(await removeAccount(editAcc.id), 'Account deleted');
            if (!res?.error) { if (active === editAcc.id) setActive(null); setEditAcc(null); }
            return res;
          }} />
      )}

      {modal === 'txn' && activeAcc && (
        <EntryDialog open accountName={activeAcc.name} onClose={() => setModal(null)} onReread={reread}
          onSave={async (t) => {
            const res = done(await addTxn({ ...t, account_id: active }), 'Entry added');
            if (!res?.error) setModal(null);
            return res;
          }} />
      )}

      {modal === 'transfer' && (
        <TransferDialog open accounts={accounts} onClose={() => setModal(null)} onReread={reread}
          onSave={async (t) => {
            const res = done(await transfer(t), 'Transfer done');
            if (!res?.error) setModal(null);
            return res;
          }} />
      )}

      {emiFor && (
        <PayEmiDialog key={emiFor.id} loan={emiFor} accounts={accounts.filter((a) => a.type !== 'LOAN')} stats={statsOf(emiFor)}
          onClose={() => setEmiFor(null)} onReread={reread}
          onSave={async (fromAccountId, amount) => {
            const res = done(await payEMI({ loan: emiFor, fromAccountId, amount }), 'Payment recorded');
            if (!res?.error) setEmiFor(null);
            return res;
          }} />
      )}
    </div>
  );
};

export default Accounts;
