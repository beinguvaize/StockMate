import React, { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Calendar, ChevronDown, ChevronRight, MoreVertical, X, Download, ArrowUpDown,
  Banknote, FileText, LineChart, Copy, RotateCcw, Pencil, Trash2, Check, Receipt,
} from 'lucide-react';
import {
  TABS, OPEN_TABS, defaultView, TERMS, termOf, SORTS, DATE_SORTS, GROUPS, STATE_LABEL,
  filterRegister, tabStats, totals, bandRegister, datePresets, fmtDate, registerCsv,
} from '../lib/register';
import './BillRegister.css';

const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => nf.format(Math.round((Number(n) || 0) * 100) / 100);
const rupee = (n) => `₹${money(n)}`;
const billsWord = (n) => `${n} bill${n === 1 ? '' : 's'}`;
const PAGE = 100;                       // rows drawn at a time on Paid and All
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

/** A small menu anchored to a button, portaled so the table cannot clip it. */
function Pop({ anchor, align = 'right', onClose, children, label }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 4 > 0;
    setPos({ left, top: up ? r.top - h - 4 : r.bottom + 4, origin: `${up ? 'bottom' : 'top'} ${align}` });
    const first = el.querySelector('input, [role^=menuitem]:not([aria-disabled=true])');
    first?.focus({ preventScroll: true });
  }, [anchor, align]);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target) && !anchor?.contains(e.target)) onClose(); };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...ref.current.querySelectorAll('[role^=menuitem]:not([aria-disabled=true])')];
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className="breg-pop" role="menu" aria-label={label}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, '--pop-origin': pos?.origin }}>
      {children}
    </div>,
    document.body,
  );
}

const MenuItem = ({ icon: Icon, children, hint, onSelect, danger, disabled, role = 'menuitem', checked, title }) => (
  <button type="button" role={role} aria-checked={checked} aria-disabled={disabled || undefined} title={title}
    className={`mi${danger ? ' danger' : ''}`}
    onClick={() => { if (!disabled) onSelect?.(); }}>
    {checked !== undefined && <span className="tick">{checked ? <Check size={14} /> : null}</span>}
    {Icon && <Icon size={15} />}
    <span>{children}</span>
    {hint !== undefined && <span className="x">{hint}</span>}
  </button>
);

/** The actions a bill row offers, one table for the ⋮ menu and the keyboard. */
function rowActions(b, h) {
  const one = b.lines.length === 1 ? b.lines[0] : null;
  return [
    b.due >= 0.5 && b.state !== 'cancelled' && { key: 'p', label: 'Record payment', icon: Banknote, run: () => h.onPay?.(b) },
    { key: 'v', label: 'Voucher', icon: FileText, run: () => h.onVoucher?.(b) },
    b.paid > 0.005 && { key: null, label: 'Payments', icon: Receipt, run: () => h.onPayments?.(b) },
    one && { key: 'h', label: 'Price history', icon: LineChart, run: () => h.onHistory?.(one) },
    one && { key: 'd', label: 'Duplicate', icon: Copy, run: () => h.onDuplicate?.(one) },
    one && { key: 'r', label: 'Return', icon: RotateCcw, run: () => h.onReturn?.(one) },
    { key: 'e', label: 'Edit bill', icon: Pencil, run: () => h.onEdit?.(b) },
    one && { key: 'Delete', label: 'Delete', icon: Trash2, danger: true, run: () => h.onDelete?.(one) },
  ].filter(Boolean);
}

/**
 * The purchase bill register.
 *
 * `bills` is every bill the shop has, already decorated by decorateBills.
 * Every count and total is worked out from that whole set after filtering;
 * paging only limits how many rows are drawn.
 */
