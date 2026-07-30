import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  Banknote,
  Landmark,
  Smartphone,
  AlertCircle,
  ChevronRight,
  X,
} from 'lucide-react';

import { usePeople } from '../hooks/usePeople';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import { todayISOInAppTZ, formatCurrency, formatDate } from '../lib/utils';

const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Cash', icon: Banknote },
  { id: 'BANK', label: 'Bank', icon: Landmark },
  { id: 'UPI',  label: 'UPI',  icon: Smartphone },
];

function Avatar({ name }) {
  const letter = (name?.trim()?.[0] || '?').toUpperCase();
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-signature/15 text-sm font-black uppercase text-accent-signature-hover">
      {letter}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3">
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-stone-200" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-2/5 animate-pulse rounded bg-stone-200" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-stone-100" />
      </div>
      <div className="h-8 w-24 animate-pulse rounded-xl bg-stone-200" />
    </div>
  );
}

function CollectForm({ client, currencySymbol, onCancel, onSubmit }) {
  const [amount, setAmount]         = useState('');
  const [method, setMethod]         = useState('CASH');
  const [notes, setNotes]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [confirming, setConfirming] = useState(false);

  const parsedAmount = Number.parseFloat(amount);
  const validAmount  =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= Number(client.outstanding_balance) + 0.001;

  const handleReview = useCallback(() => {
    if (!validAmount) return;
    setError('');
    setConfirming(true);
  }, [validAmount]);

  const handleConfirm = useCallback(async () => {
    if (!validAmount || submitting) return;
    setSubmitting(true);
    setError('');
    const result = await onSubmit({ clientId: client.id, amount: parsedAmount, method, notes: notes.trim() });
    if (!result?.success) {
      setSubmitting(false);
      setConfirming(false);
      setError(result?.error || 'Could not record payment. Try again.');
    }
  }, [validAmount, submitting, onSubmit, client.id, parsedAmount, method, notes]);

  return (
    <div className="rounded-2xl border-2 border-accent-signature/40 bg-white p-4 shadow-sm">
      {/* Card header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={client.name} />
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-ink-primary">{client.name}</p>
            {client.phone && <p className="truncate text-xs text-ink-primary/50">{client.phone}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-ink-primary/40">Outstanding</p>
          <p className="tabular-nums text-base font-bold text-rose-600">
            {formatCurrency(client.outstanding_balance)}
          </p>
        </div>
      </div>

      {/* Amount */}
      <div className="mt-4">
        <label htmlFor={`amount-${client.id}`} className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-ink-primary/40">
          Amount
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 tabular-nums text-base font-bold text-ink-primary/40">
            {currencySymbol}
          </span>
          <input
            id={`amount-${client.id}`}
            type="number" inputMode="decimal" min="0" step="0.01" autoFocus
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleReview(); }}
            className="w-full rounded-xl border border-black/10 bg-canvas py-2.5 pl-9 pr-3 tabular-nums text-lg font-bold text-ink-primary outline-none focus:border-accent-signature/70 focus:ring-2 focus:ring-accent-signature/25"
            placeholder="0"
          />
        </div>
        {amount !== '' && !validAmount && (
          <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
            <AlertCircle className="h-3.5 w-3.5" />
            Enter amount between {currencySymbol}1 and {formatCurrency(client.outstanding_balance)}.
          </p>
        )}
      </div>

      {/* Method pills */}
      <div className="mt-4">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-ink-primary/40">Method</p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map(m => {
            const Icon = m.icon;
            const active = method === m.id;
            return (
              <button key={m.id} type="button" onClick={() => setMethod(m.id)} aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? 'border-accent-signature/70 bg-accent-signature/10 text-accent-signature-hover'
                    : 'border-black/10 bg-white text-ink-primary/60 hover:border-black/20'
                }`}
              >
                <Icon className="h-4 w-4" />
                {m.label}
                {active && <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="mt-4">
        <label htmlFor={`notes-${client.id}`} className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-ink-primary/40">
          Notes
        </label>
        <input id={`notes-${client.id}`} type="text" value={notes}
          onChange={e => setNotes(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleReview(); }}
          className="w-full rounded-xl border border-black/10 bg-canvas px-3 py-2.5 text-sm text-ink-primary outline-none focus:border-accent-signature/70 focus:ring-2 focus:ring-accent-signature/25"
          placeholder="optional reference…"
        />
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </p>
      )}

      {confirming ? (
        /* ── Confirmation step ── */
        <div className="mt-4 rounded-xl border border-accent-signature/25 bg-accent-signature/10 p-4">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-accent-signature-hover/60">Confirm payment</p>
          <p className="text-base font-bold text-ink-primary">
            {currencySymbol}{parsedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="ml-2 text-sm font-semibold text-ink-primary/50">via {method}</span>
          </p>
          <p className="text-sm text-ink-primary/60">to <span className="font-semibold text-ink-primary">{client.name}</span></p>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={handleConfirm} disabled={submitting}
              className="btn-signature flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
            >
              {submitting
                ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Recording…</>
                : <><CheckCircle2 className="h-4 w-4" />Confirm</>}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={submitting}
              className="rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-ink-primary/60 transition hover:bg-black/5 disabled:opacity-50"
            >
              ← Edit
            </button>
          </div>
        </div>
      ) : (
        /* ── Normal actions ── */
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={handleReview} disabled={!validAmount}
            className="btn-signature flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />Record Payment
          </button>
          <button type="button" onClick={onCancel}
            className="rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-ink-primary/60 transition hover:bg-black/5"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function DueRow({ client, onExpand }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3 transition hover:border-black/10">
      <Avatar name={client.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink-primary">{client.name}</p>
        {client.phone && <p className="truncate text-xs text-ink-primary/40">{client.phone}</p>}
      </div>
      <p className="tabular-nums text-sm font-bold text-rose-600">
        {formatCurrency(client.outstanding_balance)}
      </p>
      <button type="button" onClick={() => onExpand(client.id)}
        className="flex shrink-0 items-center gap-1 rounded-xl bg-accent-signature/10 px-3 py-2 text-sm font-bold text-accent-signature-hover transition hover:bg-accent-signature/15"
      >
        Collect <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function CollectedRow({ entry }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 opacity-80">
      <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-emerald-900">{entry.name}</p>
      <p className="tabular-nums text-sm font-bold text-emerald-700">
        {formatCurrency(entry.amount)}<span className="ml-1 text-xs font-medium text-emerald-600/70">collected</span>
      </p>
    </div>
  );
}

function EmptyDueState({ hasSearch, collectedAny }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-black/5 bg-white py-12 text-center">
        <Search className="h-8 w-8 text-ink-primary/20" />
        <p className="mt-3 text-sm font-semibold text-ink-primary">No clients match your search</p>
        <p className="mt-1 text-xs text-ink-primary/50">Try a different name.</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-black/5 bg-white py-14 text-center">
      <CheckCircle2 className="h-12 w-12 text-emerald-400" />
      <p className="mt-4 text-base font-bold text-ink-primary">All caught up!</p>
      <p className="mt-1 text-sm text-ink-primary/50">
        {collectedAny ? 'Every outstanding balance has been collected.' : 'No outstanding balances.'}
      </p>
    </div>
  );
}

export default function CashCollection() {
  const navigate = useNavigate();
  const { currentTenantId, businessProfile } = useTenant();
  const { hasPermission } = useAuth();
  const { clients, recordClientPayment, loading } = usePeople(currentTenantId);

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
        <AlertCircle className="h-10 w-10 text-ink-primary/30" />
        <p className="mt-3 text-base font-bold text-ink-primary">No access to cash collection</p>
        <p className="mt-1 text-sm text-ink-primary/50">You don't have permission to record payments.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Sticky full-bleed header */}
      <header className="sticky top-0 z-20 -mx-4 -mt-2 border-b border-black/5 bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 md:-mt-6 lg:-mx-12 lg:px-12">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={() => navigate(-1)} aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white text-ink-primary/70 transition hover:bg-black/5"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-black leading-tight text-ink-primary">Cash Collection</h1>
            <p className="text-xs text-ink-primary/50">{formatDate(today)}</p>
          </div>
          {/* Live session chip */}
          <div className="ml-auto">
            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              sessionCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-black/5 text-ink-primary/50'
            }`}>
              <CheckCircle2 className="h-4 w-4" />
              <span className="tabular-nums">{formatCurrency(sessionTotal)}</span>
              <span className="opacity-70">from {sessionCount} {sessionCount === 1 ? 'client' : 'clients'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="mt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-primary/40" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search clients by name…"
            className="w-full rounded-xl border border-black/5 bg-white py-2.5 pl-9 pr-9 text-sm text-ink-primary outline-none focus:border-accent-signature/70 focus:ring-2 focus:ring-accent-signature/25"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-primary/40 transition hover:bg-black/5"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Due list */}
      <section className="mt-5">
        <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-ink-primary/40">
          Outstanding{!loading && <span className="ml-1 text-ink-primary/30">({dueClients.length})</span>}
        </h2>
        {loading ? (
          <div className="space-y-2"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
        ) : dueClients.length === 0 ? (
          <EmptyDueState hasSearch={!!normalizedSearch} collectedAny={sessionCount > 0} />
        ) : (
          <div className="space-y-2">
            {dueClients.map(client =>
              expandedId === client.id ? (
                <CollectForm key={client.id} client={client} currencySymbol={currencySymbol}
                  onCancel={handleCancel} onSubmit={handleRecord} />
              ) : (
                <DueRow key={client.id} client={client} onExpand={handleExpand} />
              )
            )}
          </div>
        )}
      </section>

      {/* Collected section */}
      {collectedEntries.length > 0 && (
        <section className="mt-7 pb-10">
          <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-700/60">
            Collected today ({collectedEntries.length})
          </h2>
          <div className="space-y-2">
            {collectedEntries.map(entry => <CollectedRow key={entry.id} entry={entry} />)}
          </div>
        </section>
      )}
    </div>
  );
}
