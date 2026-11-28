import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Smartphone, Landmark, CreditCard, ReceiptText, Wallet, CalendarDays, Repeat, ChevronDown, Search } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import OptionCard, { OptionGroup } from '../ui/OptionCard';
import WriteFailure from '../invoices/WriteFailure';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { todayISOInAppTZ, cn } from '../../lib/utils';
import { recurringTemplateFor, scheduleLine, nextRun, WEEKDAYS } from '../../lib/recurring';
import { dayMonth } from '../../lib/expenseList';
import { Dot, Toggle, Seg, Label, Hint, rupees, rupeesPaise } from './parts';

/**
 * New / edit expense (expenses-03, 04, 05). A wide dialog in two columns:
 * what was spent on the left, GST, profit and repeat on the right.
 *
 * The save itself is the page's old one, moved here unchanged: the expense
 * is written through useFinance (the database trigger posts it to Cash &
 * Bank), and a new expense with Repeat on also gets a recurring template.
 */
export const blankExpense = () => ({
  note: '', amount: '', category: 'Other', date: todayISOInAppTZ(), payment_method: 'CASH',
  repeat: 'NONE', weekdays: [1, 2, 3, 4, 5, 6, 7],
  gst_claimable: false, gst_rate: '18', vendor_gstin: '', location_id: '',
  // Owner drawing / loan repayment / capital: real cash out, but NOT an
  // operating expense, so excluded from profit (still hits Cash & Bank).
  exclude_from_pl: false,
});

export const formFromExpense = (expense) => ({
  note: expense.note || '',
  amount: (expense.amount || 0).toString(),
  category: expense.category || 'Other',
  date: expense.date ? expense.date.split('T')[0] : todayISOInAppTZ(),
  payment_method: expense.payment_method || 'CASH',
  repeat: 'NONE', weekdays: [1, 2, 3, 4, 5, 6, 7], // editing an existing one-off never re-arms recurring
  gst_claimable: !!expense.vendor_gstin || Number(expense.gst_amount) > 0,
  gst_rate: expense.gst_rate ? String(expense.gst_rate) : '18',
  vendor_gstin: expense.vendor_gstin || '',
  location_id: expense.location_id || '',
  exclude_from_pl: !!expense.exclude_from_pl,
});

const METHODS = [
  ['CASH', 'Cash', Banknote], ['UPI', 'UPI', Smartphone], ['BANK', 'Bank transfer', Landmark], ['CARD', 'Card', CreditCard],
];
const RATES = [['5', '5%'], ['12', '12%'], ['18', '18%'], ['28', '28%'], ['0', '0% / Exempt']];

/** The tax inside an amount that already includes it. Display only; the save works its own out. */
const itcOf = (amount, rate) => {
  const amt = parseFloat(amount) || 0, r = parseFloat(rate) || 0;
  return r > 0 ? amt - amt / (1 + r / 100) : 0;
};

