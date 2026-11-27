import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, Check, RotateCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { posStoresFrom, currentStoreOf, readPosStore, writePosStore, onPosStoreChange } from '../../lib/posStore';
import { cn } from '../../lib/utils';

/**
 * This shop's stores, as the Sales screen lists them: inventory locations
 * that are not vehicles, by name. One small read per shop (a shop has a
 * handful of locations; capped at 50), read again when the menu opens.
 */
function usePosStores(tenantId, enabled) {
  const [state, setState] = useState({ stores: [], error: null, ready: false });
  const load = useCallback(async () => {
    if (!enabled || !tenantId) return;
    const { data, error } = await supabase.from('inventory_locations')
      .select('id, name, type, deleted_at')
      .eq('tenant_id', tenantId).is('deleted_at', null)
      .order('name').limit(50);
    if (error) {
      console.error('[shop card] stores read failed:', error.message, error);
      setState(prev => ({ ...prev, error: error.message || 'Read failed', ready: true }));
      return;
    }
    setState({ stores: posStoresFrom(data), error: null, ready: true });
  }, [tenantId, enabled]);
  useEffect(() => { load(); }, [load]);
  // Not asked for (no Sales access): nothing to switch, whatever was read before.
  if (!enabled || !tenantId) return { stores: [], error: null, ready: false, reload: load };
  return { ...state, reload: load };
}

/**
 * The shop card at the top of the side menu (and the phone drawer).
 *
 * Switching what can be switched today: the STORE new sales are rung at on
 * this device, when the shop has more than one (the same choice the cart
 * offers, lib/posStore). A user belongs to exactly one shop in this app
 * (users.tenant_id), so the menu names the shop, ticked, and offers no other.
 * With nothing to switch to it is a plain card, with no chevron.
 */
export default function ShopCard({ tenant, initials, subtitle, roleLabel, tenantId, canSell }) {
  const { stores, error, reload } = usePosStores(tenantId, !!canSell);
  const [savedId, setSavedId] = useState(() => readPosStore());
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => onPosStoreChange(setSavedId), []);

  const current = currentStoreOf(stores, savedId);
  const switchable = stores.length > 1;
  const sub = switchable && current ? [current.name, roleLabel].filter(Boolean).join(' · ') : subtitle;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    reload();
    const items = () => [...(menuRef.current?.querySelectorAll('[role="menuitemradio"]') || [])];
    // Start on the ticked store, as a select would.
    requestAnimationFrame(() => (items().find(el => el.getAttribute('aria-checked') === 'true') || items()[0])?.focus());
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) close(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') { close(false); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        const list = items();
        if (!list.length) return;
        e.preventDefault();
        const i = list.indexOf(document.activeElement);
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1
          : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
        list[n].focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (s) => {
    writePosStore(s.id);
    setSavedId(s.id);
    close();
  };

  const body = (
    <>
      <span className="grid place-items-center size-8 shrink-0 rounded-pill bg-amber-soft font-tight text-[12px] font-semibold text-amber-text">{initials || '•'}</span>
      <span className="min-w-0 flex-1 text-left">
        <b className="block font-tight text-[13px] font-semibold text-ink truncate">{tenant.name}</b>
        <small className="block text-[11.5px] text-mute truncate">{sub}</small>
      </span>
    </>
  );
  const cardCls = 'flex w-full items-center gap-2.5 px-2.5 py-[9px] rounded-xl bg-surface shadow-[0_1px_2px_rgba(17,20,24,0.08)] min-w-0';

  return (
    <div ref={wrapRef} className="relative">
      {switchable ? (
        <button ref={btnRef} type="button" data-card onClick={() => setOpen(o => !o)}
          aria-haspopup="menu" aria-expanded={open} title={`${tenant.name}, change store`}
          className={cn('m-press', cardCls, 'hover:bg-tile')}>
          {body}
          <ChevronsUpDown size={14} className="shrink-0 text-mute" aria-hidden="true" />
        </button>
      ) : (
        <div className={cardCls} title={tenant.name}>
          {body}
          {error && (
            <button type="button" onClick={reload} aria-label="Could not load the stores. Try again" title="Could not load the stores. Try again"
              className="m-press grid place-items-center w-7 h-7 shrink-0 rounded-xl text-bad-text hover:bg-bad-soft">
              <RotateCw size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {open && (
        <div ref={menuRef} role="menu" aria-label="Shop and store"
          className="menu-pop absolute left-0 right-0 top-full mt-1.5 z-[110] rounded-2xl border border-line bg-surface p-1.5 shadow-2xl"
          style={{ '--menu-origin': 'top center' }}>
          <div className="px-2.5 pt-1.5 pb-1 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Shop</div>
          <div className="flex items-center gap-2 px-2.5 py-2 text-[13px] text-ink">
            <span className="min-w-0 flex-1 truncate font-tight font-semibold">{tenant.name}</span>
            <Check size={14} className="shrink-0 text-amber" aria-hidden="true" />
          </div>
          <div className="mx-2.5 my-1 h-px bg-sep" aria-hidden="true" />
          <div className="px-2.5 pt-1 pb-0.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Store for new sales</div>
          <p className="px-2.5 pb-1.5 text-[11.5px] text-mute">On this device</p>
          {stores.map(s => {
            const on = current?.id === s.id;
            return (
              <div key={s.id} role="menuitemradio" aria-checked={on} tabIndex={-1}
                onClick={() => pick(s)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s); } }}
                className="flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] text-ink-2 outline-none hover:bg-tile focus-visible:bg-tile focus-visible:shadow-[inset_0_0_0_2px_var(--color-amber)]">
                <span className={cn('min-w-0 flex-1 truncate', on && 'font-semibold text-ink')}>{s.name}</span>
                {on && <Check size={14} className="shrink-0 text-amber" aria-hidden="true" />}
              </div>
            );
          })}
          {error && <p role="alert" className="px-2.5 py-2 text-[12px] text-bad-text">Could not refresh the stores. The list may be out of date.</p>}
        </div>
      )}
    </div>
  );
}
