import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import WriteFailure from '../invoices/WriteFailure';
import { emiOf } from '../../hooks/useAccounts';
import { todayISOInAppTZ } from '../../lib/utils';
import {
  ACCOUNT_TYPES, inr, emiPreview, defaultPayFrom, settleBanks, canTransfer, canSaveEntry,
} from '../../lib/accountsView';
import { Chips, Field, fieldCls } from './parts';

/**
 * The Cash and Bank dialogs (approved mockups accounts-04 to 10).
 *
 * Each one hands its form to `onSave`, which calls the same useAccounts
 * function the page always called and returns `{ error }`. A failure stays in
 * the dialog with its real reason (WriteFailure): a refusal says "Not saved",
 * a dropped connection says it could not be confirmed and offers a re-read,
 * and the form is kept either way.
 */

const SubmitButton = ({ children, ...props }) => (
  <Button className="mt-[18px] h-11 w-full" {...props}>{children}</Button>
);

function useSave(onSave) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const run = async (...args) => {
    setBusy(true); setFailure(null);
    let res;
    try { res = await onSave(...args); } catch (err) { res = { error: err }; }
    setBusy(false);
    if (res?.error) { console.error('[accounts] save failed', res.error); setFailure(res.error); }
  };
  return { busy, failure, run };
}

const Failure = ({ error, noun, onReread }) => (error ? <WriteFailure error={error} noun={noun} onReread={onReread} className="mt-3.5" /> : null);

/* ── Add account (04 bank, 05 loan) ─────────────────────────────────────── */
export function AddAccountDialog({ open, accounts = [], onClose, onSave, onReread }) {
  const [f, setF] = useState(() => ({
    name: '', type: 'BANK', bank_name: '', account_no: '', upi_id: '', opening_balance: '',
    loan_principal: '', loan_rate: '', loan_tenure_months: '', loan_start: todayISOInAppTZ(), lender: '', linked_bank_account_id: '',
  }));
  const { busy, failure, run } = useSave(onSave);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isLoan = f.type === 'LOAN';
  const banks = settleBanks(accounts);
  const previewEmi = isLoan ? emiOf(f.loan_principal, f.loan_rate, f.loan_tenure_months) : 0;
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title="Add account" width={440}>
      <Field label={isLoan ? 'Loan name' : 'Account name'} htmlFor="acc-name">
        <input id="acc-name" className={fieldCls} value={f.name} onChange={set('name')} placeholder={isLoan ? 'e.g. Shop loan' : 'e.g. Current account'} />
      </Field>
      <Field label="Type">
        <Chips ariaLabel="Account type" items={ACCOUNT_TYPES.map((t) => [t.id, t.label])} value={f.type} onChange={(type) => setF({ ...f, type })} />
      </Field>
      {f.type === 'BANK' && (
        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <Field label="Bank" htmlFor="acc-bank" className="mt-0"><input id="acc-bank" className={fieldCls} value={f.bank_name} onChange={set('bank_name')} /></Field>
          <Field label="A/c no." htmlFor="acc-no" className="mt-0"><input id="acc-no" className={fieldCls} value={f.account_no} onChange={set('account_no')} /></Field>
        </div>
      )}
      {(f.type === 'UPI' || f.type === 'BANK') && (
        <Field label="UPI ID / Handle" hint="(e.g. shop@upi)" htmlFor="acc-upi">
          <input id="acc-upi" className={fieldCls} value={f.upi_id} onChange={set('upi_id')} placeholder="e.g. 9876543210@okicici" />
        </Field>
      )}
      {f.type === 'UPI' && banks.length > 0 && (
        <Field label="Settles to bank account" htmlFor="acc-settle">
          <select id="acc-settle" className={fieldCls} value={f.linked_bank_account_id} onChange={set('linked_bank_account_id')}>
            <option value="">— Auto (first bank) —</option>
            {banks.map((a) => <option key={a.id} value={a.id}>{a.name}{a.bank_name ? ` · ${a.bank_name}` : ''}</option>)}
          </select>
        </Field>
      )}
      {isLoan ? (
        <>
          <div className="mt-3.5 grid grid-cols-2 gap-3">
            <Field label="Lender" htmlFor="acc-lender" className="mt-0"><input id="acc-lender" className={fieldCls} value={f.lender} onChange={set('lender')} placeholder="Bank name" /></Field>
            <Field label="Principal (₹)" htmlFor="acc-principal" className="mt-0"><input id="acc-principal" type="number" className={fieldCls} value={f.loan_principal} onChange={set('loan_principal')} placeholder="500000" /></Field>
            <Field label="Interest % p.a." htmlFor="acc-rate" className="mt-0"><input id="acc-rate" type="number" className={fieldCls} value={f.loan_rate} onChange={set('loan_rate')} placeholder="12" /></Field>
            <Field label="Tenure (months)" htmlFor="acc-tenure" className="mt-0"><input id="acc-tenure" type="number" className={fieldCls} value={f.loan_tenure_months} onChange={set('loan_tenure_months')} placeholder="36" /></Field>
          </div>
          <Field label="Start date" htmlFor="acc-start">
            <input id="acc-start" type="date" className={fieldCls} value={f.loan_start} onChange={set('loan_start')} />
          </Field>
          {previewEmi > 0 && <p className="mt-2 font-tight text-[13px] font-semibold text-good-text">Monthly EMI ≈ {inr(previewEmi)}</p>}
        </>
      ) : (
        <Field label="Opening balance" htmlFor="acc-open">
          <input id="acc-open" type="number" className={fieldCls} value={f.opening_balance} onChange={set('opening_balance')} placeholder="0.00" />
        </Field>
      )}
      <Failure error={failure} noun="account" onReread={onReread} />
      <SubmitButton disabled={busy || !f.name.trim() || (isLoan && !(previewEmi > 0))} onClick={() => run(f)}>
        {busy ? 'Saving…' : isLoan ? 'Add loan' : 'Add account'}
      </SubmitButton>
    </Dialog>
  );
}

