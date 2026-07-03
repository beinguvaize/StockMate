import React, { useMemo, useState } from 'react';
import {
  Wallet, Landmark, CreditCard, Banknote, Plus, ArrowRightLeft,
  ArrowUpRight, ArrowDownLeft, X, Trash2, Pencil,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { useAccounts, emiOf, loanStats } from '../hooks/useAccounts';

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TYPES = [
  { id: 'CASH', label: 'Cash', icon: Banknote },
  { id: 'BANK', label: 'Bank', icon: Landmark },
  { id: 'UPI', label: 'UPI', icon: Wallet },
  { id: 'CARD', label: 'Card', icon: CreditCard },
  { id: 'LOAN', label: 'Loan', icon: Landmark },
];
const iconFor = (t) => (TYPES.find((x) => x.id === t) || TYPES[1]).icon;

const Accounts = () => {
  const { currentTenantId } = useTenant();
  const { addNotification } = useNotifications();
  const { accounts, txns, balances, loading, createAccount, updateAccount, removeAccount, setDefaultAccount, addTxn, transfer, loanPayments, payEMI } = useAccounts(currentTenantId);
  const [emiFor, setEmiFor] = useState(null); // loan account → pay-EMI modal
  const [editAcc, setEditAcc] = useState(null); // account being edited

  const [modal, setModal] = useState(null); // 'add' | 'txn' | 'transfer' | null
  const [active, setActive] = useState(null); // account id for ledger view

  // Linked UPI accounts merge into their bank's card — not shown standalone.
  const isLinkedUpi = (a) => a.type === 'UPI' && a.linked_bank_account_id;
  const visibleAccounts = useMemo(() => accounts.filter((a) => !isLinkedUpi(a)), [accounts]);
  const upiHandlesFor = useMemo(() => {
    const map = {};
    accounts.filter(isLinkedUpi).forEach((u) => {
      (map[u.linked_bank_account_id] = map[u.linked_bank_account_id] || []).push(u.upi_id || u.name);
    });
    return map;
  }, [accounts]);

  // Merged balance = account's own + any linked UPI accounts folded in (so a
  // stray pre-link balance parked on a now-hidden UPI account never vanishes).
  const mergedBalance = (id) =>
    (balances[id] || 0) + (upiHandlesFor[id]?.length ? accounts.filter((u) => u.linked_bank_account_id === id).reduce((s, u) => s + (balances[u.id] || 0), 0) : 0);

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + (balances[a.id] || 0), 0),
    [accounts, balances],
  );
  // Include historic txns posted directly to a since-linked UPI account, so a
  // merged bank card's ledger shows its full money trail, not just post-link entries.
  const linkedUpiIds = useMemo(
    () => accounts.filter(isLinkedUpi).filter((u) => u.linked_bank_account_id === active).map((u) => u.id),
    [accounts, active],
  );
  const activeTxns = useMemo(
    () => active ? txns.filter((t) => t.account_id === active || linkedUpiIds.includes(t.account_id)) : [],
    [txns, active, linkedUpiIds],
  );
  const activeAcc = accounts.find((a) => a.id === active);
  const activeLoan = activeAcc?.type === 'LOAN'
    ? loanStats(activeAcc, loanPayments?.[active] || [])
    : null;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary leading-none">Cash &amp; bank</h1>
          <p className="text-[12px] text-gray-400 mt-1">Accounts, balances and money movement</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setModal('transfer')} className="px-3 py-2 rounded-lg text-[12px] font-semibold border border-black/10 text-gray-600 hover:bg-black/5 transition-colors"><ArrowRightLeft size={14} className="inline -mt-0.5 mr-1.5" />Transfer</button>
          <button onClick={() => setModal('add')} className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-accent-signature text-white hover:opacity-90 transition-opacity"><Plus size={14} className="inline -mt-0.5 mr-1" />Add account</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-black/8 shadow-sm p-4 flex items-baseline gap-3">
        <span className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Total balance</span>
        <span className="text-2xl font-semibold font-mono text-ink-primary ml-auto tabular-nums">{inr(totalBalance)}</span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm font-medium animate-pulse">Loading accounts…</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Wallet size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold text-gray-500">No accounts yet.</p>
          <p className="text-[12px] mt-1">Add a Cash, Bank or Loan account to track money.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleAccounts.map((a) => {
            const Icon = iconFor(a.type);
            const isLoan = a.type === 'LOAN';
            const ls = isLoan ? loanStats(a, loanPayments?.[a.id] || []) : null;
            const linkedUpi = upiHandlesFor[a.id];
            return (
              <div key={a.id}
                className={`text-left bg-white rounded-xl border shadow-sm p-4 transition-colors ${active === a.id ? 'border-accent-signature ring-1 ring-accent-signature/20' : 'border-black/8'}`}>
                <button onClick={() => setActive(a.id)} className="w-full text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-canvas border border-black/8 text-ink-primary grid place-items-center"><Icon size={15} /></div>
                    <div className="font-semibold text-[13px] text-ink-primary">{a.name}</div>
                    <div className="ml-auto flex items-center gap-1.5">
                      {a.is_default && !isLoan && (
                        <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-accent-signature/10 text-accent-signature border border-accent-signature/20">Default</span>
                      )}
                      <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{a.type}</span>
                    </div>
                  </div>
                  {isLoan ? (
                    <>
                      <div className="mt-3 text-[10px] uppercase tracking-wide text-gray-400 font-medium">Outstanding</div>
                      <div className="font-mono font-semibold text-xl text-rose-600 tabular-nums">{inr(ls.outstanding)}</div>
                      <div className="text-[11px] text-gray-500 mt-1">EMI {inr(ls.emi)} · {ls.paid}/{ls.total} paid · {a.loan_rate}% p.a.</div>
                    </>
                  ) : (
                    <>
                      <div className="mt-3 font-mono font-semibold text-xl text-ink-primary tabular-nums">{inr(mergedBalance(a.id))}</div>
                      {a.bank_name && <div className="text-[11px] text-gray-400 mt-0.5">{a.bank_name} {a.account_no ? `· ${a.account_no}` : ''}</div>}
                      {a.upi_id && !a.bank_name && <div className="text-[11px] text-gray-400 mt-0.5">{a.upi_id}</div>}
                      {linkedUpi?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {linkedUpi.map((h) => (
                            <span key={h} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas border border-black/8 text-gray-500">{h}</span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </button>
                {isLoan && ls.outstanding > 0 && (
                  <button onClick={() => setEmiFor(a)} className="mt-3 w-full py-2 rounded-lg text-[11px] font-semibold bg-accent-signature text-white hover:opacity-90 transition-opacity">Pay EMI {inr(ls.emi)}</button>
                )}
                {!isLoan && (
                  <div className="mt-3 flex gap-2">
                    {!a.is_default && (
                      <button
                        onClick={async () => {
                          const { error } = await setDefaultAccount(a.id);
                          if (error) addNotification('Failed: ' + error.message, 'error');
                          else addNotification(`${a.name} set as default ${a.type.toLowerCase()}`, 'success');
                        }}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border border-black/10 text-gray-500 hover:bg-black/5 transition-colors"
                      >
                        Set as default
                      </button>
                    )}
                    <button
                      onClick={() => setEditAcc(a)}
                      className={`${a.is_default ? 'flex-1' : ''} px-3 py-1.5 rounded-lg border border-black/10 text-gray-500 hover:bg-black/5 transition-colors flex items-center justify-center gap-1.5`}
                      title="Edit account"
                    >
                      <Pencil size={13} />
                      {a.is_default && <span className="text-[11px] font-semibold">Edit</span>}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ledger drawer */}
      {active && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5">
            <div className="font-black text-[13px] text-ink-primary">{activeAcc?.name} · {activeLoan ? 'repayment history' : 'ledger'}</div>
            <span className="ml-auto font-mono font-black text-[15px]">{activeLoan ? inr(activeLoan.outstanding) : inr(mergedBalance(active))}</span>
            {!activeLoan && <button onClick={() => setModal('txn')} className="ml-3 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-black/10 hover:bg-black/5"><Plus size={12} className="inline -mt-0.5 mr-1" />Entry</button>}
            {activeLoan && activeLoan.outstanding > 0 && <button onClick={() => setEmiFor(activeAcc)} className="ml-3 px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-accent-signature text-white">Pay</button>}
            <button onClick={() => setActive(null)} className="p-1.5 rounded-lg hover:bg-black/5"><X size={15} /></button>
          </div>
          {activeLoan ? (
            <>
              <div className="grid grid-cols-3 gap-px bg-black/[0.06] border-b border-black/[0.06] text-center">
                <div className="bg-white px-3 py-2"><div className="text-[9px] uppercase tracking-widest text-gray-400">EMI</div><div className="font-mono font-bold text-[13px]">{inr(activeLoan.emi)}</div></div>
                <div className="bg-white px-3 py-2"><div className="text-[9px] uppercase tracking-widest text-gray-400">Interest paid</div><div className="font-mono font-bold text-[13px] text-amber-700">{inr(activeLoan.interestPaid)}</div></div>
                <div className="bg-white px-3 py-2"><div className="text-[9px] uppercase tracking-widest text-gray-400">Paid</div><div className="font-mono font-bold text-[13px]">{activeLoan.paid}/{activeLoan.total}</div></div>
              </div>
              <div className="grid grid-cols-[80px_1fr_90px_90px_100px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-400 border-b border-black/5">
                <div>Date</div><div>#</div><div className="text-right">Interest</div><div className="text-right">Principal</div><div className="text-right">Balance</div>
              </div>
              <div className="divide-y divide-black/5 max-h-72 overflow-auto">
                {activeLoan.rows.length === 0 && <div className="p-4 text-[12px] text-gray-400">No repayments yet.</div>}
                {activeLoan.rows.map((p, i) => (
                  <div key={p.id} className="grid grid-cols-[80px_1fr_90px_90px_100px] gap-2 px-4 py-2.5 items-center text-[12px]">
                    <div className="font-mono text-gray-500">{p.date}</div>
                    <div className="font-mono font-bold">{inr(p.amount)} <span className="text-[10px] text-gray-400">#{i + 1}</span></div>
                    <div className="text-right font-mono text-amber-700">{inr(p.interest)}</div>
                    <div className="text-right font-mono text-emerald-700">{inr(p.principal)}</div>
                    <div className="text-right font-mono text-gray-500">{inr(p.balanceAfter)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
          <div className="divide-y divide-black/5 max-h-80 overflow-auto">
            {activeTxns.length === 0 && <div className="p-4 text-[12px] text-gray-400">No transactions yet.</div>}
            {activeTxns.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-7 h-7 rounded-lg grid place-items-center ${t.direction === 'IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                  {t.direction === 'IN' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                </div>
                <div className="leading-tight">
                  <div className="text-[12px] font-bold text-ink-primary">{t.note || t.ref_type}</div>
                  <div className="text-[10px] text-gray-400">{t.date} · {t.ref_type}</div>
                </div>
                <div className={`ml-auto font-mono font-bold text-[13px] ${t.direction === 'IN' ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {t.direction === 'IN' ? '+' : '−'}{inr(t.amount)}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {modal === 'add' && <AddAccountModal accounts={accounts} onClose={() => setModal(null)} onSave={async (a) => {
        const { error } = await createAccount(a);
        if (error) return addNotification('Add failed: ' + error.message, 'error');
        addNotification('Account added', 'success'); setModal(null);
      }} />}

      {editAcc && <EditAccountModal account={editAcc} accounts={accounts} onClose={() => setEditAcc(null)} onSave={async (patch) => {
        const { error } = await updateAccount(editAcc.id, patch);
        if (error) return addNotification('Update failed: ' + error.message, 'error');
        addNotification('Account updated', 'success'); setEditAcc(null);
      }} onDelete={async () => {
        const { error } = await removeAccount(editAcc.id);
        if (error) return addNotification('Delete failed: ' + error.message, 'error');
        addNotification('Account deleted', 'success');
        setEditAcc(null);
        if (active === editAcc.id) setActive(null);
      }} />}

      {modal === 'txn' && active && <TxnModal accountName={accounts.find((a) => a.id === active)?.name} onClose={() => setModal(null)} onSave={async (t) => {
        const { error } = await addTxn({ ...t, account_id: active });
        if (error) return addNotification('Entry failed: ' + error.message, 'error');
        addNotification('Entry added', 'success'); setModal(null);
      }} />}

      {modal === 'transfer' && <TransferModal accounts={accounts} onClose={() => setModal(null)} onSave={async (t) => {
        const { error } = await transfer(t);
        if (error) return addNotification(error.message, 'error');
        addNotification('Transfer done', 'success'); setModal(null);
      }} />}

      {emiFor && <PayEMIModal loan={emiFor} accounts={accounts.filter((a) => a.type !== 'LOAN')}
        stats={loanStats(emiFor, loanPayments?.[emiFor.id] || [])}
        onClose={() => setEmiFor(null)} onSave={async (fromAccountId, amount) => {
          const { error } = await payEMI({ loan: emiFor, fromAccountId, amount });
          if (error) return addNotification(error.message, 'error');
          addNotification('Payment recorded', 'success'); setEmiFor(null);
        }} />}
    </div>
  );
};

const PayEMIModal = ({ loan, accounts, stats, onClose, onSave }) => {
  const [from, setFrom] = useState(accounts.find((a) => a.type === 'BANK')?.id || accounts[0]?.id || '');
  const [amount, setAmount] = useState(String(stats.emi));
  const amt = Number(amount) || 0;
  const interest = Math.round(stats.outstanding * ((Number(loan.loan_rate) || 0) / 12 / 100));
  const principal = Math.max(0, Math.round(amt) - interest);
  return (
    <Shell title={`Loan payment · ${loan.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 text-[12px] mb-3">
        <div><div className="text-gray-400">EMI</div><div className="font-mono font-bold">{inr(stats.emi)}</div></div>
        <div><div className="text-gray-400">Outstanding</div><div className="font-mono font-bold text-rose-600">{inr(stats.outstanding)}</div></div>
        <div className="col-span-2 text-[11px] text-gray-500">{stats.paid}/{stats.total} paid · interest paid {inr(stats.interestPaid)}</div>
      </div>
      <label className={lbl}>Amount (EMI or custom / prepay)</label>
      <input type="number" className={inp} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="flex gap-1.5 mt-1.5">
        <button onClick={() => setAmount(String(stats.emi))} className="text-[11px] font-bold px-2 py-1 rounded border border-black/10">EMI</button>
        <button onClick={() => setAmount(String(stats.outstanding + interest))} className="text-[11px] font-bold px-2 py-1 rounded border border-black/10">Foreclose</button>
      </div>
      {amt > 0 && <div className="text-[11px] text-gray-500 mt-2">Interest {inr(interest)} · Principal {inr(principal)}</div>}
      <label className={`${lbl} mt-3`}>Pay from</label>
      <select className={inp} value={from} onChange={(e) => setFrom(e.target.value)}>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button disabled={!from || !(amt > 0)} className={primary} onClick={() => onSave(from, amt)}>Pay {inr(amt)}</button>
    </Shell>
  );
};

const Shell = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center mb-4"><div className="font-black text-[15px] text-ink-primary">{title}</div><button onClick={onClose} className="ml-auto"><X size={18} className="text-gray-400" /></button></div>
      {children}
    </div>
  </div>
);
const lbl = 'text-[10px] uppercase tracking-widest text-gray-400 mb-1 block';
const inp = 'w-full text-[14px] border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-accent-signature/40';
const primary = 'w-full mt-4 py-2.5 rounded-xl text-[13px] font-black bg-accent-signature text-white hover:opacity-90 disabled:opacity-40';

const AddAccountModal = ({ onClose, onSave, accounts = [] }) => {
  const [f, setF] = useState({ name: '', type: 'BANK', bank_name: '', account_no: '', upi_id: '', opening_balance: '', loan_principal: '', loan_rate: '', loan_tenure_months: '', loan_start: new Date().toISOString().slice(0, 10), lender: '', linked_bank_account_id: '' });
  const isLoan = f.type === 'LOAN';
  const bankAccounts = accounts.filter((a) => a.type === 'BANK' && !a.deleted_at);
  const previewEmi = isLoan ? emiOf(f.loan_principal, f.loan_rate, f.loan_tenure_months) : 0;
  return (
    <Shell title="Add account" onClose={onClose}>
      <label className={lbl}>{isLoan ? 'Loan name' : 'Account name'}</label>
      <input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={isLoan ? 'e.g. Shop loan' : 'e.g. SBI Current'} />
      <label className={`${lbl} mt-3`}>Type</label>
      <div className="flex gap-1.5 flex-wrap">
        {TYPES.map((t) => (
          <button key={t.id} onClick={() => setF({ ...f, type: t.id })}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border ${f.type === t.id ? 'bg-accent-signature text-white border-accent-signature' : 'border-black/10 text-gray-500'}`}>{t.label}</button>
        ))}
      </div>
      {(f.type === 'BANK') && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div><label className={lbl}>Bank</label><input className={inp} value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></div>
          <div><label className={lbl}>A/c no.</label><input className={inp} value={f.account_no} onChange={(e) => setF({ ...f, account_no: e.target.value })} /></div>
        </div>
      )}
      {(f.type === 'UPI' || f.type === 'BANK') && (
        <div className="mt-3">
          <label className={lbl}>UPI ID / Handle <span className="text-gray-300 normal-case tracking-normal">(e.g. shop@upi)</span></label>
          <input className={inp} value={f.upi_id} onChange={(e) => setF({ ...f, upi_id: e.target.value })} placeholder="e.g. 9876543210@okicici" />
        </div>
      )}
      {(f.type === 'UPI') && bankAccounts.length > 0 && (
        <div className="mt-3">
          <label className={lbl}>Settles to bank account</label>
          <select className={inp} value={f.linked_bank_account_id} onChange={(e) => setF({ ...f, linked_bank_account_id: e.target.value })}>
            <option value="">— Auto (first bank) —</option>
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.bank_name ? ` · ${a.bank_name}` : ''}</option>)}
          </select>
        </div>
      )}
      {isLoan ? (
        <>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div><label className={lbl}>Lender</label><input className={inp} value={f.lender} onChange={(e) => setF({ ...f, lender: e.target.value })} placeholder="HDFC Bank" /></div>
            <div><label className={lbl}>Principal (₹)</label><input type="number" className={inp} value={f.loan_principal} onChange={(e) => setF({ ...f, loan_principal: e.target.value })} placeholder="500000" /></div>
            <div><label className={lbl}>Interest % p.a.</label><input type="number" className={inp} value={f.loan_rate} onChange={(e) => setF({ ...f, loan_rate: e.target.value })} placeholder="12" /></div>
            <div><label className={lbl}>Tenure (months)</label><input type="number" className={inp} value={f.loan_tenure_months} onChange={(e) => setF({ ...f, loan_tenure_months: e.target.value })} placeholder="36" /></div>
          </div>
          <label className={`${lbl} mt-3`}>Start date</label>
          <input type="date" className={inp} value={f.loan_start} onChange={(e) => setF({ ...f, loan_start: e.target.value })} />
          {previewEmi > 0 && <div className="mt-2 text-[12px] font-bold text-emerald-700">Monthly EMI ≈ {inr(previewEmi)}</div>}
        </>
      ) : (
        <>
          <label className={`${lbl} mt-3`}>Opening balance</label>
          <input type="number" className={inp} value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} placeholder="0.00" />
        </>
      )}
      <button disabled={!f.name.trim() || (isLoan && !(previewEmi > 0))} className={primary} onClick={() => onSave(f)}>{isLoan ? 'Add loan' : 'Add account'}</button>
    </Shell>
  );
};

const TxnModal = ({ accountName, onClose, onSave }) => {
  const [f, setF] = useState({ direction: 'IN', amount: '', note: '', date: new Date().toISOString().slice(0, 10) });
  return (
    <Shell title={`Entry · ${accountName}`} onClose={onClose}>
      <div className="flex gap-2">
        {['IN', 'OUT'].map((d) => (
          <button key={d} onClick={() => setF({ ...f, direction: d })}
            className={`flex-1 py-2 rounded-lg text-[12px] font-black border ${f.direction === d ? (d === 'IN' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600') : 'border-black/10 text-gray-500'}`}>
            {d === 'IN' ? 'Money in' : 'Money out'}</button>
        ))}
      </div>
      <label className={`${lbl} mt-3`}>Amount</label>
      <input type="number" className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" />
      <label className={`${lbl} mt-3`}>Note</label>
      <input className={inp} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Cash deposit" />
      <label className={`${lbl} mt-3`}>Date</label>
      <input type="date" className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <button disabled={!(Number(f.amount) > 0)} className={primary} onClick={() => onSave(f)}>Save entry</button>
    </Shell>
  );
};

const TransferModal = ({ accounts, onClose, onSave }) => {
  const [f, setF] = useState({ from: accounts[0]?.id || '', to: accounts[1]?.id || '', amount: '', date: new Date().toISOString().slice(0, 10) });
  return (
    <Shell title="Transfer money" onClose={onClose}>
      <label className={lbl}>From</label>
      <select className={inp} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <label className={`${lbl} mt-3`}>To</label>
      <select className={inp} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <label className={`${lbl} mt-3`}>Amount</label>
      <input type="number" className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" />
      <button disabled={!(Number(f.amount) > 0) || f.from === f.to} className={primary} onClick={() => onSave(f)}>Transfer</button>
    </Shell>
  );
};

const EditAccountModal = ({ account, accounts, onClose, onSave, onDelete }) => {
  const [f, setF] = useState({
    name: account.name || '',
    bank_name: account.bank_name || '',
    account_no: account.account_no || '',
    upi_id: account.upi_id || '',
    linked_bank_account_id: account.linked_bank_account_id || '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isBank = account.type === 'BANK';
  const isUpi  = account.type === 'UPI';
  const bankAccounts = accounts.filter((a) => a.type === 'BANK' && !a.deleted_at && a.id !== account.id);
  return (
    <Shell title={`Edit · ${account.type}`} onClose={onClose}>
      <label className={lbl}>Account name</label>
      <input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. SBI Current" />
      {isBank && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div><label className={lbl}>Bank</label><input className={inp} value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></div>
          <div><label className={lbl}>A/c no.</label><input className={inp} value={f.account_no} onChange={(e) => setF({ ...f, account_no: e.target.value })} /></div>
        </div>
      )}
      {(isUpi || isBank) && (
        <div className="mt-3">
          <label className={lbl}>UPI ID / Handle <span className="text-gray-300 normal-case tracking-normal">(e.g. shop@upi)</span></label>
          <input className={inp} value={f.upi_id} onChange={(e) => setF({ ...f, upi_id: e.target.value })} placeholder="e.g. 9876543210@okicici" />
        </div>
      )}
      {isUpi && (
        <div className="mt-3">
          <label className={lbl}>Settles to bank account <span className="text-gray-300 normal-case tracking-normal">(where UPI money actually lands)</span></label>
          <select className={inp} value={f.linked_bank_account_id} onChange={(e) => setF({ ...f, linked_bank_account_id: e.target.value })}>
            <option value="">— Auto (first bank) —</option>
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.bank_name ? ` · ${a.bank_name}` : ''}</option>)}
          </select>
          {bankAccounts.length === 0 && <p className="text-[10px] text-amber-600 mt-1">No bank accounts yet — add one first to link this UPI ID.</p>}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400 bg-canvas rounded-lg px-3 py-2">
        <span>Opening balance</span>
        <span className="font-mono font-semibold text-gray-500">{inr(account.opening_balance)}</span>
      </div>
      <button disabled={!f.name.trim()} className={primary} onClick={() => onSave(f)}>Save changes</button>

      {onDelete && (
        confirmDelete ? (
          <div className="mt-3 border border-rose-200 bg-rose-50 rounded-lg p-3">
            <p className="text-[11px] text-rose-700 font-medium mb-2">Delete "{account.name}"? Transaction history stays, but the account is removed from the list.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border border-black/10 text-gray-600 hover:bg-black/5">Cancel</button>
              <button onClick={onDelete} className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-600 text-white hover:opacity-90">Delete account</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="mt-3 w-full py-2 rounded-lg text-[11px] font-semibold text-rose-500 border border-rose-200 hover:bg-rose-50 transition-colors flex items-center justify-center gap-1.5">
            <Trash2 size={13} /> Delete account
          </button>
        )
      )}
    </Shell>
  );
};

export default Accounts;
