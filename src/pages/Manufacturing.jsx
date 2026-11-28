import React, { useMemo, useState } from 'react';
import { ClipboardList, Layers, Plus } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useInventory } from '../hooks/useInventory';
import { useManufacturing } from '../hooks/useManufacturing';
import { useNotifications } from '../context/NotificationContext';
import { Button } from '../components/ui/button';
import { Tabs } from '../components/ui/Tabs';
import { EmptyCard, ErrorBar, Eyebrow, HoldConfirmDialog, money as moneyFmt } from '../components/suppliers/parts';
import { OrderCard, BomCard, LoadingBars } from '../components/manufacturing/Cards';
import NewBomDialog from '../components/manufacturing/NewBomDialog';
import NewBuildDialog from '../components/manufacturing/NewBuildDialog';
import { CompleteDialog, EditQtyDialog } from '../components/manufacturing/OrderDialogs';
import {
  mfgWords, orderCards, bomCards, completedText, ordersFoot, bomsFoot, qtyText,
} from '../lib/manufacturingView';
import { formatDate } from '../lib/utils';
import { classifyWriteFailure } from '../lib/writeOutcome';

/**
 * Manufacturing (web redesign, approved mockups manufacturing-01 … 10).
 *
 * Bills of materials (recipes for restaurants) and production orders. Every
 * write is the one the page made before: createBom, createProductionOrder,
 * setProducedQty, soft deletes, and complete_production_order, which moves
 * the stock and sets the cost on the server. Nothing here computes either.
 */
