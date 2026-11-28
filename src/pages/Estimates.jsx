import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Search, ChevronDown, ArrowRightLeft, Share2, Send, CheckCircle2, Pencil, Eye, Printer, XCircle, Trash2, Check, FilePen,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { useEstimates } from '../hooks/useEstimates';
import { usePeople } from '../hooks/usePeople';
import { useInventory } from '../hooks/useInventory';
import { shareToWhatsApp } from '../lib/gstEngine';
import { todayISOInAppTZ } from '../lib/utils';
import {
  DOC_TYPES, STATUSES, docTypeLabel, estimateActions, estimateFigures, typeCounts, statusCounts,
  filterEstimates, estimateDay, shortDay, validity, estimateHandoff,
} from '../lib/estimateView';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { FilterPills } from '../components/ui/Tabs';
import { FigureStrip, Figure } from '../components/ui/FigureStrip';
import { RowMenu, MenuItem, MenuRule } from '../components/ui/RowMenu';
import { PageSkeleton } from '../components/ui/States';
import InvoiceTemplate from '../components/invoice/InvoiceTemplate';
import EstimatePanel from '../components/estimates/EstimatePanel';
import EstimateEditor from '../components/estimates/EstimateEditor';
import QuotationSheet from '../components/estimates/QuotationSheet';
import { ShareDialog, ConvertDialog, DeleteEstimateDialog } from '../components/estimates/EstimateDialogs';
import { rupees, EstimateStatusPill, failWords } from '../components/estimates/parts';

/**
 * Estimates (approved mockups estimates-01 to 11): quotations, proformas,
 * delivery challans and manual bills, all stored in `estimates` by the New
 * document page. The list, panel, share, convert, print, status and delete
 * live here; the rules and figures are in lib/estimateView.
 *
 * Converting hands the items to the till and does NOT mark the estimate:
 * the Sales page marks it Billed once the sale is saved (lib/convertHandoff).
 */
