import React, { useEffect, useState } from 'react';
import { Phone, Mail, MapPin, User, FileText, StickyNote, Pencil } from 'lucide-react';
import SidePanel from '../ui/SidePanel';
import { Button } from '../ui/button';
import { Tabs } from '../ui/Tabs';
import { fmtDate } from '../../pages/purchases/lib/register';
import { billPill } from '../../lib/supplierView';
import { BillPill, Pill, Eyebrow, money, rupees } from './parts';

/**
 * The supplier panel (mockups 03 and 04): slides in from the right when a row
 * is opened. Every figure is the list's own (lib/supplierView supplierRows):
 * "You owe" is the list's figure, the Bills tab lists purchase rows (the
 * latest 30) and Payments the supplier's payment rows (the latest 25), as the
 * old right-hand column did. The status pills are the Purchases register's.
 */
const short = (id) => `#${String(id || '').slice(-6).toUpperCase()}`;

export default function SupplierPanel({
  row, onClose, cur = '₹', canPay, canEdit, canDelete,
  onPay, onLedger, onNewBill, onEdit, onDelete,
}) {
  const [tab, setTab] = useState('BILLS');
  useEffect(() => { setTab('BILLS'); }, [row?.id]);
  if (!row) return <SidePanel open={false} onClose={onClose} />;

  const f = row._f || {};
  const owing = row._payable > 0.01;
  // The bill each purchase row belongs to, for its pill and its bill number.
  const billOfLine = new Map();
  (f.decorated || []).forEach((b) => b.lines.forEach((l) => billOfLine.set(l.id, b)));
  const credit = Number(row.credit_days) > 0 ? Number(row.credit_days) : 0;

  const contact = [row.contact_person, row.phone].filter(Boolean).join(' · ');
  const header = (
    <span className="flex flex-wrap items-center gap-1.5 normal-case tracking-normal">
      {row._due?.pill && <BillPill pill={row._due.pill} />}
      {!row._due?.pill && !owing && <Pill tone="good">Settled</Pill>}
      {credit > 0 && <Pill>Credit {credit} days</Pill>}
    </span>
  );

  return (
    <SidePanel open={!!row} onClose={onClose} eyebrow={header} title={row.name}
      subtitle={<>{contact || 'No contact on file'}{' · '}
        <button type="button" onClick={onLedger} className="font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4">Open ledger</button></>}
      footer={(
        <div className="flex gap-2">
          {owing && canPay ? (
            <Button className="flex-1 justify-between px-[18px]" onClick={onPay}>
              <span>Record payment</span><span className="tabular-nums">{rupees(row._payable, cur)}</span>
            </Button>
          ) : (
            <Button className="flex-1" onClick={onLedger}>Open ledger</Button>
          )}
          <Button variant="secondary" className="shrink-0 px-[18px]" onClick={onNewBill}>New bill</Button>
        </div>
      )}>
      <div className="mb-3.5 rounded-[14px] bg-tile px-4 py-3.5">
        <Eyebrow>You owe</Eyebrow>
        <b className="mt-1.5 mb-1 block font-tight text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] tabular-nums">{money(row._payable, cur)}</b>
        <small className="block text-[12.5px] text-body">
          Across {f.billCount || 0} bills
          {f.oldestUnpaid && ` · oldest ${fmtDate(f.oldestUnpaid, { year: false })}`}
          {credit > 0 && ` · Credit ${credit} days`}
        </small>
        {row._advance > 0.01 && (
          <small className="mt-1 block text-[12.5px] font-semibold text-good-text">{money(row._advance, cur)} already paid in advance, netted off above</small>
        )}
      </div>

      <Tabs className="mb-1" ariaLabel="Supplier" value={tab} onChange={setTab}
        items={[
          { key: 'BILLS', label: 'Bills', count: f.billCount || 0 },
          { key: 'PAYMENTS', label: 'Payments', count: (f.payments || []).length },
          { key: 'DETAILS', label: 'Details' },
        ]} />

      {tab === 'BILLS' && (
        f.bills?.length ? (
          <>
            {f.bills.slice(0, 30).map((b) => {
              const bill = billOfLine.get(b.id);
              const pill = bill ? billPill(bill) : null;
              const items = bill?.lines?.length || 1;
              const sub = [fmtDate(b.date, { year: false }), items > 1 ? `${items} items` : null,
                bill?.state === 'over' ? `was due ${fmtDate(bill.dueOn, { year: false })}` : null].filter(Boolean).join(' · ');
              return (
                <div key={b.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-t border-sep py-2.5 first:border-t-0">
                  <div className="min-w-0">
                    <b className="block truncate font-tight text-[13.5px] font-semibold">{b.bill_no || short(b.id)}</b>
                    <small className="block text-[12px] text-mute">{sub}</small>
                  </div>
                  <div className="text-right">
                    <span className="block font-tight text-[13.5px] font-semibold tabular-nums">{money(b._due > 0.01 ? b._due : b._total, cur)}</span>
                    {pill ? <BillPill pill={pill} className="mt-0.5" />
                      : <Pill tone={b._due <= 0.01 ? 'good' : 'bad'} className="mt-0.5">{b._due <= 0.01 ? 'Paid' : 'Unpaid'}</Pill>}
                  </div>
                </div>
              );
            })}
            <p className="mt-2.5 text-[12px] text-mute">Latest 30 purchase lines here; every bill is in the ledger.</p>
          </>
        ) : <p className="py-6 text-center text-[13px] text-body">No bills recorded.</p>
      )}

      {tab === 'PAYMENTS' && (
        f.payments?.length ? f.payments.slice(0, 25).map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 border-t border-sep py-2.5 first:border-t-0">
            <div className="min-w-0">
              <b className="block font-tight text-[13.5px] font-semibold tabular-nums">{fmtDate(String(p.date ?? p.created_at).slice(0, 10))}</b>
              <small className="block truncate text-[12px] text-mute">{p.method || p.payment_method || 'CASH'}{p.reference_no ? ` · ref ${p.reference_no}` : ''}</small>
            </div>
            <span className="shrink-0 font-tight text-[13.5px] font-semibold tabular-nums text-good-text">{money(p.amount, cur)}</span>
          </div>
        )) : <p className="py-6 text-center text-[13px] text-body">No payments recorded.</p>
      )}

      {tab === 'DETAILS' && (
        <div className="pt-1">
          {[[User, row.contact_person], [Phone, row.phone], [Mail, row.email], [MapPin, row.address],
            [FileText, row.gstin ? `GSTIN ${row.gstin}` : null], [StickyNote, row.notes]]
            .filter(([, v]) => v).map(([Icon, v], i) => (
              <div key={i} className="grid grid-cols-[18px_1fr] items-start gap-[9px] py-[5px] text-[13px] text-ink-2">
                <Icon size={15} strokeWidth={1.8} className="mt-0.5 text-mute" />
                <span className="break-words tabular-nums">{v}</span>
              </div>
            ))}
          <div className="mt-3.5">
            <div className="flex justify-between border-b border-sep py-2 text-[13.5px]"><span className="text-body">Bills</span><span className="font-tight font-semibold tabular-nums">{f.billCount || 0}</span></div>
            <div className="flex justify-between py-2 text-[13.5px]"><span className="text-body">Purchased, all time</span><span className="font-tight font-semibold tabular-nums">{money(f.purchased || 0, cur)}</span></div>
          </div>
          {(canEdit || canDelete) && (
            <div className="mt-3 flex items-center gap-2">
              {canEdit && <Button variant="secondary" size="sm" onClick={onEdit}><Pencil /> Edit details</Button>}
              {canDelete && (
                <Button variant="outline" size="sm" onClick={onDelete} className="text-bad-text shadow-[inset_0_0_0_1.5px_#F5C2C2] hover:bg-bad-soft">Delete supplier</Button>
              )}
            </div>
          )}
        </div>
      )}
    </SidePanel>
  );
}