export default function ExpenseForm({
  open, editing, initial, onClose, onSaved, refetch,
  categories = [], posStores = [], sym = '₹',
  addExpense, updateExpense, addRecurringTemplate, addExpenseCategory,
}) {
  const [form, setForm] = useState(blankExpense);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(null);   // { error } | { partial: true, error }
  const [plainError, setPlainError] = useState('');
  const [repeatHint, setRepeatHint] = useState('');
  const [catOpen, setCatOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial || blankExpense());
    setSaving(false); setFailure(null); setPlainError(''); setRepeatHint(''); setCatOpen(false);
  }, [open, initial]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const amountNum = parseFloat(form.amount) || 0;
  const today = todayISOInAppTZ();

  const plan = useMemo(() => ({
    ...recurringTemplateFor({ frequency: form.repeat, weekdays: form.weekdays, date: form.date || today, today }),
    asked_day: (form.date || today).split('-')[2],
  }), [form.repeat, form.weekdays, form.date, today]);

  const close = () => { if (!saving) onClose?.(); };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setFailure(null); setPlainError('');

    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setPlainError('Amount must be greater than 0.'); return; }
    // Description is optional: fall back to the category so a row is never noteless.
    const note = (form.note || '').trim() || form.category;

    // GST/ITC: when claimable, back the tax out of the (inclusive) amount:
    // gst = amount − amount/(1 + rate/100). Stored as the ITC value.
    let gst_rate = null, gst_amount = 0, vendor_gstin = null;
    if (form.gst_claimable) {
      const r = parseFloat(form.gst_rate) || 0;
      gst_rate = r;
      gst_amount = r > 0 ? +(amount - amount / (1 + r / 100)).toFixed(2) : 0;
      vendor_gstin = (form.vendor_gstin || '').trim().toUpperCase() || null;
    }
    const expenseData = { ...form, note, amount, gst_rate, gst_amount, vendor_gstin, location_id: form.location_id || null };

    setSaving(true);
    let error;
    try {
      ({ error } = editing
        ? await updateExpense({ ...expenseData, id: editing.id })
        : await addExpense(expenseData));
    } catch (err) {
      error = err;
    }

    // Repeat on a NEW expense also creates a recurring template. The expense
    // just logged covers its own date; the nightly job carries on after it.
    if (!error && !editing && form.repeat !== 'NONE') {
      let tplErr;
      try {
        ({ error: tplErr } = await addRecurringTemplate({
          note, amount, category: form.category, payment_method: form.payment_method,
          location_id: expenseData.location_id, exclude_from_pl: !!form.exclude_from_pl,
          gst_rate, gst_amount, vendor_gstin,
          ...recurringTemplateFor({ frequency: form.repeat, weekdays: form.weekdays, date: form.date, today: todayISOInAppTZ() }),
        }));
      } catch (err) { tplErr = err; }
      if (tplErr) {
        setSaving(false);
        console.error('[expenses] recurring setup failed', tplErr);
        setFailure({ partial: true, error: tplErr });
        return;
      }
    }
    setSaving(false);

    if (error) {
      console.error('[expenses] save failed', error);
      setFailure({ error });
      return;
    }
    // Money out: the database trigger posts the Cash & Bank entry for web,
    // desktop and phone alike. Nothing is posted from here.
    onSaved?.();
  };

  const reread = async () => { try { await refetch?.(); } finally { onClose?.(); } };

  // Footer hint (03: "Today's ₹340 is logged now; the repeat carries on from tomorrow.")
  const footHint = editing ? 'Repeat is set only when an expense is first logged.'
    : form.repeat === 'NONE' ? null
    : (() => {
      const shown = amountNum > 0 ? rupees(amountNum, sym) : 'this expense';
      const next = nextRun({ ...plan, frequency: form.repeat });
      const from = !next ? 'carries on by itself'
        : next === addDaysISO(today, 1) ? 'carries on from tomorrow' : `carries on from ${dayMonth(next)}`;
      return form.date === today
        ? `Today's ${shown} is logged now; the repeat ${from}.`
        : `${amountNum > 0 ? shown : 'This expense'} is logged for ${dayMonth(form.date)} now; the repeat ${from}.`;
    })();

  const partial = failure?.partial ? classifyWriteFailure(failure.error, { noun: 'repeat' }) : null;

  return (
    <Dialog open={open} onClose={close} width={800} label={editing ? 'Edit expense' : 'New expense'}
      title={editing ? 'Edit Expense' : 'New Expense'}
      subtitle={editing
        ? `${editing.note || editing.category || 'Expense'} · logged ${dayMonth(String(editing.date || '').slice(0, 10))}`
        : 'Money the shop spent, paid from the till or the bank'}>
      <form onSubmit={handleSubmit} className="-mx-[22px] -mb-4" noValidate>
        <div className="grid border-t border-sep md:grid-cols-2">
          {/* ── Left: what was spent ── */}
          <div className="relative px-[22px] py-4">
            <label htmlFor="exp-amount"
              className="block rounded-[14px] bg-tile px-4 pt-3 pb-3.5 transition-shadow duration-(--dur-press) focus-within:bg-surface focus-within:shadow-[inset_0_0_0_2px_var(--color-amber)]">
              <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Amount spent</span>
              <span className="mt-1 flex items-baseline gap-1.5">
                <em className="not-italic font-tight text-[24px] font-medium text-mute">{sym}</em>
                <input id="exp-amount" required autoFocus type="number" step="0.01" min="0.01" inputMode="decimal" placeholder="0"
                  value={form.amount} onChange={(e) => set({ amount: e.target.value })}
                  className="w-full min-w-0 bg-transparent font-tight text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] tabular-nums text-ink outline-none placeholder:text-faint [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </span>
            </label>

            <div className="mt-3.5">
              <Label>Category</Label>
              <button type="button" data-card aria-haspopup="listbox" aria-expanded={catOpen} onClick={() => setCatOpen((v) => !v)}
                className={cn('flex h-[38px] w-full items-center justify-between rounded-[10px] px-3 text-[13.5px] text-ink',
                  catOpen ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
                <span className="inline-flex items-center gap-[7px]"><Dot category={form.category} />{form.category}</span>
                <ChevronDown size={14} className="text-mute" />
              </button>
              {catOpen && (
                <CategoryMenu value={form.category} categories={categories} addExpenseCategory={addExpenseCategory}
                  onPick={(c, keepOpen) => { set({ category: c }); if (!keepOpen) setCatOpen(false); }} onClose={() => setCatOpen(false)} />
              )}
            </div>

            <div className="mt-3.5">
              <Label>Paid via</Label>
              <OptionGroup cols={4} aria-label="Paid via">
                {METHODS.map(([k, label, Icon]) => (
                  <OptionCard key={k} selected={form.payment_method === k} onClick={() => set({ payment_method: k })}
                    icon={<Icon />} title={label}
                    className="flex-col gap-[5px] px-1.5 py-3 text-center [&_b]:text-[13px]" />
                ))}
              </OptionGroup>
            </div>

            <div className={cn('mt-3.5 grid gap-3', posStores.length > 1 && 'grid-cols-2')}>
              <div>
                <Label htmlFor="exp-date">Date</Label>
                <Input id="exp-date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className="h-[38px]" />
              </div>
              {posStores.length > 1 && (
                <div>
                  <Label htmlFor="exp-store">Paid from store</Label>
                  <select id="exp-store" value={form.location_id} onChange={(e) => set({ location_id: e.target.value })}
                    className="h-[38px] w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)]">
                    <option value="">Business-wide</option>
                    {posStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-3.5">
              <Label htmlFor="exp-note">Description, optional</Label>
              <Input id="exp-note" value={form.note} onChange={(e) => set({ note: e.target.value })}
                placeholder="What was it for? For example, fuel for the van" className="h-[38px]" />
            </div>
          </div>

          {/* ── Right: GST, profit, repeat ── */}
          <div className="border-t border-sep px-[22px] py-4 md:border-t-0 md:border-l">
            <SwitchRow first icon={ReceiptText} on={form.gst_claimable} onChange={(v) => set({ gst_claimable: v })}
              title="Claim GST (input tax credit)" hint="For registered vendors with a GSTIN" />
            {form.gst_claimable && (
              <div className="mb-1 mt-0.5 rounded-xl bg-tile px-3.5 py-3">
                <Label>GST rate</Label>
                <Seg small ariaLabel="GST rate" items={RATES} value={form.gst_rate} onChange={(v) => set({ gst_rate: v })} className="flex-wrap" />
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <div>
                    <Label htmlFor="exp-gstin">Vendor GSTIN</Label>
                    <Input id="exp-gstin" maxLength={15} placeholder="15 characters" value={form.vendor_gstin}
                      onChange={(e) => set({ vendor_gstin: e.target.value.toUpperCase() })} className="uppercase tracking-wide placeholder:normal-case" />
                  </div>
                  <div>
                    <Label>ITC, included</Label>
                    <span className="flex h-9 items-center justify-end rounded-[10px] bg-good-soft px-3 font-tight text-[14px] font-semibold tabular-nums text-good-text">
                      {rupeesPaise(itcOf(form.amount, form.gst_rate), sym)}
                    </span>
                  </div>
                </div>
                <Hint className="mt-1.5 block">Taken out of the {amountNum > 0 ? rupees(amountNum, sym) : 'amount'} you paid; it is not added on top.</Hint>
              </div>
            )}
            <SwitchRow icon={Wallet} on={form.exclude_from_pl} onChange={(v) => set({ exclude_from_pl: v })}
              title="Not a business expense" hint="Owner drawing, loan repayment or capital. Kept out of profit." />

            {!editing && (
              <RepeatControl form={form} set={set} plan={plan} hint={repeatHint} setHint={setRepeatHint} />
            )}
          </div>
        </div>

        {(plainError || failure) && (
          <div className="px-[22px] pb-1">
            {plainError && <p role="alert" className="rounded-[10px] bg-bad-soft px-3 py-2.5 text-[12.5px] text-bad-text">{plainError}</p>}
            {failure && !failure.partial && <WriteFailure error={failure.error} noun="expense" onReread={reread} />}
            {partial && (
              <div role="alert" className="rounded-[10px] bg-amber-soft px-3 py-2.5 text-[12.5px] text-amber-text">
                <b className="block font-tight font-semibold">Expense saved, but the repeat could not be {partial.maySaved ? 'confirmed' : 'set up'}</b>
                <span className="block break-words">{partial.detail}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-sep px-[22px] pt-3.5 pb-5">
          {footHint && <Hint className="mr-auto">{footHint}</Hint>}
          {!footHint && <span className="mr-auto" />}
          <Button variant="secondary" onClick={close} disabled={saving} className="h-11 px-5">Cancel</Button>
          <Button type="submit" disabled={saving} className="h-11 min-w-[220px] px-5">
            {saving ? 'Saving…' : editing ? 'Save changes' : `Log expense${amountNum > 0 ? ` · ${rupees(amountNum, sym)}` : ''}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const addDaysISO = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};

function SwitchRow({ icon: Icon, on, onChange, title, hint, first = false, children }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 py-3', first ? 'pt-0' : 'border-t border-sep')}>
      <span className={cn('grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]', on ? 'bg-amber-soft text-amber-text' : 'bg-tile text-body')}>
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <b className="block font-tight text-[14px] font-semibold">{title}</b>
        <small className="block text-[12px] leading-[1.35] text-mute">{hint}</small>
      </div>
      {children || <Toggle on={on} onChange={onChange} label={title} />}
    </div>
  );
}

function RepeatControl({ form, set, plan, hint, setHint }) {
  const opts = [['NONE', 'No'], ['DAILY', 'Daily'], ['MONTHLY', 'Monthly']];
  const pick = (k) => { setHint(''); set({ repeat: k }); };
  const on = form.repeat !== 'NONE';
  return (
    <div data-testid="repeat-control">
      <SwitchRow icon={CalendarDays} on={on} title="Repeat"
        hint={on ? 'Logged again by itself on these days' : 'Log this once'}>
        <Seg ariaLabel="Repeat" items={opts} value={form.repeat} onChange={pick} />
      </SwitchRow>
      {on && (
        <div className="rounded-xl bg-tile px-3.5 py-3">
          {form.repeat === 'DAILY' && (
            <>
              <Label>Days to log</Label>
              <div className="flex gap-[5px]" role="group" aria-label="Days to log">
                {WEEKDAYS.map((w) => {
                  const sel = form.weekdays.includes(w.n);
                  return (
                    <button key={w.n} type="button" aria-pressed={sel}
                      onClick={() => {
                        const next = sel ? form.weekdays.filter((d) => d !== w.n) : [...form.weekdays, w.n];
                        if (!next.length) { setHint('Keep at least one day'); return; }
                        setHint('');
                        set({ weekdays: next });
                      }}
                      className={cn('m-press min-w-0 flex-1 rounded-pill py-1.5 text-center font-tight text-[12px] font-semibold',
                        sel ? 'bg-ink text-white' : 'text-mute shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-ink')}>
                      {w.short}
                    </button>
                  );
                })}
              </div>
              {hint && <p className="mt-2 text-[12px] text-mute" role="status">{hint}</p>}
            </>
          )}
          <div className={cn('flex items-center gap-1.5 text-[12.5px] text-ink-2', form.repeat === 'DAILY' && 'mt-2.5')} data-testid="repeat-line">
            <Repeat size={14} className="text-body" />{scheduleLine({ ...plan, frequency: form.repeat })}
          </div>
        </div>
      )}
    </div>
  );
}

/** The category picker (04): find, pick from two columns, or add a new one. */
function CategoryMenu({ value, categories, onPick, onClose, addExpenseCategory }) {
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('[aria-haspopup="listbox"]')) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);
  const shown = categories.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase()));

  const add = async () => {
    const n = name.trim();
    if (!n || adding) return;
    setAdding(true); setErr('');
    let error;
    try { ({ error } = (await addExpenseCategory?.(n)) || {}); } catch (e) { error = e; }
    setAdding(false);
    if (error) {
      // The expense can still use the name; only the saved list missed it.
      console.error('[expenses] category save failed', error);
      setErr(`${classifyWriteFailure(error, { noun: 'category' }).title}: ${error.message || error}. It is picked for this expense only.`);
      onPick(n, true);
      return;
    }
    onPick(n);
  };

  return (
    <div ref={ref} role="listbox" aria-label="Category"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      className="m-dialog absolute left-[22px] right-[22px] z-10 mt-1 origin-top-left rounded-[14px] bg-surface p-1.5 shadow-[0_0_0_1px_rgba(17,20,24,0.06),0_18px_40px_-14px_rgba(17,20,24,0.35)]">
      <label className="mx-1 mt-0.5 mb-1.5 flex items-center gap-2 rounded-[10px] bg-well px-2.5 py-2 text-[13px] text-mute">
        <Search size={14} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a category" aria-label="Find a category"
          className="w-full bg-transparent text-ink outline-none placeholder:text-mute" />
      </label>
      <div className="grid max-h-[260px] grid-cols-2 gap-x-1 gap-y-px overflow-auto">
        {shown.map((c) => {
          const on = c === value;
          return (
            <button key={c} type="button" role="option" aria-selected={on} onClick={() => onPick(c)}
              className={cn('flex items-center gap-2 whitespace-nowrap rounded-pill px-2.5 py-2 text-left text-[13px]',
                on ? 'bg-amber-soft font-semibold text-amber-text' : 'text-ink-2 hover:bg-tile')}>
              <Dot category={c} /><span className="truncate">{c}</span>{on && <span className="ml-auto font-bold">✓</span>}
            </button>
          );
        })}
        {shown.length === 0 && <p className="col-span-2 px-2.5 py-2 text-[12.5px] text-mute">No category by that name. Add it below.</p>}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 border-t border-sep px-1 pt-2 pb-0.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" aria-label="New category"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} className="h-[34px] flex-1" />
        <Button size="xs" onClick={add} disabled={!name.trim() || adding}>{adding ? 'Adding…' : 'Add'}</Button>
      </div>
      {err && <p role="alert" className="px-1.5 pt-1.5 text-[12px] text-bad-text">{err}</p>}
      <p className="px-1.5 pt-1.5 pb-0.5 text-[11.5px] text-mute">A new category is picked straight away. Rename or remove categories in Settings.</p>
    </div>
  );
}
