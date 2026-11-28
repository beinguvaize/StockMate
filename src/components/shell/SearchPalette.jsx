import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, Package, Users, Truck, Receipt, FileText, CornerDownLeft, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { useDialogClose } from '../../hooks/useDialogClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import {
  pageResults, rankRows, toResult, RANK_FIELDS, buildGroups, flatten, moveActive,
  destinationFor, paletteState, isSearchable, cleanTerm, GROUP_ORDER,
} from '../../lib/globalSearch';
import { formatCurrency, formatShortDateTime } from '../../lib/utils';
import { cn } from '../../lib/utils';

const ICON = { page: ArrowRight, product: Package, client: Users, supplier: Truck, sale: Receipt, invoice: FileText };
const GROUP_NOUN = { product: 'products', client: 'clients', supplier: 'suppliers', sale: 'bills', invoice: 'invoices' };

/**
 * Global search (Ctrl K / Cmd K), as a command palette over the page.
 *
 * Pages come from the side menu's own items (same gates); products, clients,
 * suppliers, bills and invoices from small tenant-scoped reads
 * (useGlobalSearch), only for the kinds this user may open (`kinds`).
 * Arrow keys move, Enter opens, Escape closes and puts focus back where it
 * was (useDialogClose); Tab stays inside (useFocusTrap).
 */
export default function SearchPalette({ open, onClose, navItems, kinds, tenantId, basePath = '' }) {
  if (!open) return null;
  return <Palette onClose={onClose} navItems={navItems} kinds={kinds} tenantId={tenantId} basePath={basePath} />;
}

function Palette({ onClose, navItems, kinds, tenantId, basePath }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  useDialogClose(onClose);
  useFocusTrap(boxRef, { initialRef: inputRef });

  const kindList = useMemo(() => GROUP_ORDER.filter(k => k !== 'page' && kinds?.[k]), [kinds]);
  const search = useGlobalSearch(query, { tenantId, kinds: kindList });
  const fmt = useMemo(() => ({ money: (n) => formatCurrency(n), date: (d) => formatShortDateTime(d) }), []);

  const groups = useMemo(() => {
    const byType = { page: { items: pageResults(navItems, query) } };
    if (isSearchable(query)) {
      for (const kind of kindList) {
        const got = search.byType[kind];
        if (!got) continue;
        byType[kind] = {
          items: rankRows(got.rows, search.term, RANK_FIELDS[kind], (r) => r.name || r.invoice_number || r.id)
            .map(r => toResult(kind, r, fmt)).filter(Boolean),
          error: got.error,
        };
      }
    }
    return buildGroups(byType);
  }, [navItems, query, kindList, search, fmt]);

  const items = useMemo(() => flatten(groups), [groups]);
  // Still waiting while the debounce has not caught up with what was typed,
  // so "Nothing found" never flashes between a keystroke and its read.
  const pending = search.pending || (isSearchable(query) && kindList.length > 0 && cleanTerm(query) !== search.term);
  const state = paletteState({ query, groups, pending });

  // A new list starts with its first line highlighted.
  useEffect(() => { setActive(0); }, [items.length, query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item) => {
    const to = destinationFor(item, basePath);
    if (!to) return;
    onClose();
    navigate(to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => moveActive(i, e.key === 'ArrowDown' ? 1 : -1, items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[active]) go(items[active]);
    }
  };

  const q = cleanTerm(query);
  const indexOf = new Map(items.map((it, i) => [it.id, i]));
  const activeId = items[active] ? `gs-opt-${active}` : undefined;

  return createPortal(
    <div className="fixed inset-0 z-[170] flex items-start justify-center px-4 pt-[12vh] pb-8">
      <div className="m-scrim fixed inset-0 bg-[rgba(17,20,24,0.28)]" onClick={onClose} aria-hidden="true" />
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label="Search"
        className="m-dialog relative flex max-h-[70vh] w-[min(600px,100%)] flex-col overflow-hidden rounded-[18px] bg-surface text-ink shadow-[0_24px_60px_-20px_rgba(17,20,24,0.45)]">
        <div className="flex items-center gap-2.5 border-b border-sep px-4 py-3">
          <Search size={17} className="shrink-0 text-mute" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search products, clients, bills"
            aria-label="Search products, clients, suppliers, bills and pages"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="gs-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-mute"
          />
          {pending && <Loader2 size={15} className="shrink-0 animate-spin text-mute" aria-label="Searching" />}
          <kbd className="shrink-0 rounded-[5px] bg-surface px-1.5 py-px font-tight text-[11px] font-semibold text-mute shadow-[0_0_0_1px_rgba(17,20,24,0.08)]">Esc</kbd>
        </div>

        <div ref={listRef} id="gs-list" role="listbox" aria-label="Results" className="flex-1 overflow-y-auto px-2 py-2">
          {groups.map(g => (
            <div key={g.key} role="group" aria-label={g.label} className="pb-1">
              <div className="px-2.5 pt-2 pb-1 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{g.label}</div>
              {g.items.map(item => {
                const i = indexOf.get(item.id);
                const Icon = ICON[item.type] || Search;
                const on = i === active;
                return (
                  <div key={item.id} id={`gs-opt-${i}`} data-index={i} role="option" aria-selected={on}
                    onMouseMove={() => { if (!on) setActive(i); }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(item)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2', on ? 'bg-tile' : '')}>
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', on ? 'bg-surface text-amber-text' : 'bg-well text-mute')}>
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-tight text-[13.5px] font-semibold text-ink">{item.title}</span>
                      {item.sub && <span className="block truncate text-[12px] text-mute">{item.sub}</span>}
                    </span>
                    {on && <CornerDownLeft size={14} className="shrink-0 text-mute" aria-hidden="true" />}
                  </div>
                );
              })}
              {g.error && (
                <p role="alert" className="mx-2.5 my-1 flex items-center gap-2 rounded-[10px] bg-bad-soft px-2.5 py-2 text-[12.5px] text-bad-text">
                  <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                  Could not search {GROUP_NOUN[g.key] || 'this'}. Check the connection and try again.
                </p>
              )}
            </div>
          ))}

          {state === 'loading' && <p className="px-3 py-6 text-center text-[13px] text-mute">Searching</p>}
          {state === 'short' && <p className="px-3 py-6 text-center text-[13px] text-mute">Type at least 2 letters to search</p>}
          {/* Only when every read came back and none failed; a failed read
              shows its own message in its group above. */}
          {state === 'empty' && <p className="px-3 py-6 text-center text-[13px] text-body">Nothing found for “{q}”</p>}
        </div>

        <div className="flex items-center gap-4 border-t border-sep px-4 py-2.5 text-[12px] text-mute">
          <span><Key>↑</Key> <Key>↓</Key> to move</span>
          <span><Key>Enter</Key> to open</span>
          <span><Key>Esc</Key> to close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const Key = ({ children }) => (
  <kbd className="rounded-[5px] bg-surface px-1.5 py-px font-tight text-[11px] font-semibold text-mute shadow-[0_0_0_1px_rgba(17,20,24,0.08)]">{children}</kbd>
);
