import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Upload, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import { supabase } from '../lib/supabase';
import { todayISOInAppTZ } from '../lib/utils';
import { classifyWriteFailure } from '../lib/writeOutcome';
import {
  clientFacts, clientRows, filterClientRows, chipCounts, clientKpis, clientSummary, money,
} from '../lib/clientView';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { FilterPills } from '../components/ui/Tabs';
import { FigureStrip, Figure } from '../components/ui/FigureStrip';
import { ErrorBar, EmptyState } from '../components/payroll/parts';
import ClientList from '../components/clients/ClientList';
import ClientPanel from '../components/clients/ClientPanel';
import ClientForm from '../components/clients/ClientForm';
import CollectPaymentDialog from '../components/clients/CollectPaymentDialog';
import ReminderDialog from '../components/clients/ReminderDialog';
import DeleteClientDialog from '../components/clients/DeleteClientDialog';

/**
 * Clients (web redesign, approved mockups clients-01 … 09, 14, 16, 17).
 *
 * The list, its figures and its filters are today's rules (lib/clientView):
 * what a client owes is the database's outstanding balance, "Overdue 30+"
 * counts only the part on bills over 30 days old, bill by bill as the phone
 * (lib/overdue), and a balance of 0 or less reads Settled. Collecting a payment is
 * today's settle_client_payment call, unchanged.
 */
const FILTERS = [['OWING', 'Owing'], ['OVERDUE', 'Overdue'], ['ALL', 'All']];

