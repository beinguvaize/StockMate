import React, { useMemo, useState } from 'react';
import { Pencil, Trash2, Check, Plus } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { useFinance } from '../../hooks/useFinance';
import { useInventory } from '../../hooks/useInventory';
import { Button } from '../../components/ui/button';
import Dialog from '../../components/ui/Dialog';
import WriteFailure from '../../components/invoices/WriteFailure';
import { PanelHead, Stack, SCard, Note, IconBtn, TextLink, fieldCls } from './parts';
import { countByCategory, expensesInCategory } from './lib/settingsLib';
import { cn } from '../../lib/utils';

/**
 * Categories (approved settings-05 and 06): expense and product categories.
 * Same hook calls as before; a delete now asks in a dialog instead of a
 * browser prompt, and a failed write shows its reason.
 */

const plural = (n, one, many) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

function AddRow({ placeholder, onAdd, busy }) {
  const [v, setV] = useState('');
  const go = async () => {
    const name = v.trim();
    if (!name) return;
    const ok = await onAdd(name);
    if (ok) setV('');
  };
  return (
    <div className="mb-3 mt-3.5 flex gap-2">
      <input className={fieldCls} value={v} placeholder={placeholder} aria-label={placeholder}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} />
      <Button variant="dark" size="sm" className="h-9" onClick={go} disabled={busy || !v.trim()}><Plus aria-hidden="true" />Add</Button>
    </div>
  );
}

