import { useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, CheckCircle2, AlertCircle, X } from 'lucide-react';

import { usePeople } from '../hooks/usePeople';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { todayISOInAppTZ, cn } from '../lib/utils';
import { classifyWriteFailure } from '../lib/writeOutcome';
import { money } from '../lib/clientView';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/States';
import { Seg } from '../components/documents/DocParts';
import WriteFailure from '../components/invoices/WriteFailure';
import { Eyebrow } from '../components/payroll/parts';
import { ClientAvatar } from '../components/clients/parts';

/**
 * Collect Payments (web redesign, approved mockup clients-13), the page the
 * top bar's "Collect payment" opens: everyone who owes, biggest first, and a
 * collect form that opens in place.
 *
 * Today's rules, unchanged: Cash · Bank · UPI, an amount from 1 up to what
 * the client owes, today's date, a confirm step, and usePeople's
 * recordClientPayment with no invoice ids (settle_client_payment).
 */
const PAYMENT_METHODS = [['CASH', 'Cash'], ['BANK', 'Bank'], ['UPI', 'UPI']];
const METHOD_WORDS = { CASH: 'cash', BANK: 'bank', UPI: 'UPI' };

function CollectForm({ client, currencySymbol, onCancel, onSubmit, onReread }) {
  const [amount, setAmount]         = useState('');
  const [method, setMethod]         = useState('CASH');
  const [notes, setNotes]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure]       = useState(null);
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);

  const parsedAmount = Number.parseFloat(amount);
  const validAmount  =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= Number(client.outstanding_balance) + 0.001;
  const unconfirmed = failure && classifyWriteFailure(failure).maySaved;

  const handleReview = useCallback(() => {
    if (!validAmount || unconfirmed) return;
    setFailure(null);
    setConfirming(true);
  }, [validAmount, unconfirmed]);

  const handleConfirm = useCallback(async () => {
    if (!validAmount || submitting || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setFailure(null);
    const result = await onSubmit({ clientId: client.id, amount: parsedAmount, method, notes: notes.trim() });
    inFlight.current = false;
    if (!result?.success) {
      setSubmitting(false);
      setConfirming(false);
      setFailure(result?.error || 'The server gave no reason.');
    }
  }, [validAmount, submitting, onSubmit, client.id, parsedAmount, method, notes]);

  const owes = Number(client.outstanding_balance) || 0;
  return (
    <div className="rounded-[14px] bg-surface shadow-[inset_0_0_0_2px_var(--color-ink)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <ClientAvatar name={client.name} />
        <div className="min-w-0 flex-1">
          <b className="block truncate font-tight text-[14px] font-semibold">{client.name}</b>
          {client.phone && <small className="block truncate text-[12px] text-mute tabular-nums">{client.phone}</small>}
        </div>
        <div className="text-right">
          <Eyebrow>Owes you</Eyebrow>
          <b className="font-tight text-[15px] font-semibold tabular-nums">{money(owes, currencySymbol)}</b>
        </div>
      </div>
      <div className="grid gap-3 border-t border-sep px-4 py-3 sm:grid-cols-[180px_auto_1fr]">
        <div>
          <label htmlFor={`amount-${client.id}`} className="mb-[5px] block text-[12px] font-medium text-ink-2">Amount</label>
          <div className="flex h-10 items-center gap-1.5 rounded-[10px] px-3 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
            <span className="font-tight text-[15px] text-mute">{currencySymbol}</span>
            <input id={`amount-${client.id}`} type="number" inputMode="decimal" min="0" step="0.01" autoFocus
              value={amount} disabled={confirming}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleReview(); }}
              className="w-full bg-transparent font-tight text-[17px] font-semibold tabular-nums outline-none" placeholder="0" />
          </div>
          <span className={cn('mt-1 flex items-center gap-1 text-[12px]', amount !== '' && !validAmount ? 'text-bad-text' : 'text-mute')}>
            {amount !== '' && !validAmount && <AlertCircle size={13} />}
            Between {currencySymbol}1 and {money(owes, currencySymbol)}
          </span>
        </div>
        <div>
          <span className="mb-[5px] block text-[12px] font-medium text-ink-2">Paid by</span>
          <Seg value={method} onChange={(v) => !confirming && setMethod(v)} options={PAYMENT_METHODS} ariaLabel="Paid by" />
        </div>
        <label className="block">
          <span className="mb-[5px] block text-[12px] font-medium text-ink-2">Notes</span>
          <Input id={`notes-${client.id}`} value={notes} disabled={confirming}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleReview(); }}
            placeholder="Optional reference" />
        </label>
      </div>
      {failure && (
        <div className="px-4 pb-3">
          <WriteFailure error={failure} noun="payment" onReread={onReread ? async () => { await onReread(); setFailure(null); onCancel(); } : undefined} />
        </div>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-b-[14px] bg-amber-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            <Eyebrow className="text-amber-text">Confirm payment</Eyebrow>
            <b className="block font-tight text-[15px] font-semibold tabular-nums">{money(parsedAmount, currencySymbol, { paise: 'always' })} by {METHOD_WORDS[method] || method}</b>
            <small className="text-[12.5px] text-body">from {client.name}</small>
          </div>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={submitting} className="bg-surface">Edit</Button>
          <Button onClick={handleConfirm} disabled={submitting}>{submitting ? 'Recording…' : <><CheckCircle2 /> Confirm {money(parsedAmount, currencySymbol)}</>}</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-sep px-4 py-3">
          <Button onClick={handleReview} disabled={!validAmount || unconfirmed} className="flex-1"><CheckCircle2 /> Record payment</Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function DueRow({ client, currencySymbol, onExpand }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3">
      <ClientAvatar name={client.name} />
      <div className="min-w-0 flex-1">
        <b className="block truncate font-tight text-[14px] font-semibold">{client.name}</b>
        {client.phone && <small className="block truncate text-[12px] text-mute tabular-nums">{client.phone}</small>}
      </div>
      <span className="font-tight text-[14px] font-semibold tabular-nums">{money(client.outstanding_balance, currencySymbol)}</span>
      <Button variant="secondary" size="xs" onClick={() => onExpand(client.id)}>Collect</Button>
    </div>
  );
}

export default function CashCollection() {
  const navigate = useNavigate();
  const { currentTenantId, businessProfile } = useTenant();
  const { hasPermission } = useAuth();
  const { clients, recordClientPayment, refetch, loading } = usePeople(currentTenantId);

  const currencySymbol = businessProfile?.currencySymbol || '₹';
  const today          = todayISOInAppTZ();
  const canCollect     = hasPermission ? hasPermission('clients', 'edit') : true;

  const [search, setSearch]         = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [collected, setCollected]   = useState({}); // { [clientId]: { id, name, amount } }

  const normalizedSearch = search.trim().toLowerCase();

  const dueClients = useMemo(() => (clients || [])
    .filter(c =>
      c.status !== 'INACTIVE' &&
      Number(c.outstanding_balance) > 0 &&
      !collected[c.id]
    )
    .filter(c => normalizedSearch ? (c.name || '').toLowerCase().includes(normalizedSearch) : true)
    .sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance)),
  [clients, collected, normalizedSearch]);

  const collectedEntries = useMemo(() => Object.values(collected), [collected]);
  const sessionTotal     = useMemo(() => collectedEntries.reduce((s, e) => s + e.amount, 0), [collectedEntries]);
  const sessionCount     = collectedEntries.length;

  const handleExpand = useCallback(clientId =>
    setExpandedId(prev => prev === clientId ? null : clientId), []);

  const handleCancel = useCallback(() => setExpandedId(null), []);

  const handleRecord = useCallback(async ({ clientId, amount, method, notes }) => {
    const client = (clients || []).find(c => c.id === clientId);
    const result = await recordClientPayment(clientId, amount, today, notes, [], method);
    if (result?.success) {
      setCollected(prev => ({
        ...prev,
        [clientId]: { id: clientId, name: client?.name || 'Client', amount },
      }));
      setExpandedId(null);
    }
    return result;
  }, [clients, recordClientPayment, today]);

  if (!canCollect) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mx-auto mb-3.5 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-body"><AlertCircle size={22} /></div>
        <h3 className="font-tight text-[17px] font-semibold">No access to collecting payments</h3>
        <p className="mt-1.5 text-[13.5px] text-body">You don't have permission to record payments.</p>
      </div>
    );
  }

  const dayWords = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <div className="flex flex-col pb-16">
      <div className="m-rise mb-4 flex flex-wrap items-center gap-3" style={{ '--i': 0 }}>
        <button type="button" onClick={() => navigate(-1)} className="m-press inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-body hover:text-ink">
          <ChevronLeft size={15} /> Back
        </button>
        <span className="text-[13px] text-mute">{dayWords}</span>
        <div className="flex-1" />
        <span className={cn('rounded-pill px-3 py-1.5 text-[12.5px]', sessionCount > 0 ? 'bg-good-soft text-good-text' : 'bg-well text-body')}>
          <b className="font-tight font-semibold tabular-nums">{money(sessionTotal, currencySymbol)}</b> from {sessionCount} {sessionCount === 1 ? 'client' : 'clients'} on this visit
        </span>
      </div>

      <div className="mx-auto w-full max-w-[760px]">
        <label className="m-rise relative block" style={{ '--i': 1 }}>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients by name" className="h-10 pl-9 pr-9" aria-label="Search clients" />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
              className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-xl text-mute hover:bg-well">
              <X size={14} />
            </button>
          )}
        </label>

        <Eyebrow className="m-rise mb-2 mt-5">Outstanding{!loading && ` · ${dueClients.length}`}</Eyebrow>
        {loading ? (
          <div className="grid gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[58px] w-full rounded-[14px]" />)}</div>
        ) : dueClients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D9DADC] bg-surface px-6 py-12 text-center">
            {normalizedSearch ? (
              <>
                <h3 className="font-tight text-[16px] font-semibold">No clients match your search</h3>
                <p className="mt-1 text-[13px] text-body">Try a different name.</p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-good-soft text-good-text"><CheckCircle2 size={22} /></div>
                <h3 className="font-tight text-[16px] font-semibold">All caught up</h3>
                <p className="mt-1 text-[13px] text-body">{sessionCount > 0 ? 'Every outstanding balance has been collected.' : 'No outstanding balances.'}</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {dueClients.map(client =>
              expandedId === client.id ? (
                <CollectForm key={client.id} client={client} currencySymbol={currencySymbol}
                  onCancel={handleCancel} onSubmit={handleRecord} onReread={refetch} />
              ) : (
                <DueRow key={client.id} client={client} currencySymbol={currencySymbol} onExpand={handleExpand} />
              )
            )}
          </div>
        )}

        {collectedEntries.length > 0 && (
          <>
            <Eyebrow className="mb-2 mt-6 text-good-text">Collected on this visit · {collectedEntries.length}</Eyebrow>
            <div className="grid gap-2">
              {collectedEntries.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 rounded-[14px] bg-good-soft px-4 py-3 text-good-text">
                  <CheckCircle2 size={20} className="shrink-0" />
                  <b className="min-w-0 flex-1 truncate font-tight text-[14px] font-semibold">{entry.name}</b>
                  <span className="font-tight text-[14px] font-semibold tabular-nums">{money(entry.amount, currencySymbol)} collected</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