/* ── Edit account (06) and its delete confirm (07) ──────────────────────── */
export function EditAccountDialog({ account, accounts = [], onClose, onSave, onDelete, onReread }) {
  const [f, setF] = useState(() => ({
    name: account?.name || '', bank_name: account?.bank_name || '', account_no: account?.account_no || '',
    upi_id: account?.upi_id || '', linked_bank_account_id: account?.linked_bank_account_id || '',
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSave(onSave);
  const del = useSave(onDelete);
  const busy = save.busy || del.busy;
  if (!account) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isBank = account.type === 'BANK';
  const isUpi = account.type === 'UPI';
  const banks = settleBanks(accounts, account.id);
  return (
    <Dialog open={!!account} onClose={busy ? () => {} : onClose} title={`Edit · ${account.type}`} width={440}>
      <Field label="Account name" htmlFor="edit-name">
        <input id="edit-name" className={fieldCls} value={f.name} onChange={set('name')} placeholder="e.g. Current account" />
      </Field>
      {isBank && (
        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <Field label="Bank" htmlFor="edit-bank" className="mt-0"><input id="edit-bank" className={fieldCls} value={f.bank_name} onChange={set('bank_name')} /></Field>
          <Field label="A/c no." htmlFor="edit-no" className="mt-0"><input id="edit-no" className={fieldCls} value={f.account_no} onChange={set('account_no')} /></Field>
        </div>
      )}
      {(isUpi || isBank) && (
        <Field label="UPI ID / Handle" hint="(e.g. shop@upi)" htmlFor="edit-upi">
          <input id="edit-upi" className={fieldCls} value={f.upi_id} onChange={set('upi_id')} placeholder="e.g. 9876543210@okicici" />
        </Field>
      )}
      {isUpi && (
        <Field label="Settles to bank account" hint="(where UPI money actually lands)" htmlFor="edit-settle">
          <select id="edit-settle" className={fieldCls} value={f.linked_bank_account_id} onChange={set('linked_bank_account_id')}>
            <option value="">— Auto (first bank) —</option>
            {banks.map((a) => <option key={a.id} value={a.id}>{a.name}{a.bank_name ? ` · ${a.bank_name}` : ''}</option>)}
          </select>
          {banks.length === 0 && <p className="mt-1 text-[12px] text-amber-text">No bank accounts yet — add one first to link this UPI ID.</p>}
        </Field>
      )}
      <div className="mt-3.5 flex justify-between rounded-[10px] bg-tile px-3 py-2.5 text-[13px] text-body">
        <span>Opening balance</span>
        <b className="font-tight font-semibold tabular-nums text-ink">{inr(account.opening_balance)}</b>
      </div>
      <Failure error={save.failure} noun="change" onReread={onReread} />
      <SubmitButton className="mt-4 h-11 w-full" disabled={busy || !f.name.trim()} onClick={() => save.run(f)}>
        {save.busy ? 'Saving…' : 'Save changes'}
      </SubmitButton>
      {onDelete && (confirmDelete ? (
        <div className="mt-3 rounded-xl border border-[#F5C2C2] bg-bad-soft p-3">
          <p className="mb-2.5 text-[13px] text-bad-text">Delete "{account.name}"? Transaction history stays, but the account is removed from the list.</p>
          <Failure error={del.failure} noun="delete" onReread={onReread} />
          <div className="mt-2.5 flex gap-2 [&>*]:flex-1">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => del.run()}>{del.busy ? 'Deleting…' : 'Delete account'}</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(true)}
          className="mt-2.5 w-full text-bad-text shadow-[inset_0_0_0_1px_#F5C2C2] hover:bg-bad-soft">
          <Trash2 /> Delete account
        </Button>
      ))}
    </Dialog>
  );
}

/* ── Transfer (08) ──────────────────────────────────────────────────────── */
export function TransferDialog({ open, accounts = [], onClose, onSave, onReread }) {
  const [f, setF] = useState(() => ({ from: accounts[0]?.id || '', to: accounts[1]?.id || '', amount: '', date: todayISOInAppTZ() }));
  const { busy, failure, run } = useSave(onSave);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title="Transfer money" width={440}>
      <Field label="From" htmlFor="tr-from">
        <select id="tr-from" className={fieldCls} value={f.from} onChange={set('from')}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </Field>
      <Field label="To" htmlFor="tr-to">
        <select id="tr-to" className={fieldCls} value={f.to} onChange={set('to')}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </Field>
      <Field label="Amount" htmlFor="tr-amt">
        <input id="tr-amt" type="number" className={fieldCls} value={f.amount} onChange={set('amount')} placeholder="0.00" />
      </Field>
      <Failure error={failure} noun="transfer" onReread={onReread} />
      <SubmitButton disabled={busy || !canTransfer(f)} onClick={() => run(f)}>{busy ? 'Saving…' : 'Transfer'}</SubmitButton>
    </Dialog>
  );
}