/** One tile: the name, an optional count, rename in place, delete. */
function Tile({ name, count, editing, onStartEdit, onRename, onCancel, onDelete }) {
  const [v, setV] = useState(name);
  if (editing) {
    const commit = () => onRename(v);
    return (
      <div className="flex items-center gap-2 rounded-xl py-[5px] pl-3.5 pr-2 shadow-[inset_0_0_0_2px_var(--color-ink)]">
        <input autoFocus value={v} aria-label={`Rename ${name}`} onChange={(e) => setV(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') onCancel(); }}
          className="min-w-0 flex-1 bg-transparent font-tight text-[13.5px] font-semibold text-ink outline-none" />
        <IconBtn label="Save name" onMouseDown={(e) => e.preventDefault()} onClick={commit}><Check /></IconBtn>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl py-[5px] pl-3.5 pr-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <span className="min-w-0 flex-1 truncate font-tight text-[13.5px] font-semibold text-ink">{name}</span>
      {count != null && <small className="shrink-0 text-[12px] text-mute tabular-nums">{plural(count, 'product', 'products')}</small>}
      <IconBtn label={`Rename ${name}`} onClick={onStartEdit}><Pencil /></IconBtn>
      <IconBtn label={`Delete ${name}`} tone="rd" onClick={onDelete}><Trash2 /></IconBtn>
    </div>
  );
}

export default function CategoriesPanel() {
  const { currentTenantId } = useTenant();
  const finance = useFinance(currentTenantId);
  const { expenseCategories = [], customCategories = [], addExpenseCategory, updateExpenseCategory, deleteExpenseCategory, expenses = [] } = finance;
  const inv = useInventory(currentTenantId);
  const { products = [], productCategories = [], addProductCategory, updateProductCategory, deleteProductCategory } = inv;

  const [editExp, setEditExp] = useState(null);
  const [editProd, setEditProd] = useState(null);
  const [expErr, setExpErr] = useState(null);
  const [prodErr, setProdErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);   // { kind: 'expense'|'product', name, id }
  const [confirmErr, setConfirmErr] = useState(null);

  const counts = useMemo(() => countByCategory(products), [products]);

  // Categories products use that are not in the managed list yet.
  const unmanaged = useMemo(() => {
    const managed = new Set(productCategories.map((c) => (c.name || '').toLowerCase()));
    const used = new Set();
    products.forEach((p) => {
      const c = (p.category || '').trim();
      if (c && !managed.has(c.toLowerCase())) used.add(c);
    });
    return Array.from(used).sort();
  }, [products, productCategories]);

  // Every write goes through the hook it always did; this only reports.
  const attempt = async (fn, setErr) => {
    setBusy(true); setErr(null);
    try {
      const res = await fn();
      if (res?.error) { console.error('[settings] category write failed', res.error); setErr(res.error); return false; }
      return true;
    } catch (e) {
      console.error('[settings] category write threw', e);
      setErr(e);
      return false;
    } finally { setBusy(false); }
  };

  const renameExpense = (oldName, next) => {
    setEditExp(null);
    const name = String(next || '').trim();
    if (!name || name === oldName) return;
    // useFinance has never exported updateExpenseCategory, so today's pencil
    // threw. Say so rather than throw.
    if (typeof updateExpenseCategory !== 'function') {
      setExpErr(new Error('Renaming an expense category is not available yet. Add the new name and delete the old one.'));
      return;
    }
    attempt(() => updateExpenseCategory(oldName, name), setExpErr);
  };

  const renameProduct = (cat, next) => {
    setEditProd(null);
    if (next === cat.name || !String(next || '').trim()) return;
    attempt(() => updateProductCategory({ id: cat.id, name: next }), setProdErr);
  };

  const importAll = async () => {
    for (const name of unmanaged) {
      const ok = await attempt(() => addProductCategory(name), setProdErr);
      if (!ok) break;
    }
  };

  const doDelete = async () => {
    const c = confirm;
    const ok = await attempt(
      () => (c.kind === 'expense' ? deleteExpenseCategory(c.name) : deleteProductCategory(c.id)),
      setConfirmErr,
    );
    if (ok) setConfirm(null);
  };

  const expenseCount = confirm?.kind === 'expense' ? expensesInCategory(expenses, confirm.name) : 0;
  const productCount = confirm?.kind === 'product' ? (counts.get(String(confirm.name).toLowerCase()) || 0) : 0;
  const builtIn = confirm?.kind === 'expense' && !customCategories.includes(confirm.name);

  return (
    <div>
      <PanelHead title="Categories" sub="Expense and product categories." />
      <Stack>
        <SCard title="Expense categories" sub="Used when logging an expense.">
          <AddRow placeholder="New category" busy={busy} onAdd={(name) => attempt(() => addExpenseCategory(name), setExpErr)} />
          {expErr && <WriteFailure error={expErr} noun="category change" onReread={() => { setExpErr(null); finance.refetch?.(); }} className="mb-3" />}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {expenseCategories.map((cat) => (
              <Tile key={cat} name={cat} editing={editExp === cat}
                onStartEdit={() => setEditExp(cat)} onCancel={() => setEditExp(null)}
                onRename={(v) => renameExpense(cat, v)}
                onDelete={() => { setConfirmErr(null); setConfirm({ kind: 'expense', name: cat }); }} />
            ))}
          </div>
          <p className="mb-3.5 mt-2.5 text-[12.5px] text-mute">Click the pencil to rename in place; Enter or clicking away saves.</p>
        </SCard>

        <SCard title="Product categories" sub="Used on products, filters and reports.">
          <AddRow placeholder="New category" busy={busy} onAdd={(name) => attempt(() => addProductCategory(name), setProdErr)} />
          {prodErr && <WriteFailure error={prodErr} noun="category change" onReread={() => { setProdErr(null); inv.refetch?.(); }} className="mb-3" />}
          {unmanaged.length > 0 && (
            <Note tone="am" className="mb-3">
              <b>{plural(unmanaged.length, 'category is', 'categories are')} in use but not managed:</b>{' '}
              {unmanaged.map((c, i) => (
                <React.Fragment key={c}>
                  {i > 0 && ', '}
                  <button type="button" className="font-semibold underline-offset-4 hover:underline" title="Add to the managed list"
                    onClick={() => attempt(() => addProductCategory(c), setProdErr)}>{c}</button>
                </React.Fragment>
              ))}
              . Add them so they can be renamed or deleted.
              <TextLink className="ml-1.5" onClick={importAll} disabled={busy}>Import all</TextLink>
            </Note>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {productCategories.map((cat) => (
              <Tile key={cat.id} name={cat.name} count={counts.get(String(cat.name || '').toLowerCase()) || 0}
                editing={editProd === cat.id}
                onStartEdit={() => setEditProd(cat.id)} onCancel={() => setEditProd(null)}
                onRename={(v) => renameProduct(cat, v)}
                onDelete={() => { setConfirmErr(null); setConfirm({ kind: 'product', name: cat.name, id: cat.id }); }} />
            ))}
          </div>
          {productCategories.length === 0 && <p className="py-2 text-[13px] text-mute">No product categories yet. Add one above.</p>}
          <div className="h-3.5" />
        </SCard>
      </Stack>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} width={460}
        title={confirm ? `Delete ${confirm.name}?` : ''}
        subtitle={confirm?.kind === 'expense' ? 'Expense category' : 'Product category'}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="destructive" onClick={doDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete category'}</Button>
        </>}>
        {confirm?.kind === 'expense' ? (
          <p className="text-[14px] text-ink-2">
            It is taken off the category list. {expenseCount > 0
              ? `The ${plural(expenseCount, 'expense', 'expenses')} already logged under it keep their category name.`
              : 'No expense loaded on this device uses it.'}
            {builtIn && <span className="mt-2 block text-[12.5px] text-mute">This is a built-in category: it comes back on the list. Only categories you added can be removed.</span>}
          </p>
        ) : (
          <p className="text-[14px] text-ink-2">
            It is taken off the managed list. {productCount > 0
              ? `The ${plural(productCount, 'product', 'products')} in it keep their category name.`
              : 'No product uses it.'}
          </p>
        )}
        {confirmErr && <WriteFailure error={confirmErr} noun="delete" className={cn('mt-3')} />}
      </Dialog>
    </div>
  );
}