const Estimates = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { addNotification } = useNotifications();
  const { estimates, loading, refetch, create, update, setStatus, remove } = useEstimates(currentTenantId);
  const { clients } = usePeople(currentTenantId);
  const { products } = useInventory(currentTenantId);
  const today = todayISOInAppTZ();
  const shopName = businessProfile?.name || '';

  const [type, setType] = useState('ALL');
  const [status, setStatusFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [shareEst, setShareEst] = useState(null);
  const [convertEst, setConvertEst] = useState(null);
  const [deleteEst, setDeleteEst] = useState(null);
  const [printEst, setPrintEst] = useState(null);

  const figures = useMemo(() => estimateFigures(estimates), [estimates]);
  const tCounts = useMemo(() => typeCounts(estimates), [estimates]);
  const ofType = useMemo(() => filterEstimates(estimates, { type }), [estimates, type]);
  const sCounts = useMemo(() => statusCounts(ofType), [ofType]);
  const rows = useMemo(() => filterEstimates(estimates, { type, status, query }), [estimates, type, status, query]);
  const openEst = openId ? estimates.find((e) => e.id === openId) || null : null;

  const newEstimate = () => navigate('/documents/new?type=QUOTATION', { state: { from: 'Estimates' } });

  const changeStatus = async (e, next) => {
    let res;
    try { res = await setStatus(e.id, next); } catch (err) { res = { error: err }; }
    if (res?.error) {
      console.error('[estimates] status change failed', res.error);
      addNotification(failWords(res.error, 'status'), 'error', 9000);
      return;
    }
    const label = STATUSES.find((s) => s.key === next)?.label || next;
    addNotification(`${e.estimate_number} marked ${label.toLowerCase()}`, 'success');
  };

  // Hand the items (and the client) to the till. Marking Billed happens
  // there, after the sale is saved.
  const toNewSale = (e) => {
    try { sessionStorage.setItem('estimate_cart', JSON.stringify(estimateHandoff(e))); } catch (_) { /* storage unavailable */ }
    setConvertEst(null);
    navigate(`/${tenantSlug}/sales`);
  };

  const saveEdit = async (id, payload) => (id ? update(id, payload) : create(payload));

  if (loading && !estimates.length) return <PageSkeleton cards={4} rows={8} />;

  if (editing) {
    return (
      <EstimateEditor key={editing.id} estimate={editing} tenantId={currentTenantId} clients={clients || []} products={products || []}
        businessProfile={businessProfile} onSave={saveEdit} onClose={() => setEditing(null)} onReread={refetch} />
    );
  }

  const statusLabel = status === 'ALL' ? 'All' : STATUSES.find((s) => s.key === status)?.label;

  const menuFor = (e) => {
    const a = estimateActions(e);
    return (
      <RowMenu label={`Actions for ${e.estimate_number || 'estimate'}`} width={250}>
        {(close) => (
          <>
            {a.convert && <MenuItem primary icon={ArrowRightLeft} onClick={() => { close(); setConvertEst(e); }}>Convert to sale</MenuItem>}
            <MenuItem icon={Share2} onClick={() => { close(); setShareEst(e); }}>Share on WhatsApp</MenuItem>
            {a.markSent && <MenuItem icon={Send} onClick={() => { close(); changeStatus(e, 'SENT'); }}>Mark sent</MenuItem>}
            {a.markAccepted && <MenuItem icon={CheckCircle2} onClick={() => { close(); changeStatus(e, 'ACCEPTED'); }}>Mark accepted</MenuItem>}
            {a.edit && <MenuItem icon={Pencil} onClick={() => { close(); setEditing(e); }}>Edit</MenuItem>}
            <MenuRule />
            <MenuItem icon={Eye} onClick={() => { close(); setOpenId(e.id); }}>Open</MenuItem>
            <MenuItem icon={Printer} onClick={() => { close(); setPrintEst(e); }}>Print</MenuItem>
            {a.markRejected && <MenuItem icon={XCircle} onClick={() => { close(); changeStatus(e, 'REJECTED'); }}>Mark rejected</MenuItem>}
            <MenuRule />
            <MenuItem danger icon={Trash2} onClick={() => { close(); setDeleteEst(e); }}>Delete</MenuItem>
          </>
        )}
      </RowMenu>
    );
  };

  return (
    <div className="flex flex-col pb-16">
      {estimates.length === 0 ? (
        <div className="m-rise mt-2 rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <span className="mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-tile text-ink-2"><FilePen size={24} strokeWidth={1.7} /></span>
          <h3 className="font-tight text-[17px] font-semibold">No estimates yet</h3>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13.5px] text-body">Quotations, proformas, delivery challans and manual bills you make show here. Send one, then turn it into a sale when the client says yes.</p>
          <Button className="mt-4" onClick={newEstimate}><Plus /> New estimate</Button>
        </div>
      ) : (
        <>
          <FigureStrip cols={4} className="m-rise mb-5" style={{ '--i': 1 }}>
            <Figure label="Waiting for an answer" value={rupees(figures.sent.amt)}
              sub={figures.sent.n ? `${figures.sent.n} sent, not answered` : 'none sent'} />
            <Figure label="Drafts" value={rupees(figures.draft.amt)}
              sub={figures.draft.n ? `${figures.draft.n} not sent yet` : 'no drafts'} />
            <Figure label="Accepted" value={<span className="text-good-text">{rupees(figures.accepted.amt)}</span>}
              sub={figures.accepted.n
                ? `${figures.accepted.n} to bill${figures.accepted.manual ? ` · ${figures.accepted.manual} ${figures.accepted.manual === 1 ? 'is a manual bill' : 'are manual bills'}` : ''}`
                : 'none waiting'} />
            <Figure label="Billed" value={rupees(figures.billed.amt)}
              sub={figures.billed.n ? `${figures.billed.n} turned into a sale` : 'none yet'} />
          </FigureStrip>

          <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 2 }}>
            <FilterPills ariaLabel="Document type" value={type} onChange={setType}
              items={[{ key: 'ALL', label: 'All', count: tCounts.ALL }, ...DOC_TYPES.map((t) => ({ key: t.key, label: t.label, count: tCounts[t.key] }))]} />
            <div className="flex-1" />
            <Button size="sm" onClick={newEstimate}><Plus /> New estimate</Button>
          </div>

          <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 3 }}>
            <div className="relative w-full sm:w-[280px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
              <input type="text" aria-label="Search client or number" placeholder="Search client or number" value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                className="h-9 w-full rounded-pill bg-well pl-10 pr-4 text-[13px] text-ink outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
            </div>
            <RowMenu label="Status" width={230}
              trigger={({ ref, onClick, open }) => (
                <button ref={ref} type="button" onClick={onClick} aria-haspopup="menu" aria-expanded={open}
                  className="m-press inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
                  <em className="not-italic font-medium text-mute">Status</em> {statusLabel} <ChevronDown size={14} className="text-mute" />
                </button>
              )}>
              {(close) => (
                <>
                  {[{ key: 'ALL', label: 'All statuses', dot: 'var(--color-ink)' }, ...STATUSES].map((s) => {
                    const on = status === s.key;
                    return (
                      <button key={s.key} type="button" role="menuitemradio" aria-checked={on}
                        onClick={() => { close(); setStatusFilter(s.key); }}
                        className={`flex w-full items-center gap-2.5 rounded-pill px-2.5 py-2 text-left font-tight text-[13.5px] hover:bg-tile ${on ? 'bg-tile font-semibold text-ink' : 'font-medium text-ink-2'}`}>
                        <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.dot }} aria-hidden="true" />
                        {s.label}
                        <small className="ml-auto font-sans text-[12px] font-medium text-mute tabular-nums">{sCounts[s.key] ?? 0}</small>
                        {on && <Check size={14} className="text-ink" />}
                      </button>
                    );
                  })}
                </>
              )}
            </RowMenu>
            <div className="flex-1" />
            <span className="text-[12.5px] text-mute">Newest first</span>
          </div>

          <div className="m-rise min-w-0" style={{ '--i': 4 }}>
            <Table>
              <TableHeader>
                <tr>
                  <TableHead className="w-[170px]">Number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden w-[150px] md:table-cell">Type</TableHead>
                  <TableHead numeric className="w-[130px]">Total</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-11"><span className="sr-only">Actions</span></TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {rows.map((e) => {
                  const v = validity(e, today);
                  return (
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => setOpenId(e.id)}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-tight text-[13.5px] font-semibold tabular-nums">{e.estimate_number}</span>
                        <small className="block text-[12px] text-mute">{shortDay(estimateDay(e))}</small>
                      </TableCell>
                      <TableCell>
                        <span className="block font-tight text-[13.5px] font-semibold">{e.client_name || '—'}</span>
                        {v && <span className={`block text-[12px] ${v.late ? 'text-bad-text' : 'text-mute'}`}>Valid until {v.date}</span>}
                      </TableCell>
                      <TableCell className="hidden text-[12.5px] text-body md:table-cell">{docTypeLabel(e)}</TableCell>
                      <TableCell numeric className="whitespace-nowrap">{rupees(e.grand_total)}</TableCell>
                      <TableCell><EstimateStatusPill estimate={e} /></TableCell>
                      <TableCell numeric onClick={(ev) => ev.stopPropagation()}>{menuFor(e)}</TableCell>
                    </TableRow>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="px-4 pt-12 pb-14 text-center text-[13px] text-body">
                      <b className="mb-1 block font-tight text-[15px] font-semibold text-ink">No estimates match</b>
                      Change the type, status or search.
                    </td>
                  </tr>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="px-1 pt-3.5 text-[13px] text-body">{rows.length} of {estimates.length} shown · newest first</div>
        </>
      )}

      <EstimatePanel estimate={openEst} today={today} onClose={() => setOpenId(null)}
        onSetStatus={changeStatus}
        onShare={(e) => setShareEst(e)}
        onPrint={(e) => setPrintEst(e)}
        onEdit={(e) => { setOpenId(null); setEditing(e); }}
        onConvert={(e) => setConvertEst(e)} />

      {shareEst && (
        <ShareDialog key={shareEst.id} estimate={shareEst} shopName={shopName} notify={addNotification}
          onMarkSent={(e) => changeStatus(e, 'SENT')} onClose={() => setShareEst(null)} />
      )}
      {convertEst && <ConvertDialog estimate={convertEst} onNewSale={toNewSale} onClose={() => setConvertEst(null)} />}
      {deleteEst && (
        <DeleteEstimateDialog key={deleteEst.id} estimate={deleteEst} onReread={refetch}
          onDelete={async (e) => { const res = await remove(e.id); if (!res?.error) { if (openId === e.id) setOpenId(null); addNotification(`${e.estimate_number} deleted`, 'success'); } return res; }}
          onClose={() => setDeleteEst(null)} />
      )}

      {printEst && printEst.doc_type !== 'MANUAL_INVOICE' && (
        <QuotationSheet estimate={printEst} businessProfile={businessProfile} onClose={() => setPrintEst(null)} />
      )}
      {printEst && printEst.doc_type === 'MANUAL_INVOICE' && (() => {
        // A manual bill prints on the invoice template, as the New document page prints it.
        const bill = {
          invoice_number: printEst.estimate_number, invoice_date: estimateDay(printEst), client_name: printEst.client_name,
          client_gstin: printEst.client_gstin || null, place_of_supply: printEst.place_of_supply || '',
          items: printEst.items || [], taxable_amount: printEst.taxable_amount, tax_total: printEst.tax_total,
          cgst_amount: printEst.cgst_amount, sgst_amount: printEst.sgst_amount, igst_amount: printEst.igst_amount,
          round_off: printEst.round_off, grand_total: printEst.grand_total, is_interstate: printEst.is_interstate,
          notes: printEst.notes || null, payment_status: 'PAID',
        };
        const cl = { name: bill.client_name, gst_no: bill.client_gstin, state: bill.place_of_supply };
        return (
          <InvoiceTemplate invoice={bill} businessProfile={businessProfile} client={cl}
            onPrint={() => window.print()} onShare={() => shareToWhatsApp(bill, cl, businessProfile)} onClose={() => setPrintEst(null)} />
        );
      })()}
    </div>
  );
};

export default Estimates;