export default function BillRegister({
  bills, today, productById = {}, voucherNoOf = () => '', suppliers = [],
  onNew, onPay, onBulkPay, onVoucher, onPayments, onEdit, onHistory, onDuplicate, onReturn, onDelete, onSetStatus,
}) {
  const presets = useMemo(() => datePresets(today), [today]);
  const nameOf = useCallback((id) => productById[id]?.name || '', [productById]);

  // ── state ────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState(() => store.get('purchases.reg.tab', 'due'));
  const [views, setViews] = useState(() => store.get('purchases.reg.views', {}));
  const view = views[tab] || defaultView(tab);
  const [q, setQ] = useState('');
  const [rangeId, setRangeId] = useState('fy');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [sups, setSups] = useState([]);
  const [terms, setTerms] = useState([]);
  const [open, setOpen] = useState(() => new Set());
  const [sel, setSel] = useState(() => new Set());
  const [limit, setLimit] = useState(PAGE);
  const [menu, setMenu] = useState(null);       // { kind, anchor, bill? }
  const [toast, setToast] = useState(null);     // { text, action, run }
  const searchRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => store.set('purchases.reg.tab', tab), [tab]);
  useEffect(() => store.set('purchases.reg.views', views), [views]);
  useEffect(() => { if (!toast) return undefined; const id = setTimeout(() => setToast(null), 5000); return () => clearTimeout(id); }, [toast]);

  const range = useMemo(() => (rangeId === 'custom' && custom.from && custom.to
    ? { id: 'custom', label: 'Custom', from: custom.from, to: custom.to }
    : presets.find((p) => p.id === rangeId) || presets.find((p) => p.id === 'fy')), [rangeId, custom, presets]);

  // ── data ─────────────────────────────────────────────────────────────────
  // What is owed is owed whatever the date: last year's unpaid bill is still
  // due this year. So the open tabs (Due, Overdue, Part paid) ignore the date
  // range; it applies to Paid and All.
  const anyDate = useMemo(() => filterRegister(bills, {
    suppliers: sups, terms, q, productNameOf: nameOf, voucherNoOf,
  }), [bills, sups, terms, q, nameOf, voucherNoOf]);
  const inRange = useMemo(() => filterRegister(anyDate, { range }), [anyDate, range]);
  const stats = useMemo(() => {
    const open = tabStats(anyDate);
    const ranged = tabStats(inRange);
    return Object.fromEntries(TABS.map((t) => [t.id, OPEN_TABS.includes(t.id) ? open[t.id] : ranged[t.id]]));
  }, [anyDate, inRange]);
  const tabDef = TABS.find((t) => t.id === tab) || TABS[0];
  const isOpenTab = OPEN_TABS.includes(tab);
  const shown = useMemo(() => (isOpenTab ? anyDate : inRange).filter(tabDef.test), [isOpenTab, anyDate, inRange, tabDef]);
  const sum = useMemo(() => totals(shown), [shown]);

  // Open tabs draw every open bill: what is owed must never sit behind a
  // "load more". Paid and All draw PAGE rows at a time.
  const paged = !isOpenTab && shown.length > limit;
  const drawn = useMemo(() => {
    if (!paged) return shown;
    const sorted = [...shown].sort((SORTS[view.sort] || SORTS.new).fn);
    return sorted.slice(0, limit);
  }, [shown, paged, limit, view.sort]);
  // Bands are worked out over every bill shown, so a band's subtotal is the
  // whole band's even when only some of its rows are drawn yet.
  const bands = useMemo(() => {
    const all = bandRegister(shown, { group: view.group, sort: view.sort, today });
    if (!paged) return all;
    const keep = new Set(drawn.map((b) => b.id));
    return all.map((band) => ({ ...band, bills: band.bills.filter((b) => keep.has(b.id)) })).filter((band) => band.bills.length);
  }, [shown, drawn, paged, view, today]);
  const supplierOptions = useMemo(() => {
    const due = new Map();
    for (const b of bills) due.set(b.supplier_id, (due.get(b.supplier_id) || 0) + (b.state === 'cancelled' ? 0 : b.due));
    return suppliers.filter((s) => due.has(s.id)).map((s) => ({ ...s, due: due.get(s.id) }))
      .sort((a, b) => b.due - a.due || String(a.name).localeCompare(String(b.name)));
  }, [bills, suppliers]);

  // Selection only ever holds rows on screen.
  const shownIds = useMemo(() => new Set(shown.map((b) => b.id)), [shown]);
  const selected = useMemo(() => shown.filter((b) => sel.has(b.id)), [shown, sel]);

  /**
   * Change what is shown. If that hides any selected bill, the selection is
   * cleared -- never acted on out of sight -- with an Undo that puts back the
   * view and the selection together.
   */
  const changeView = (mutate) => {
    const snap = { tab, q, rangeId, custom, sups, terms, sel: new Set(sel) };
    mutate();
    setLimit(PAGE);
    if (sel.size) {
      setSel(new Set());
      const n = sel.size;
      const restore = () => {
        setTab(snap.tab); setQ(snap.q); setRangeId(snap.rangeId); setCustom(snap.custom);
        setSups(snap.sups); setTerms(snap.terms); setSel(snap.sel); setToast(null);
      };
      setToast({ text: `Selection of ${billsWord(n)} cleared · ${isMac ? '⌘Z' : 'Ctrl+Z'}`, action: 'Undo', run: restore });
    }
  };
  useEffect(() => {
    if (!toast?.run) return undefined;
    const k = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault(); toast.run();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [toast]);

  const setView = (patch) => setViews((v) => ({ ...v, [tab]: { ...view, ...patch } }));
  const toggle = (setFn, id) => setFn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const closeMenu = useCallback((refocus) => {
    setMenu((m) => { if (refocus && m?.anchor) setTimeout(() => m.anchor.focus?.({ preventScroll: true }), 0); return null; });
  }, []);
  const openMenu = (kind, e, extra = {}) => {
    const anchor = e.currentTarget;
    setMenu((m) => (m?.kind === kind && m.anchor === anchor ? null : { kind, anchor, ...extra }));
  };
  const handlers = { onPay, onVoucher, onPayments, onEdit, onHistory, onDuplicate, onReturn, onDelete };

  // ── export ───────────────────────────────────────────────────────────────
  const exportCsv = (list) => {
    const csv = registerCsv(list, { productNameOf: nameOf, voucherNoOf });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = isOpenTab ? `purchases-${tab}-every-open-bill.csv` : `purchases-${tab}-${range.from}-to-${range.to}.csv`.replace(/0000-01-01|9999-12-31/g, 'all');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const exportPdf = (list) => {
    const w = window.open('', '_blank');
    if (!w) { setToast({ text: 'Allow pop-ups to save the PDF' }); return; }
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const t = totals(list);
    const rows = list.map((b) => `<tr><td>${esc(b.bill_no || voucherNoOf(b))}</td><td>${esc(fmtDate(b.date))}</td><td>${esc(b.supplier_name)}</td><td>${esc(STATE_LABEL[b.state])}</td><td class=r>${money(b.total)}</td><td class=r>${money(b.paid)}</td><td class=r>${money(b.due)}</td></tr>`).join('');
    w.document.write(`<!doctype html><title>Purchase bills</title><style>body{font:12px/1.4 Manrope,Arial,sans-serif;margin:24px;color:#111}h1{font-size:16px;margin:0 0 4px}p{color:#555;margin:0 0 12px}table{border-collapse:collapse;width:100%}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}th{background:#f6f5f3}.r{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700}</style>
      <h1>Purchase bills · ${esc(tabDef.label)}</h1><p>${isOpenTab ? 'Every open bill, any date' : `${esc(range.label)} · ${esc(fmtDate(range.from))} – ${esc(fmtDate(range.to))}`} · ${billsWord(list.length)}</p>
      <table><thead><tr><th>Bill no.</th><th>Date</th><th>Supplier</th><th>Status</th><th class=r>Amount</th><th class=r>Paid</th><th class=r>Due</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td colspan=4>Total</td><td class=r>${money(t.total)}</td><td class=r>${money(t.paid)}</td><td class=r>${money(t.due)}</td></tr></tfoot></table><script>window.print()</' + 'script>`);
    w.document.close();
  };

  // ── keyboard ─────────────────────────────────────────────────────────────
  const rowsOnScreen = () => [...(bodyRef.current?.querySelectorAll('.row') || [])];
  const onRegisterKey = (e) => {
    const row = e.target.closest?.('.row');
    // Keys belong to the row itself. On its own buttons and checkbox, Enter
    // and Space must do what those controls do.
    if (!row || e.target !== row || e.metaKey || e.ctrlKey || e.altKey) return;
    const b = shown.find((x) => x.id === row.dataset.id);
    if (!b) return;
    const k = e.key;
    const move = (d) => { const rs = rowsOnScreen(); const i = rs.indexOf(row); rs[Math.max(0, Math.min(rs.length - 1, i + d))]?.focus(); };
    if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (k === 'x' || k === ' ') { e.preventDefault(); toggle(setSel, b.id); return; }
    if (k === 'Enter' || k === 'ArrowRight') { e.preventDefault(); setOpen((s) => new Set(s).add(b.id)); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); setOpen((s) => { const n = new Set(s); n.delete(b.id); return n; }); return; }
    if (k === '.') { e.preventDefault(); const btn = row.querySelector('.morebtn'); setMenu({ kind: 'row', anchor: btn, bill: b }); return; }
    const act = rowActions(b, handlers).find((a) => a.key && (a.key === k || a.key === k.toLowerCase() || (a.key === 'Delete' && k === 'Backspace')));
    if (act) { e.preventDefault(); act.run(); }
  };
  useEffect(() => {
    const k = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"], .breg-pop')) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); onNew?.(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onNew]);

  const onTabKey = (e) => {
    const ids = TABS.map((t) => t.id);
    const i = ids.indexOf(tab);
    let n = null;
    if (e.key === 'ArrowRight') n = ids[(i + 1) % ids.length];
    else if (e.key === 'ArrowLeft') n = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') n = ids[0];
    else if (e.key === 'End') n = ids[ids.length - 1];
    if (!n) return;
    e.preventDefault();
    changeView(() => setTab(n));
    setTimeout(() => document.getElementById(`breg-tab-${n}`)?.focus(), 0);
  };

  // ── pieces ───────────────────────────────────────────────────────────────
  const multiYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  const rangeText = range.id === 'all' ? 'Every bill' : `${fmtDate(range.from, { year: multiYear })} – ${fmtDate(range.to)}`;
  const supLabel = !sups.length ? 'All' : sups.length === 1 ? (supplierOptions.find((s) => s.id === sups[0])?.name || '1 supplier') : `${sups.length} selected`;
  const termLabel = !terms.length ? 'Any' : terms.map((t) => TERMS[t]).join(', ');
  const sortOn = (k) => (k === 'date' && DATE_SORTS.includes(view.sort)) || (k === 'amt' && view.sort.startsWith('amt')) || (k === 'due' && (view.sort === 'due' || view.sort === 'dueasc'));
  const ariaSort = (k) => (sortOn(k) ? (['old', 'amtasc', 'dueasc'].includes(view.sort) ? 'ascending' : 'descending') : 'none');
  const headSort = (k) => {
    const pairs = { date: ['new', 'old'], amt: ['amt', 'amtasc'], due: ['due', 'dueasc'] }[k];
    setView({ sort: view.sort === pairs[0] ? pairs[1] : pairs[0] });
  };
  const overTxt = sum.overdue > 0.005 && Math.abs(sum.overdue - sum.due) > 0.005
    ? <>, of which <b className="neg">{rupee(sum.overdue)}</b> overdue</>
    : sum.overdue > 0.005 ? <>, <b className="neg" style={{ fontFamily: 'inherit', fontSize: 13 }}>all overdue</b></> : null;
  const supCount = new Set(shown.map((b) => b.supplier_id)).size;

  return (
    <div className="breg" data-testid="bill-register">
      {/* tabs */}
      <div className="tabs" role="tablist" aria-label="Payment status" onKeyDown={onTabKey}>
        {TABS.map((t) => {
          const s = stats[t.id];
          const on = tab === t.id;
          return (
            <button key={t.id} id={`breg-tab-${t.id}`} className="tab" role="tab" type="button" aria-selected={on}
              aria-controls="breg-register" tabIndex={on ? 0 : -1} data-tab={t.id}
              onClick={() => changeView(() => setTab(t.id))}>
              {t.label}<span className="c">{s.count}</span>
              {t.money && s.count > 0 && <span className={`a${t.neg ? ' neg' : ''}`}>{rupee(s.due)}</span>}
            </button>
          );
        })}
      </div>

      {/* toolbar */}
      <div className="toolbar">
        <label className="search">
          <span className="sr">Search bills</span>
          <Search size={14} />
          <input ref={searchRef} type="search" placeholder="Search bills" title="Bill no., voucher no., supplier or item"
            autoComplete="off" value={q} onChange={(e) => { const v = e.target.value; changeView(() => setQ(v)); }} />
          <kbd>/</kbd>
        </label>
        {isOpenTab ? (
          <span className="fbtn static" title="Every bill still owed is shown, whatever its date" data-testid="any-date">
            <Calendar size={14} /><span>Any date</span><span className="rng">every open bill</span>
          </span>
        ) : (
          <button type="button" className="fbtn on" aria-haspopup="menu" aria-expanded={menu?.kind === 'date'} onClick={(e) => openMenu('date', e)}>
            <Calendar size={14} /><span>{range.label}</span><span className="rng">{rangeText}</span><ChevronDown size={14} className="chev" />
          </button>
        )}
        <button type="button" className={`fbtn${sups.length ? ' on' : ' dflt'}`} aria-haspopup="menu" aria-expanded={menu?.kind === 'sup'} onClick={(e) => openMenu('sup', e, { align: 'left' })}>
          <span className="lbl">Supplier</span><span className="v">{supLabel}</span><ChevronDown size={14} className="chev" />
        </button>
        <button type="button" className={`fbtn${terms.length ? ' on' : ' dflt'}`} aria-haspopup="menu" aria-expanded={menu?.kind === 'terms'} onClick={(e) => openMenu('terms', e, { align: 'left' })}>
          <span className="lbl">Terms</span><span className="v">{termLabel}</span><ChevronDown size={14} className="chev" />
        </button>
        <button type="button" className="fbtn sm-only" aria-haspopup="menu" onClick={(e) => openMenu('view', e)}>
          <ArrowUpDown size={14} />View<ChevronDown size={14} className="chev" />
        </button>
        <div className="tb-right">
          <button type="button" className="fbtn" aria-haspopup="menu" aria-expanded={menu?.kind === 'sort'} onClick={(e) => openMenu('sort', e)}>
            <ArrowUpDown size={14} /><span className="lbl">Sort</span><span>{SORTS[view.sort]?.label}</span><ChevronDown size={14} className="chev" />
          </button>
          <button type="button" className="fbtn" aria-haspopup="menu" aria-expanded={menu?.kind === 'group'} onClick={(e) => openMenu('group', e)}>
            <span className="lbl">Group</span><span>{GROUPS[view.group]?.label}</span><ChevronDown size={14} className="chev" />
          </button>
          <button type="button" className="btn btn-quiet" aria-haspopup="menu" aria-expanded={menu?.kind === 'export'} onClick={(e) => openMenu('export', e)}>
            <Download size={14} />Export<ChevronDown size={14} className="chev" />
          </button>
        </div>
      </div>

      {(q || sups.length > 0 || terms.length > 0) && (
        <div className="chips">
          {q && <span className="chip">Search: <b>{q}</b><button type="button" aria-label="Remove search" onClick={() => changeView(() => setQ(''))}><X size={13} /></button></span>}
          {sups.map((id) => {
            const nm = supplierOptions.find((s) => s.id === id)?.name || id;
            return <span key={id} className="chip">Supplier: <b>{nm}</b><button type="button" aria-label={`Remove supplier ${nm}`} onClick={() => changeView(() => setSups((s) => s.filter((x) => x !== id)))}><X size={13} /></button></span>;
          })}
          {terms.map((t) => <span key={t} className="chip">Terms: <b>{TERMS[t]}</b><button type="button" aria-label={`Remove terms ${TERMS[t]}`} onClick={() => changeView(() => setTerms((s) => s.filter((x) => x !== t)))}><X size={13} /></button></span>)}
          <button type="button" className="linkbtn" onClick={() => changeView(() => { setQ(''); setSups([]); setTerms([]); })}>Clear all</button>
        </div>
      )}

      {/* the filtered set in one sentence */}
      <div className="summary" aria-live="polite" data-testid="register-summary">
        {shown.length > 0 && (
          <>
            <div className="s">
              <span><b>{shown.length}</b> {shown.length === 1 ? 'bill' : 'bills'} from {supCount} supplier{supCount === 1 ? '' : 's'}</span>
              <span><b>{rupee(sum.total)}</b> billed</span>
              <span><b>{rupee(sum.paid)}</b> paid</span>
              {tab !== 'paid' && <span><b>{rupee(sum.due)}</b> due{overTxt}</span>}
            </div>
            <span className="ctx">{isOpenTab ? 'Every open bill, any date' : `${range.label} · ${rangeText}`}</span>
            <div className="msum">
              {tab === 'paid'
                ? <><b>{rupee(sum.paid)}</b> paid · {billsWord(shown.length)}</>
                : <><b>{rupee(sum.due)}</b> due{sum.overdue > 0.005 && <> · <b className="neg">{rupee(sum.overdue)}</b> overdue</>} · {billsWord(shown.length)}</>}
            </div>
          </>
        )}
      </div>

      <Register
        bands={bands} view={view} tab={tab} isOpenTab={isOpenTab} shown={shown} drawn={drawn} sum={sum}
        open={open} setOpen={setOpen} sel={sel} setSel={setSel} toggle={toggle} shownIds={shownIds}
        selected={selected} handlers={handlers} productById={productById} voucherNoOf={voucherNoOf}
        menu={menu} setMenu={setMenu} bodyRef={bodyRef} onKeyDown={onRegisterKey}
        sortOn={sortOn} ariaSort={ariaSort} headSort={headSort} paged={paged}
        onMore={() => setLimit((l) => l + PAGE)} onBulkPay={onBulkPay} onBulkExport={() => exportCsv(selected)}
        range={range} q={q} hasFilters={q || sups.length || terms.length}
        onClear={() => changeView(() => { setQ(''); setSups([]); setTerms([]); })}
        filteredDue={stats.due.due}
        drawnIds={drawn.map((b) => b.id)}
      />

      <div className="foot-note">
        <span><kbd>/</kbd> search</span><span><kbd>J</kbd><kbd>K</kbd> move</span><span><kbd>→</kbd><kbd>←</kbd> open lines</span>
        <span><kbd>X</kbd> select</span><span><kbd>.</kbd> row actions</span><span><kbd>P</kbd> pay</span>
        <span><kbd>V</kbd> voucher</span><span><kbd>E</kbd> edit</span><span><kbd>N</kbd> new purchase</span>
      </div>

      {/* menus */}
      {menu?.kind === 'date' && (
        <Pop anchor={menu.anchor} onClose={closeMenu} label="Date range">
          <div className="hd">Bill date</div>
          {presets.map((p) => (
            <MenuItem key={p.id} role="menuitemradio" checked={rangeId === p.id}
              hint={p.id === 'all' ? '' : <span className="num" style={{ fontSize: 11.5 }}>{p.sub || `${fmtDate(p.from, { year: false })} – ${fmtDate(p.to, { year: false })}`}</span>}
              onSelect={() => { changeView(() => setRangeId(p.id)); closeMenu(true); }}>{p.label}</MenuItem>
          ))}
          <div className="sep" />
          <div className="hd">Custom range</div>
          <div className="custom">
            <input type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <input type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
          <MenuItem disabled={!custom.from || !custom.to || custom.from > custom.to}
            onSelect={() => { changeView(() => setRangeId('custom')); closeMenu(true); }}>Apply custom range</MenuItem>
        </Pop>
      )}
      {menu?.kind === 'sup' && (
        <SupplierMenu anchor={menu.anchor} onClose={closeMenu} options={supplierOptions} value={sups}
          onToggle={(id) => changeView(() => setSups((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])))}
          onClear={() => changeView(() => setSups([]))} />
      )}
      {menu?.kind === 'terms' && (
        <Pop anchor={menu.anchor} align="left" onClose={closeMenu} label="Terms">
          <div className="hd">How the bill was bought</div>
          {Object.entries(TERMS).map(([k, label]) => (
            <MenuItem key={k} role="menuitemcheckbox" checked={terms.includes(k)}
              onSelect={() => changeView(() => setTerms((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k])))}>{label}</MenuItem>
          ))}
        </Pop>
      )}
      {(menu?.kind === 'sort' || menu?.kind === 'view') && (
        <Pop anchor={menu.anchor} onClose={closeMenu} label="Sort and group">
          <div className="hd">Sort</div>
          {Object.entries(SORTS).map(([k, s]) => (
            <MenuItem key={k} role="menuitemradio" checked={view.sort === k} onSelect={() => { setView({ sort: k }); if (menu.kind === 'sort') closeMenu(true); }}>{s.long}</MenuItem>
          ))}
          {menu.kind === 'view' && (
            <>
              <div className="sep" />
              <div className="hd">Group</div>
              {Object.entries(GROUPS).map(([k, g]) => (
                <MenuItem key={k} role="menuitemradio" checked={view.group === k} hint={g.sub} onSelect={() => setView({ group: k })}>{g.label}</MenuItem>
              ))}
            </>
          )}
          <div className="ft">Bands keep their own order; this sorts the bills inside each band. Saved for this tab.</div>
        </Pop>
      )}
      {menu?.kind === 'group' && (
        <Pop anchor={menu.anchor} onClose={closeMenu} label="Group">
          <div className="hd">Group bills by</div>
          {Object.entries(GROUPS).map(([k, g]) => (
            <MenuItem key={k} role="menuitemradio" checked={view.group === k} hint={g.sub} onSelect={() => { setView({ group: k }); closeMenu(true); }}>{g.label}</MenuItem>
          ))}
        </Pop>
      )}
      {menu?.kind === 'export' && (
        <Pop anchor={menu.anchor} onClose={closeMenu} label="Export">
          <div className="hd">{billsWord(shown.length)} in this view</div>
          <MenuItem icon={Download} hint="opens in Excel" onSelect={() => { exportCsv(shown); closeMenu(true); }}>CSV</MenuItem>
          <MenuItem icon={FileText} hint="print to PDF" onSelect={() => { exportPdf(shown); closeMenu(true); }}>PDF</MenuItem>
        </Pop>
      )}
      {menu?.kind === 'row' && menu.bill && (
        <Pop anchor={menu.anchor} onClose={closeMenu} label={`Actions for ${menu.bill.bill_no || voucherNoOf(menu.bill)}`}>
          {rowActions(menu.bill, handlers).map((a, i, all) => (
            <React.Fragment key={a.label}>
              {a.danger && i > 0 && !all[i - 1].danger && <div className="sep" />}
              <MenuItem icon={a.icon} danger={a.danger} hint={a.key ? <kbd>{a.key === 'Delete' ? '⌫' : a.key.toUpperCase()}</kbd> : undefined}
                onSelect={() => { closeMenu(); a.run(); }}>{a.label}</MenuItem>
            </React.Fragment>
          ))}
          {onSetStatus && (
            <>
              <div className="sep" />
              <div className="hd">Mark as</div>
              {['RECEIVED', 'ORDERED', 'PENDING', 'CANCELLED'].map((st) => (
                <MenuItem key={st} role="menuitemradio" checked={String(menu.bill.status || 'RECEIVED').toUpperCase() === st}
                  onSelect={() => { closeMenu(); onSetStatus(menu.bill, st); }}>{st.charAt(0) + st.slice(1).toLowerCase()}</MenuItem>
              ))}
            </>
          )}
        </Pop>
      )}

      {menu?.kind === 'line' && menu.line && (
        <Pop anchor={menu.anchor} onClose={closeMenu} label={`Actions for ${nameOf(menu.line.linked_product_id) || 'line'}`}>
          <div className="hd">{nameOf(menu.line.linked_product_id) || 'This line'}</div>
          <MenuItem icon={LineChart} onSelect={() => { closeMenu(); onHistory?.(menu.line); }}>Price history</MenuItem>
          <MenuItem icon={Copy} onSelect={() => { closeMenu(); onDuplicate?.(menu.line); }}>Duplicate as a new purchase</MenuItem>
          <MenuItem icon={RotateCcw} onSelect={() => { closeMenu(); onReturn?.(menu.line); }}>Return to supplier</MenuItem>
          <div className="sep" />
          <MenuItem icon={Trash2} danger onSelect={() => { closeMenu(); onDelete?.(menu.line); }}>Delete this line</MenuItem>
        </Pop>
      )}

      {toast && createPortal(
        <div className="breg-toast" role="status">
          {toast.text}
          {toast.action && <button type="button" onClick={toast.run}>{toast.action}</button>}
        </div>,
        document.body,
      )}
    </div>
  );
}