/* ── Manual entry (09) ──────────────────────────────────────────────────── */
export function EntryDialog({ open, accountName, onClose, onSave, onReread }) {
  const [f, setF] = useState(() => ({ direction: 'IN', amount: '', note: '', date: todayISOInAppTZ() }));
  const { busy, failure, run } = useSave(onSave);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title={`Entry · ${accountName || ''}`} width={440}>
      <Chips ariaLabel="Money in or out" className="[&>*]:flex-1 [&>*]:py-[9px] [&>*]:text-center"
        items={[['IN', 'Money in'], ['OUT', 'Money out']]} value={f.direction}
        onChange={(direction) => setF({ ...f, direction })}
        toneFor={(k) => (k === 'IN' ? 'bg-good text-white' : 'bg-bad text-white')} />
      <Field label="Amount" htmlFor="en-amt">
        <input id="en-amt" type="number" className={fieldCls} value={f.amount} onChange={set('amount')} placeholder="0.00" />
      </Field>
      <Field label="Note" htmlFor="en-note">
        <input id="en-note" className={fieldCls} value={f.note} onChange={set('note')} placeholder="e.g. Cash deposit" />
      </Field>
      <Field label="Date" htmlFor="en-date">
        <input id="en-date" type="date" className={fieldCls} value={f.date} onChange={set('date')} />
      </Field>
      <Failure error={failure} noun="entry" onReread={onReread} />
      <SubmitButton disabled={busy || !canSaveEntry(f)} onClick={() => run(f)}>{busy ? 'Saving…' : 'Save entry'}</SubmitButton>
    </Dialog>
  );
}

/* ── Pay EMI (10) ───────────────────────────────────────────────────────── */
export function PayEmiDialog({ loan, accounts = [], stats, onClose, onSave, onReread }) {
  const [from, setFrom] = useState(() => defaultPayFrom(accounts));
  const [amount, setAmount] = useState(() => String(stats?.emi ?? ''));
  const { busy, failure, run } = useSave(onSave);
  if (!loan || !stats) return null;
  const p = emiPreview(loan, stats, amount);
  const pick = amount === String(stats.emi) ? 'EMI' : amount === String(p.foreclose) ? 'FORECLOSE' : '';
  return (
    <Dialog open={!!loan} onClose={busy ? () => {} : onClose} title={`Loan payment · ${loan.name}`} width={440}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[10px] bg-tile px-3 py-[9px]"><span className="block text-[12px] text-mute">EMI</span><b className="font-tight text-[14.5px] font-semibold tabular-nums">{inr(stats.emi)}</b></div>
        <div className="rounded-[10px] bg-tile px-3 py-[9px]"><span className="block text-[12px] text-mute">Outstanding</span><b className="font-tight text-[14.5px] font-semibold tabular-nums text-bad-text">{inr(stats.outstanding)}</b></div>
      </div>
      <p className="mt-1.5 text-[12px] text-mute">{stats.paid}/{stats.total} paid · interest paid {inr(stats.interestPaid)}</p>
      <Field label="Amount (EMI or custom / prepay)" htmlFor="emi-amt">
        <input id="emi-amt" type="number" className={fieldCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips ariaLabel="Amount" className="mt-2" items={[['EMI', 'EMI'], ['FORECLOSE', 'Foreclose']]} value={pick}
        onChange={(k) => setAmount(String(k === 'EMI' ? stats.emi : p.foreclose))} />
      {p.amount > 0 && <p className="mt-2 text-[12px] text-mute">Interest {inr(p.interest)} · Principal {inr(p.principal)}</p>}
      <Field label="Pay from" htmlFor="emi-from">
        <select id="emi-from" className={fieldCls} value={from} onChange={(e) => setFrom(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Failure error={failure} noun="payment" onReread={onReread} />
      <SubmitButton disabled={busy || !from || !(p.amount > 0)} onClick={() => run(from, p.amount)}>
        {busy ? 'Saving…' : `Pay ${inr(p.amount)}`}
      </SubmitButton>
    </Dialog>
  );
}
