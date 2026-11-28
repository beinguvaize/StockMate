import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

/**
 * A row's "···" menu (web redesign). Drawn in a portal at a fixed position
 * under its button, so a table's scroll box cannot clip it. Escape, a click
 * elsewhere, a scroll or a resize closes it.
 *
 *   <RowMenu label="Actions for INV-0142">
 *     {(close) => <MenuItem icon={Printer} onClick={() => { close(); print(); }}>Print</MenuItem>}
 *   </RowMenu>
 *
 * The Sales list carries its own copy of the same menu; this one adds the
 * right-hand hint ("₹9,759 due", "Saved") the Invoices menu shows.
 */
export function RowMenu({ label, children, width = 236, trigger }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const close = useCallback(() => setPos(null), []);
  useEffect(() => {
    if (!pos) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos, close]);
  const toggle = () => {
    if (pos) { close(); return; }
    const r = btnRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 340;
    setPos({ right: Math.max(8, window.innerWidth - r.right), ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
  };
  return (
    <>
      {trigger ? trigger({ ref: btnRef, onClick: toggle, open: !!pos }) : (
        <button ref={btnRef} type="button" onClick={toggle} aria-label={label} title="More" aria-haspopup="menu" aria-expanded={!!pos}
          className="m-press inline-grid place-items-center w-8 h-7 rounded-xl text-mute hover:bg-well hover:text-ink font-tight text-[15px] font-bold tracking-[2px]">
          ···
        </button>
      )}
      {pos && createPortal(
        <div ref={menuRef} role="menu" aria-label={label} style={{ position: 'fixed', width, ...pos }}
          className="m-dialog z-[170] rounded-xl bg-surface p-1.5 text-left shadow-[0_0_0_1px_rgba(17,20,24,0.06),0_18px_40px_-14px_rgba(17,20,24,0.35)]">
          {children(close)}
        </div>,
        document.body,
      )}
    </>
  );
}

/** One menu line: icon, words, an optional hint on the right. `primary` is the amber one. */
export function MenuItem({ icon: Icon, children, hint, onClick, disabled, title, primary = false, danger = false }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} title={title}
      className={cn('flex w-full items-center gap-2.5 rounded-pill px-2.5 py-2 text-left font-tight text-[13.5px] font-medium text-ink-2 hover:bg-tile disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent',
        primary && 'font-semibold text-amber-text', danger && 'text-bad-text')}>
      {Icon && <Icon size={16} strokeWidth={1.8} className={cn('shrink-0', primary ? 'text-amber' : danger ? 'text-bad-text' : 'text-mute')} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <small className="ml-auto shrink-0 font-sans text-[12px] font-medium text-mute tabular-nums">{hint}</small>}
    </button>
  );
}

export const MenuRule = () => <div className="mx-1 my-[5px] h-px bg-sep" role="separator" />;

export default RowMenu;