function SupplierMenu({ anchor, onClose, options, value, onToggle, onClear }) {
  const [f, setF] = useState('');
  const list = options.filter((s) => String(s.name || '').toLowerCase().includes(f.trim().toLowerCase()));
  return (
    <Pop anchor={anchor} align="left" onClose={onClose} label="Supplier">
      <div className="inp"><input type="search" placeholder="Find a supplier" aria-label="Find a supplier" value={f} onChange={(e) => setF(e.target.value)} /></div>
      <div className="hd">By amount due</div>
      {list.map((s) => (
        <MenuItem key={s.id} role="menuitemcheckbox" checked={value.includes(s.id)}
          hint={<span className="num">{s.due >= 0.5 ? rupee(s.due) : '—'}</span>} onSelect={() => onToggle(s.id)}>{s.name}</MenuItem>
      ))}
      {!list.length && <div className="ft">No supplier matches “{f}”.</div>}
      {value.length > 0 && <><div className="sep" /><MenuItem onSelect={onClear}>Show all suppliers</MenuItem></>}
    </Pop>
  );
}

// ── the table ───────────────────────────────────────────────────────────────

function StatusCell({ b }) {
  const term = termOf(b);
  const mode = term === 'CREDIT' ? `Credit ${b.credit}d` : TERMS[term] || term;
  let cls, t, m;
  if (b.state === 'cancelled') {
    cls = 'paid'; t = 'Cancelled'; m = 'Not owed';
  } else if (b.state === 'paid') {
    cls = 'paid'; t = 'Paid';
    m = `${term === 'CREDIT' ? 'Credit · settled' : mode}${b.paidOn ? ` ${fmtDate(b.paidOn, { year: false })}` : ''}`;
  } else if (b.state === 'over') {
    cls = 'over'; t = `Overdue ${-b.dleft}d`;
    m = b.paid > 0.005 ? `Part paid · due ${fmtDate(b.dueOn, { year: false })}` : `Was due ${fmtDate(b.dueOn, { year: false })}`;
  } else if (b.state === 'part') {
    cls = 'part'; t = 'Part paid'; m = `Due in ${b.dleft}d · ${fmtDate(b.dueOn, { year: false })}`;
  } else if (b.dleft === 0) {
    cls = 'due today'; t = 'Due today'; m = `${fmtDate(b.dueOn, { year: false })} · ${mode}`;
  } else {
    cls = 'due'; t = `Due in ${b.dleft}d`; m = `${fmtDate(b.dueOn, { year: false })} · ${mode}`;
  }
  const tip = term === 'CREDIT' ? `${b.credit} days credit · due ${fmtDate(b.dueOn)}` : `${mode} purchase`;
  return (
    <div className={`st ${cls}`} title={tip} data-state={b.state}>
      <span className="t">{t}{b.due >= 0.5 && b.paid > 0.005 && <span className="dueamt">{money(b.due)} left</span>}</span>
      <span className="m">{m}</span>
    </div>
  );
}