export default function Manufacturing() {
  const { currentTenantId, t, businessProfile } = useTenant();
  const words = mfgWords(t('recipe'), t('recipes'));
  const sym = businessProfile?.currencySymbol || '₹';
  const money = (v) => moneyFmt(v, sym);
  const { products = [] } = useInventory(currentTenantId);
  const { addNotification } = useNotifications();
  const mfg = useManufacturing(currentTenantId);
  const {
    boms, bomComponents, orders, orderMaterials, orderCosts, loading, error, refetch,
    createBom, deleteBom, createProductionOrder, completeOrder, deleteOrder, setProducedQty,
  } = mfg;

  const [tab, setTab] = useState('PRODUCTION');
  const [dlg, setDlg] = useState(null); // { kind, id }
  const close = () => setDlg(null);

  const oCards = useMemo(() => orderCards({ orders, orderMaterials, orderCosts, products, money }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, orderMaterials, orderCosts, products, sym]);
  const bCards = useMemo(() => bomCards({ boms, bomComponents, products }), [boms, bomComponents, products]);
  const orderCard = dlg && oCards.find((c) => c.id === dlg.id);
  const bomCard = dlg && bCards.find((c) => c.id === dlg.id);

  const newOne = () => setDlg({ kind: tab === 'RECIPES' ? 'bom' : 'build' });
  const newLabel = tab === 'RECIPES' ? `New ${words.lower}` : 'New build';

  // Delete: the server's answer, or "may have" with a re-read.
  const removeWith = (fn, noun) => async () => {
    const r = await fn(dlg.id);
    if (r?.success) { addNotification(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} deleted`, 'success'); return undefined; }
    console.error(`[manufacturing] delete ${noun} failed:`, r?.error);
    const f = classifyWriteFailure(r?.error, { noun: 'delete' });
    if (f.maySaved) { await refetch(); return { tone: 'warn', message: `${f.title}. ${f.detail} It may have gone through; the list has been read again.` }; }
    return `${f.title}. ${f.detail}`;
  };

  return (
    <div className="flex flex-col pb-16">
      <div className="m-rise mb-3.5 flex flex-wrap items-center gap-3" style={{ '--i': 0 }}>
        <div className="min-w-0">
          <Eyebrow>{words.one} · production · costing</Eyebrow>
          <div className="mt-0.5 text-[13px] text-body">Make a product from your own stock and get its real unit cost</div>
        </div>
        <div className="flex-1" />
        <Button onClick={newOne}><Plus /> {newLabel}</Button>
      </div>

      <Tabs className="m-rise mb-[18px]" ariaLabel="Manufacturing" value={tab} onChange={setTab}
        items={[
          { key: 'PRODUCTION', label: 'Production orders', count: loading ? undefined : orders.length },
          { key: 'RECIPES', label: words.many, count: loading ? undefined : boms.length },
        ]} />

      {error && !loading && (
        <ErrorBar className="mb-3" action="Try again" onAction={refetch}>
          Couldn't load manufacturing. {error.message || String(error)}
        </ErrorBar>
      )}

      {loading && <LoadingBars />}

      {!loading && tab === 'PRODUCTION' && (
        <div className="m-rise" style={{ '--i': 2 }}>
          {oCards.length === 0 && !error && (
            <EmptyCard icon={ClipboardList} title="No production orders yet" text="Create a build to make a product from your materials.">
              <Button onClick={() => setDlg({ kind: 'build' })}>New build</Button>
            </EmptyCard>
          )}
          {oCards.map((c) => (
            <OrderCard key={c.id} card={c} money={money}
              onEditQty={() => setDlg({ kind: 'qty', id: c.id })}
              onComplete={() => setDlg({ kind: 'complete', id: c.id })}
              onDelete={() => setDlg({ kind: 'delOrder', id: c.id })} />
          ))}
          {oCards.length > 0 && <div className="px-0.5 pt-2 text-[12px] text-mute">{ordersFoot(oCards.length)}</div>}
        </div>
      )}

      {!loading && tab === 'RECIPES' && (
        <div className="m-rise" style={{ '--i': 2 }}>
          {bCards.length === 0 && !error && (
            <EmptyCard icon={Layers} title={`No ${words.lowerMany} yet`} text={`A ${words.lower} lists the raw materials for one product.`}>
              <Button onClick={() => setDlg({ kind: 'bom' })}>New {words.lower}</Button>
            </EmptyCard>
          )}
          {bCards.map((c) => (
            <BomCard key={c.id} card={c} deleteLabel={`Delete ${words.lower} ${c.name}`}
              onDelete={() => setDlg({ kind: 'delBom', id: c.id })} />
          ))}
          {bCards.length > 0 && <div className="px-0.5 pt-2 text-[12px] text-mute">{bomsFoot(bCards.length, words)}</div>}
        </div>
      )}

      <NewBomDialog open={dlg?.kind === 'bom'} onClose={close} products={products} words={words}
        createBom={createBom} onReread={refetch}
        onSaved={() => addNotification(`${words.one} saved`, 'success')} />

      <NewBuildDialog open={dlg?.kind === 'build'} onClose={close} products={products} boms={boms} bomComponents={bomComponents}
        words={words} money={money} createProductionOrder={createProductionOrder} onReread={refetch}
        onSaved={() => addNotification('Build created (draft)', 'success')} />

      <CompleteDialog open={dlg?.kind === 'complete' && !!orderCard} onClose={close} card={orderCard}
        data={{ orderMaterials, orderCosts, products }} money={money}
        setProducedQty={setProducedQty} completeOrder={completeOrder} onReread={refetch}
        onEditQty={() => setDlg({ kind: 'qty', id: dlg.id })}
        onDone={(r, actual) => addNotification(completedText({ unitCost: r.unit_cost, planned: orderCard?.order?.qty_produced, actual, money }), 'success')} />

      <EditQtyDialog open={dlg?.kind === 'qty' && !!orderCard} onClose={close} card={orderCard}
        setProducedQty={setProducedQty} onReread={refetch}
        onSaved={() => addNotification('Quantity saved', 'success')} />

      <HoldConfirmDialog open={dlg?.kind === 'delOrder' && !!orderCard} onClose={close}
        title="Delete this draft build?"
        text={orderCard ? `${orderCard.name} · ${qtyText(orderCard.order.qty_produced)} planned · ${formatDate(orderCard.order.production_date || orderCard.order.created_at)}` : ''}
        holdLabel="Delete build" onConfirm={removeWith(deleteOrder, 'build')}>
        <p className="text-[14px] text-ink-2">Nothing has been taken out of stock yet, so no stock changes.</p>
      </HoldConfirmDialog>

      <HoldConfirmDialog open={dlg?.kind === 'delBom' && !!bomCard} onClose={close}
        title={`Delete this ${words.lower}?`}
        text={bomCard ? `${bomCard.name} · ${bomCard.sub}` : ''}
        holdLabel={`Delete ${words.lower}`} onConfirm={removeWith(deleteBom, words.lower)}>
        <p className="text-[14px] text-ink-2">Production orders already made from it are not changed.</p>
      </HoldConfirmDialog>
    </div>
  );
}
