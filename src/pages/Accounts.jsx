import React, { useMemo, useState } from 'react';
import {
  Wallet, Landmark, CreditCard, Banknote, Plus, ArrowRightLeft,
  ArrowUpRight, ArrowDownLeft, X, Trash2,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { useAccounts } from '../hooks/useAccounts';

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
  const { accounts, txns, balances, loading, createAccount, removeAccount, addTxn, transfer } = useAccounts(currentTenantId);

  const [modal, setModal] = useState(null); // 'add' | 'txn' | 'transfer' | null
  const [active, setActive] = useState(null); // account id for ledger view

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + (balances[a.id] || 0), 0),
    [accounts, balances],
  );
  const activeTxns = useMemo(
    () => active ? txns.filter((t) => t.account_id === active) : [],
    [txns, active],
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink-primary leading-none">Cash &amp; bank<span className="text-accent-signature">.</span></h1>
          <p className="text-xs text-gray-400 font-medium mt-1">Accounts, balances and money movement</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setModal('transfer')} className="px-3 py-2 rounded-xl text-[12px] font-bold border border-black/10 hover:bg-black/5"><ArrowRightLeft size={14} className="inline -mt-0.5 mr-1.5" />Transfer</button>
          <button onClick={() => setModal('add')} className="px-4 py-2 rounded-xl text-[12px] font-black bg-accent-signature text-white hover:opacity-90"><Plus size={14} className="inline -mt-0.5 mr-1" />Add account</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 flex items-baseline gap-3">
        <span className="text-[11px] uppercase tracking-widest text-gray-400">Total balance</span>
        <span className="text-2xl font-black font-mono text-ink-primary ml-auto">{inr(totalBalance)}</span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm font-bold animate-pulse">Loading accounts…</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Wallet size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-bold">No accounts yet.</p>
          <p className="text-[12px] mt-1">Add a Cash, Bank or Loan account to track money.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((a) => {
            const Icon = iconFor(a.type);
            return (
              <button key={a.id} onClick={() => setActive(a.id)}
                className={`text-left bg-white rounded-2xl border shadow-sm p-4 hover:border-accent-signature/40 transition-colors ${active === a.id ? 'border-accent-signature' : 'border-black/5'}`}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 grid place-items-center"><Icon size={16} /></div>
                  <div className="font-black text-[13px] text-ink-primary">{a.name}</div>
                  <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-gray-400">{a.type}</span>
                </div>
                <div className="mt-3 font-mono font-black text-xl text-ink-primary">{inr(balances[a.id] || 0)}</div>
                {a.bank_name && <div className="text-[11px] text-gray-400 mt-0.5">{a.bank_name} {a.account_no ? `· ${a.account_no}` : ''}</div>}
              </button>
            );
          })}
        </div>
      )}

      {/* Ledger drawer */}
      {active && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5">
            <div className="font-black text-[13px] text-ink-primary">{accounts.find((a) => a.id === active)?.name} · ledger</div>
            <span className="ml-auto font-mono font-black text-[15px]">{inr(balances[active] || 0)}</span>
            <button onClick={() => setModal('txn')} className="ml-3 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-black/10 hover:bg-black/5"><Plus size={12} className="inline -mt-0.5 mr-1" />Entry</button>
            <button onClick={() => setActive(null)} className="p-1.5 rounded-lg hover:bg-black/5"><X size={15} /></button>
          </div>
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
        </div>
      )}

      {modal === 'add' && <AddAccountModal onClose={() => setModal(null)} onSave={async (a) => {
        const { error } = await createAccount(a);
        if (error) return addNotification('Add failed: ' + error.message, 'error');
        addNotification('Account added', 'success'); setModal(null);
      }} onDelete={removeAccount} />}

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
    </div>
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

const AddAccountModal = ({ onClose, onSave }) => {
  const [f, setF] = useState({ name: '', type: 'BANK', bank_name: '', account_no: '', opening_balance: '' });
  return (
    <Shell title="Add account" onClose={onClose}>
      <label className={lbl}>Account name</label>
      <input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. SBI Current" />
      <label className={`${lbl} mt-3`}>Type</label>
      <div className="flex gap-1.5 flex-wrap">
        {TYPES.map((t) => (
          <button key={t.id} onClick={() => setF({ ...f, type: t.id })}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border ${f.type === t.id ? 'bg-accent-signature text-white border-accent-signature' : 'border-black/10 text-gray-500'}`}>{t.label}</button>
        ))}
      </div>
      {(f.type === 'BANK' || f.type === 'LOAN') && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div><label className={lbl}>Bank</label><input className={inp} value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></div>
          <div><label className={lbl}>A/c no.</label><input className={inp} value={f.account_no} onChange={(e) => setF({ ...f, account_no: e.target.value })} /></div>
        </div>
      )}
      <label className={`${lbl} mt-3`}>Opening balance</label>
      <input type="number" className={inp} value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} placeholder="0.00" />
      <button disabled={!f.name.trim()} className={primary} onClick={() => onSave(f)}>Add account</button>
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

export default Accounts;