function DeltaCell({ l }) {
  const d = l.delta;
  if (!d) return <div className="delta first"><span className="p">First purchase</span><span className="v">no earlier rate</span></div>;
  const when = fmtDate(d.prevDate, { year: false });
  if (Math.abs(d.pct) < 0.5) return <div className="delta flat"><span className="p">No change</span><span className="v">vs ₹{money(d.prevRate)} · {when}</span></div>;
  const up = d.pct > 0;
  return (
    <div className={`delta ${up ? 'up' : 'dn'}`} data-testid="line-delta"
      aria-label={`${up ? 'Costlier' : 'Cheaper'} by ${Math.abs(d.pct).toFixed(1)} percent than ₹${money(d.prevRate)} on ${when}`}>
      <span className="p">{up ? '▲' : '▼'} {Math.abs(d.pct).toFixed(1)}%</span>
      <span className="v">vs ₹{money(d.prevRate)} · {when}</span>
    </div>
  );
}

function BillRow({ b, group, isOpen, isSel, onToggleOpen, onToggleSel, productById, voucherNoOf, handlers, menu, setMenu }) {
  const name = (l) => productById[l.linked_product_id]?.name || 'Item';
  const first = b.lines[0];
  const more = b.lines.length - 1;
  const pv = voucherNoOf(b);
  const ref = b.bill_no || pv;
  const sup = b.supplier || {};
  const unit = productById[first?.linked_product_id]?.unit || '';
  const creep = b.dearer
    ? <span className="creep" title={`${b.dearer} item${b.dearer > 1 ? 's' : ''} up 5% or more on the last purchase`}>▲ {b.dearer} costlier</span>
    : b.cheaper ? <span className="creep" title={`${b.cheaper} item${b.cheaper > 1 ? 's' : ''} down 5% or more on the last purchase`}>▼ {b.cheaper} cheaper</span> : null;
  const yearInDate = group === 'status' || group === 'supplier' || group === 'none';
  const menuOpen = menu?.kind === 'row' && menu.bill?.id === b.id;

  return (
    <div className={`bill${isOpen ? ' open' : ''}${isSel ? ' sel' : ''}`} data-testid="bill" data-bill={b.bill_id}>
      <div className="row grid" role="row" tabIndex={0} data-id={b.id} aria-expanded={isOpen}
        // A tap anywhere on the row opens it -- on a phone the chevron is
        // hidden and this is the only way to reach a bill's lines.
        onClick={(e) => { if (!e.target.closest('button, input, a, label')) onToggleOpen(); }}
        aria-label={`${ref}, ${b.supplier_name || ''}, ${money(b.total)}`}>
        <div className="cb" role="cell"><input type="checkbox" checked={isSel} onChange={onToggleSel} aria-label={`Select bill ${ref}`} /></div>
        <div className="chev" role="cell">
          <button className="chevbtn" type="button" onClick={onToggleOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} ${b.lines.length} line${b.lines.length > 1 ? 's' : ''} of ${ref}`}>
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="c-bill" role="cell">
          <div className="two">
            {b.bill_no ? <span className="t billno">{b.bill_no}</span> : <span className="t billno pv">{pv}</span>}
            <span className="m">
              {!b.bill_no ? <span title="No supplier bill number recorded">{group !== 'day' && <>{fmtDate(b.date, { year: false })} · </>}no bill no.</span>
                : group === 'day' ? pv
                  : <><span className="dl">{fmtDate(b.date, { year: yearInDate })}</span><span className="ds">{fmtDate(b.date, { year: false })}</span><span className="pvs"> · {pv}</span></>}
            </span>
          </div>
        </div>
        <div className="c-sup sup" role="cell">
          <div className="two">
            <span className="t" title={`${b.supplier_name || 'Unknown supplier'}${sup.gstin ? ` · GSTIN ${sup.gstin}` : ''}`}>{b.supplier_name || 'Unknown supplier'}</span>
            <span className="m">{sup.address ? String(sup.address).split(',').slice(-2).join(',').trim() : (sup.gstin || '')}</span>
          </div>
        </div>
        <div className="c-items items" role="cell">
          <div className="two">
            <span className="t">{group !== 'day' && <span className="mdate">{fmtDate(b.date, { year: false })} · </span>}{first ? name(first) : '—'}</span>
            <span className="m">
              {more > 0 ? <span className="more">+{more} more</span> : <span>{Number(first?.quantity || 0).toLocaleString('en-IN')} {unit}</span>}
              {creep && <span className="creep-wrap"> · {creep}</span>}
            </span>
          </div>
        </div>
        <div className="c-st" role="cell"><StatusCell b={b} /></div>
        <div className="c-amt amt r" role="cell">{money(b.total)}</div>
        <div className="c-paid amt r muted" role="cell">{b.paid > 0.005 ? money(b.paid) : <span className="sr">nil</span>}</div>
        <div className={`c-due amt r${b.state === 'over' ? ' neg' : ''}`} role="cell">{b.due >= 0.5 ? money(b.due) : <span className="sr">nil</span>}</div>
        <div className="c-more" role="cell">
          <button className="morebtn" type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`Actions for ${ref}`}
            onClick={(e) => { const anchor = e.currentTarget; setMenu((m) => (m?.kind === 'row' && m.bill?.id === b.id ? null : { kind: 'row', anchor, bill: b })); }}>
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="lines" role="rowgroup">
          {b.lines.map((l) => {
            const p = productById[l.linked_product_id] || {};
            const qty = Number(l.quantity) || 0;
            const rate = qty > 0 ? (Number(l.total_amount) || 0) / qty : 0;
            return (
              <div key={l.id} className="line grid" role="row" data-testid="bill-line">
                <div className="cb" /><div className="rail" />
                <div className="nm" role="cell">
                  <span className="t">{name(l)}</span>
                  {(p.hsn_code || p.taxRate) && <span className="h">{p.hsn_code ? `HSN ${p.hsn_code}` : ''}{p.hsn_code && p.taxRate ? ' · ' : ''}{p.taxRate ? `${p.taxRate}%` : ''}</span>}
                </div>
                <div className="qty" role="cell">{qty.toLocaleString('en-IN')} {p.unit || ''} <u>×</u> {money(rate)}</div>
                <div className="c-delta" role="cell"><DeltaCell l={l} /></div>
                <div className="c-amt amt r" role="cell">{money(l.total_amount)}</div>
                <div className="c-paid" /><div className="c-due" />
                <div className="c-x">
                  <button className="morebtn" type="button" aria-haspopup="menu" aria-label={`Actions for ${name(l)}`}
                    aria-expanded={menu?.kind === 'line' && menu.line?.id === l.id}
                    onClick={(e) => { const anchor = e.currentTarget; setMenu((m) => (m?.kind === 'line' && m.line?.id === l.id ? null : { kind: 'line', anchor, line: l, bill: b })); }}>
                    <MoreVertical size={15} />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="bfoot grid">
            <div className="cb" /><div className="rail" />
            <div className="meta">
              <span>Taxable <b>{money(b.total - b.tax)}</b></span>
              <span>{b.tax > 0.005 ? <>{b.interstate ? 'IGST' : 'CGST + SGST'} <b>{money(b.tax)}</b></> : sup.gstin ? 'No GST on these items' : 'No GST claimed · supplier has no GSTIN'}</span>
              <span>{b.paid > 0.005 ? <>Paid <b>{money(b.paid)}</b>{b.paidVia ? ` by ${b.paidVia}` : ''}{b.paidOn ? ` on ${fmtDate(b.paidOn, { year: false })}` : ''}</> : 'Nothing paid yet'}</span>
              {b.due >= 0.5 && <span>Balance <b>{money(b.due)}</b> due {fmtDate(b.dueOn, { year: false })}</span>}
              <span>{pv}</span>
            </div>
            <div className="go">
              {b.due >= 0.5 && b.state !== 'cancelled' && <button className="linkbtn" type="button" onClick={() => handlers.onPay?.(b)}>Record payment</button>}
              <button className="linkbtn" type="button" onClick={() => handlers.onVoucher?.(b)}>Open voucher</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Band({ band, group, isOpenTab }) {
  const oldest = band.bills.reduce((m, b) => Math.max(m, -b.dleft), 0);
  let sub = billsWord(band.count);
  if (group === 'status' && band.key === '0over') sub += ` · oldest ${oldest}d past due`;
  if (band.sub && group === 'week') sub = `${band.sub} · ${sub}`;
  if (group === 'month') sub += ' by bill date';
  if (group === 'supplier' && band.supplier) {
    const s = band.supplier;
    sub = `${s.gstin ? `${s.gstin} · ` : ''}${sub}${s.credit_days ? ` · ${s.credit_days} days credit` : ''}`;
  }
  const allOver = band.key === '0over';
  const showOv = band.overdue > 0.005 && !allOver;
  const showTotals = band.count > 1 || group === 'status' || group === 'month';
  return (
    <div className="band grid" role="row" data-testid="band">
      <div className="lbl">
        <b className={allOver ? 'over' : undefined}>{band.label}</b><span>{sub}</span>
        {showOv && <span className="ov">· <span className="num">{rupee(band.overdue)}</span> overdue</span>}
      </div>
      {showTotals && (
        <>
          <div className="num r c-amt">{rupee(band.total)}</div>
          <div className="num r c-paid">{band.paid > 0.005 ? rupee(band.paid) : ''}</div>
          <div className="num r c-due">{band.due >= 0.5 ? <>{rupee(band.due)}<span className="w"> due</span></> : ''}</div>
          <div className="c-x" />
        </>
      )}
      {!showTotals && isOpenTab && <div className="num r c-due">{rupee(band.due)}<span className="w"> due</span></div>}
    </div>
  );
}

function Register({
  bands, view, tab, isOpenTab, shown, drawn, sum, open, setOpen, sel, setSel, toggle, shownIds, selected,
  handlers, productById, voucherNoOf, menu, setMenu, bodyRef, onKeyDown, sortOn, ariaSort, headSort, paged,
  onMore, onBulkPay, onBulkExport, range, q, hasFilters, onClear, filteredDue, drawnIds,
}) {
  const nSel = selected.length;
  // Select-all takes the rows drawn, never bills the user has not seen.
  const allSel = nSel > 0 && nSel === drawnIds.length;
  const selAllRef = useRef(null);
  useEffect(() => { if (selAllRef.current) selAllRef.current.indeterminate = nSel > 0 && nSel < drawnIds.length; }, [nSel, drawnIds.length]);
  const tabLabel = TABS.find((t) => t.id === tab)?.label || '';
  const period = { fy: 'this FY', lfy: 'last FY', all: 'any period', custom: 'this date range' }[range.id] || range.label.toLowerCase();

  const selSum = totals(selected);
  const selSups = new Set(selected.map((b) => b.supplier_id));
  const onePay = selSups.size === 1 && selSum.due >= 0.5;
  const nDue = selected.filter((b) => b.due >= 0.5).length;
  const why = selSups.size > 1 ? `${selSups.size} suppliers selected — a payment settles one supplier`
    : selSum.due < 0.5 ? 'Nothing due on these bills' : `Settles ${billsWord(nDue)} of ${selected[0]?.supplier_name || 'this supplier'}`;
  const footOv = sum.overdue > 0.005 && Math.abs(sum.overdue - sum.due) > 0.005;

  return (
    <div className={`reg${isOpenTab ? ' open-tab' : ''}`} id="breg-register" role="table" aria-label="Purchase bills" data-group={view.group}>
      <div className="thead grid" role="row">
        <div className="cb"><input ref={selAllRef} type="checkbox" aria-label="Select all shown bills" checked={allSel}
          onChange={() => setSel(allSel ? new Set() : new Set(drawnIds))} /></div>
        <div className="chev" />
        <div role="columnheader" className="h-bill" aria-sort={ariaSort('date')}>
          <button className="sortable" type="button" data-on={sortOn('date') || undefined} onClick={() => headSort('date')}>Bill no. · date<ArrowUpDown size={13} /></button>
        </div>
        <div role="columnheader" className="h-sup">Supplier</div>
        <div role="columnheader" className="h-items">Items</div>
        <div role="columnheader" className="h-st">Status</div>
        <div role="columnheader" className="r c-amt" aria-sort={ariaSort('amt')}>
          <button className="sortable" type="button" data-on={sortOn('amt') || undefined} onClick={() => headSort('amt')}>Amount<ArrowUpDown size={13} /></button>
        </div>
        <div role="columnheader" className="r c-paid">Paid</div>
        <div role="columnheader" className="r c-due" aria-sort={ariaSort('due')}>
          <button className="sortable" type="button" data-on={sortOn('due') || undefined} onClick={() => headSort('due')}>Due<ArrowUpDown size={13} /></button>
        </div>
        <div className="c-x" />
      </div>

      <div ref={bodyRef} onKeyDown={onKeyDown}>
        {!shown.length && (
          <div className="empty" data-testid="register-empty">
            {tab === 'over' && !hasFilters
              ? <><p>Nothing is overdue.</p><p>{filteredDue >= 0.5 ? `${rupee(filteredDue)} is due, all within its credit days.` : 'Nothing is owed to suppliers.'}</p></>
              : <><p>No {tab === 'all' ? '' : `${tabLabel.toLowerCase()} `}bills{q ? ` match “${q}”` : ''}{isOpenTab ? '' : ` in ${period}`}.</p>
                {hasFilters ? <p><button className="linkbtn" type="button" onClick={onClear}>Clear filters</button></p> : null}</>}
          </div>
        )}
        {bands.map((band) => (
          <section key={band.key} role="rowgroup">
            {view.group !== 'none' && <Band band={band} group={view.group} isOpenTab={isOpenTab} />}
            {band.bills.map((b) => (
              <BillRow key={b.id} b={b} group={view.group} isOpen={open.has(b.id)} isSel={sel.has(b.id) && shownIds.has(b.id)}
                onToggleOpen={() => toggle(setOpen, b.id)} onToggleSel={() => toggle(setSel, b.id)}
                productById={productById} voucherNoOf={voucherNoOf} handlers={handlers} menu={menu} setMenu={setMenu} />
            ))}
          </section>
        ))}
        {paged && (
          <div className="loadmore" data-testid="register-more">
            <span>Showing {drawn.length} of {shown.length} bills. Counts and totals cover all of them.</span>
            <button className="btn btn-quiet" type="button" onClick={onMore}>Show next {Math.min(PAGE, shown.length - drawn.length)}</button>
          </div>
        )}
      </div>

      <div className="dock">
        {nSel > 0 && (
          <div className="bulk" role="region" aria-label="Selected bills" data-testid="bulk-bar">
            <span className="cnt">{nSel} selected</span><span className="note">·</span>
            <span className="desk">
              {Math.abs(selSum.total - selSum.due) < 0.005
                ? <><span className="tot">{rupee(selSum.due)}</span> <span className="note">due</span></>
                : <><span className="tot">{rupee(selSum.total)}</span>{selSum.due >= 0.5 && <span className="note"> · {rupee(selSum.due)} due</span>}</>}
            </span>
            {/* On a phone the bar shows what Record payment would pay. */}
            <span className="mob tot">{selSum.due >= 0.5 ? `${rupee(selSum.due)} due` : rupee(selSum.total)}</span>
            <span className="div" /><span className="note">{why}</span><span className="sp" />
            <button type="button" className="primary" disabled={!onePay} title={why} onClick={() => onBulkPay?.(selected.filter((b) => b.due >= 0.5 && b.state !== 'cancelled'))}>
              <Banknote size={15} /><span className="pay-long">Record payment</span><span className="pay-short">Pay</span>
            </button>
            <button type="button" onClick={onBulkExport} aria-label="Export selected"><Download size={15} /><span className="hide-sm">Export</span></button>
            <button type="button" aria-label="Clear selection" onClick={() => setSel(new Set())}><X size={15} /></button>
          </div>
        )}
        {shown.length > 0 && (
          <div className="tfoot grid" role="row" data-testid="register-total">
            <div className="lbl">Total<span>{billsWord(shown.length)}{paged ? ` · ${drawn.length} shown` : ''}</span>
              {footOv && <span className="ov">of which <span className="num">{rupee(sum.overdue)}</span> overdue</span>}</div>
            <div className="num r c-amt">{rupee(sum.total)}</div>
            <div className="num r c-paid">{rupee(sum.paid)}</div>
            <div className="num r c-due">{tab === 'paid' ? '' : rupee(sum.due)}</div>
            <div className="c-x" />
          </div>
        )}
      </div>
    </div>
  );
}