export default function Clients() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { addNotification } = useNotifications();
  const { clients, loading, error: peopleError, refetch, addClient, updateClient, deleteClient, recordClientPayment } = usePeople(currentTenantId);
  const { sales } = useSales(currentTenantId, { lean: true });
  const cur = businessProfile?.currencySymbol || '₹';
  const today = todayISOInAppTZ();

  // Receipts, as today: the newest 500 for the shop.
  const [clientPayments, setClientPayments] = useState([]);
  const [paymentsError, setPaymentsError] = useState(null);
  const loadPayments = useCallback(async () => {
    if (!currentTenantId) return;
    const { data, error } = await supabase
      .from('client_payments')
      .select('*')
      .is('deleted_at', null)
      .eq('tenant_id', currentTenantId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) { console.error('clientPayments fetch error:', error); setPaymentsError(error); return; }
    setPaymentsError(null);
    if (data) setClientPayments(data);
  }, [currentTenantId]);
  useEffect(() => { loadPayments(); }, [loadPayments]);

  const can = {
    collect: !!hasPermission?.('clients', 'edit'),
    edit: !!hasPermission?.('clients', 'edit'),
    delete: !!hasPermission?.('clients', 'delete'),
    create: !!hasPermission?.('clients', 'create'),
  };

  const [filter, setFilter] = useState('OWING');
  const [query, setQuery] = useState('');
  const [panelId, setPanelId] = useState(null);
  const [collectId, setCollectId] = useState(null);
  const [remindId, setRemindId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  // { client: stored record | null } while the add / edit page is open.
  const [form, setForm] = useState(null);

  const facts = useMemo(() => clientFacts(clients, sales, clientPayments), [clients, sales, clientPayments]);
  const rows = useMemo(() => clientRows(clients, facts), [clients, facts]);
  const shown = useMemo(() => filterClientRows(rows, { filter, query }), [rows, filter, query]);
  const counts = useMemo(() => chipCounts(rows), [rows]);
  const kpis = useMemo(() => clientKpis(clients, facts, clientPayments, { monthStart: `${today.slice(0, 7)}-01` }), [clients, facts, clientPayments, today]);

  const rowOf = (id) => rows.find((r) => r.id === id) || null;
  // Edit takes the stored record, never a list row: a row carries the
  // screen's own _out / _facts keys, which are not columns.
  const recordOf = (id) => (clients || []).find((c) => c.id === id) || null;
  const panelRow = rowOf(panelId);
  const panelSummary = useMemo(() => (panelId ? clientSummary(sales, panelId, today) : null), [sales, panelId, today]);

  const closeForm = () => setForm(null);

  const doDelete = async (c) => {
    const res = await deleteClient(c.id);
    if (res && res.success === false) {
      const f = classifyWriteFailure(res.error, { noun: 'delete' });
      return f.maySaved ? `Couldn't confirm the delete — it may have gone through. Reload to check. (${f.detail})` : f.detail;
    }
    if (panelId === c.id) setPanelId(null);
    addNotification(`${c.name} was taken off the Clients list.`, 'success');
    return null;
  };

  const goAccount = (c) => navigate(`/clients/settle/${c.id}`);
  const goSale = () => navigate('/sales');

  if (form) {
    return (
      <ClientForm client={form.client} addClient={addClient} updateClient={updateClient} onCancel={closeForm}
        onReread={refetch}
        onSaved={(how, data) => {
          addNotification(how === 'added' ? `${data.name} was added.` : 'Changes saved.', 'success');
          closeForm();
        }} />
    );
  }

  const noClients = !loading && (clients || []).length === 0;
  const settledCount = counts.ALL - counts.OWING;

  return (
    <div className="flex flex-col pb-16">
      <FigureStrip cols={4} className="m-rise mb-5" style={{ '--i': 0 }}>
        <Figure label="Owed to you" value={money(kpis.receivable, cur)} sub={`${kpis.owingCount} of ${(clients || []).length} clients`} />
        <Figure label="Overdue 30+ days" value={<span className={kpis.overdue > 0 ? 'text-bad-text' : ''}>{money(kpis.overdue, cur)}</span>}
          sub={kpis.overdue > 0 ? `on bills over 30 days · ${kpis.overdueCount} client${kpis.overdueCount === 1 ? '' : 's'}` : 'nothing overdue'} />
        <Figure label="Collected this month" value={<span className={kpis.collected > 0 ? 'text-good-text' : ''}>{money(kpis.collected, cur)}</span>}
          sub={`${kpis.receipts} receipt${kpis.receipts === 1 ? '' : 's'}`} />
        <Figure label="Oldest unpaid" value={kpis.oldest != null ? <>{kpis.oldest} <span className="text-[14px] font-medium text-mute">days</span></> : '—'}
          sub={kpis.oldestName || 'nothing outstanding'} />
      </FigureStrip>

      {peopleError && <ErrorBar action="Reload" onAction={refetch}>The client list could not be loaded: {peopleError}</ErrorBar>}
      {paymentsError && <ErrorBar action="Reload" onAction={loadPayments}>Payments could not be loaded, so Collected this month and last activity may be short: {paymentsError.message}</ErrorBar>}

      {noClients ? (
        <EmptyState icon={Users} title="No clients yet" text="Add the people and shops you sell to on credit, or bring them in from a spreadsheet.">
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/bulk-add?type=clients')}><Upload /> Import</Button>
            {can.create && <Button onClick={() => setForm({ client: null })}><Plus /> Add client</Button>}
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 2 }}>
            <FilterPills ariaLabel="Show" value={filter} onChange={setFilter}
              items={FILTERS.map(([key, label]) => ({ key, label, count: counts[key] }))} />
            <label className="relative w-[300px] max-w-full">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, contact, phone, GSTIN" className="pl-9" aria-label="Search clients" />
            </label>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => navigate('/bulk-add?type=clients')}><Upload /> Import</Button>
            {can.create && <Button size="sm" onClick={() => setForm({ client: null })}><Plus /> Add client</Button>}
          </div>

          <ClientList rows={shown} loading={loading} query={query} filter={filter} selectedId={panelId} cur={cur} can={can}
            onClearSearch={() => setQuery('')}
            onOpen={(c) => setPanelId(c.id)}
            onCollect={(c) => setCollectId(c.id)}
            onAccount={goAccount}
            onRemind={(c) => setRemindId(c.id)}
            onNewSale={goSale}
            onEdit={(c) => setForm({ client: recordOf(c.id) })}
            onDelete={(c) => setDeleteId(c.id)} />

          <div className="m-rise mt-2.5 flex flex-wrap justify-between gap-2 px-1 text-[12.5px] text-mute" style={{ '--i': 4 }}>
            {filter === 'OWING' && <><span>{counts.OWING} client{counts.OWING === 1 ? '' : 's'} owe you · biggest first, then oldest</span>{settledCount > 0 && <span>{settledCount} settled client{settledCount === 1 ? '' : 's'} under All</span>}</>}
            {filter === 'OVERDUE' && <><span>{counts.OVERDUE} client{counts.OVERDUE === 1 ? '' : 's'} with bills over 30 days old · {money(kpis.overdue, cur)}</span><span>Only what is on those bills counts</span></>}
            {filter === 'ALL' && <span>{counts.ALL} clients · settled clients show New sale instead of Collect</span>}
          </div>
        </>
      )}

      <ClientPanel row={panelRow} summary={panelSummary} cur={cur} can={can}
        onClose={() => setPanelId(null)}
        onCollect={(c) => setCollectId(c.id)}
        onStatement={goAccount}
        onRemind={(c) => setRemindId(c.id)}
        onEdit={(c) => { setPanelId(null); setForm({ client: recordOf(c.id) }); }}
        onDelete={doDelete} />

      <CollectPaymentDialog client={collectId ? rowOf(collectId) : null} cur={cur} recordClientPayment={recordClientPayment}
        onClose={() => setCollectId(null)}
        onReread={async () => { await Promise.all([refetch(), loadPayments()]); }}
        onDone={({ amount, queued }) => {
          const c = rowOf(collectId);
          setCollectId(null);
          loadPayments();
          addNotification(queued
            ? `${money(amount, cur)} from ${c?.name || 'the client'} is saved on this computer and will reach the books when it syncs.`
            : `Recorded ${money(amount, cur)} from ${c?.name || 'the client'}.`, 'success');
        }} />

      <ReminderDialog client={remindId ? rowOf(remindId) : null} cur={cur}
        shopName={businessProfile?.businessName || businessProfile?.name || ''} upi={businessProfile?.upi_id || ''}
        onClose={() => setRemindId(null)} />

      <DeleteClientDialog client={deleteId ? rowOf(deleteId) : null} cur={cur} onDelete={doDelete} onClose={() => setDeleteId(null)} />
    </div>
  );
}
