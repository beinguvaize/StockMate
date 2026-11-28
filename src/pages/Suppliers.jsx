import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { usePeople } from '../hooks/usePeople';
import { usePurchases } from '../hooks/usePurchases';
import { todayISOInAppTZ } from '../lib/utils';
import { classifyWriteFailure } from '../lib/writeOutcome';
import { decoratedSupplierBills, supplierRows, supplierKpis } from '../lib/supplierView';
import SupplierWorkspace from '../components/suppliers/SupplierWorkspace';
import SupplierPanel from '../components/suppliers/SupplierPanel';
import SupplierForm from '../components/suppliers/SupplierForm';
import PaySupplierDialog from '../components/suppliers/PaySupplierDialog';
import { HoldConfirmDialog, WarnBox, money, rupees } from '../components/suppliers/parts';

/**
 * Suppliers (web redesign, approved mockups suppliers-01 … 04, 06, 11 … 13).
 *
 * The list, the supplier panel, Add / Edit / Delete supplier and Pay. Money
 * writes are the existing server functions only: Pay calls usePurchases'
 * paySupplier (settle_supplier_payment), the same call the ledger page makes.
 */
export default function Suppliers() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { addNotification } = useNotifications();
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, loading: peopleLoading } = usePeople(currentTenantId);
  const { purchases, purchaseReturns = [], supplierPayments = [], paySupplier, refetch, loading: purLoading } = usePurchases(currentTenantId);
  const cur = businessProfile?.currencySymbol || '₹';
  const today = todayISOInAppTZ();

  // The ledger checks purchases/edit before it offers a payment; the list and
  // panel now do the same. Edit and delete keep their suppliers permissions.
  const canPay = hasPermission?.('purchases', 'edit') !== false;
  const canEdit = !!hasPermission?.('suppliers', 'edit');
  const canDelete = !!hasPermission?.('suppliers', 'delete');

  const decorated = useMemo(() => decoratedSupplierBills({ suppliers, purchases, payments: supplierPayments, today }),
    [suppliers, purchases, supplierPayments, today]);
  const rows = useMemo(() => supplierRows({ suppliers, purchases, supplierPayments, purchaseReturns, decorated }),
    [suppliers, purchases, supplierPayments, purchaseReturns, decorated]);
  const kpis = useMemo(() => supplierKpis({ rows, suppliers, purchases, supplierPayments }),
    [rows, suppliers, purchases, supplierPayments]);

  const [panelId, setPanelId] = useState(null);
  const [form, setForm] = useState(null);          // { supplier|null }
  const [deleting, setDeleting] = useState(null);  // row
  const [paying, setPaying] = useState(null);      // row
  const panelRow = rows.find((r) => r.id === panelId) || null;

  const ledger = (r) => navigate(`/suppliers/ledger/${r.id}`);
  // "New bill" opens the Purchases page, as it did before.
  const newBill = () => navigate('/purchases');

  return (
    <>
      <SupplierWorkspace rows={rows} kpis={kpis} decorated={decorated} cur={cur}
        loading={peopleLoading || purLoading}
        canPay={canPay} canEdit={canEdit} canDelete={canDelete}
        onOpen={(r) => setPanelId(r.id)}
        onPay={(r) => setPaying(r)}
        onLedger={ledger}
        onNewBill={newBill}
        onEdit={(r) => setForm({ supplier: r })}
        onDelete={(r) => setDeleting(r)}
        onAdd={() => setForm({ supplier: null })}
        onBulkImport={() => navigate('/bulk-add?type=suppliers')} />

      <SupplierPanel row={panelRow} cur={cur} onClose={() => setPanelId(null)}
        canPay={canPay} canEdit={canEdit} canDelete={canDelete}
        onPay={() => setPaying(panelRow)}
        onLedger={() => ledger(panelRow)}
        onNewBill={newBill}
        onEdit={() => { setPanelId(null); setForm({ supplier: panelRow }); }}
        onDelete={() => { setPanelId(null); setDeleting(panelRow); }} />

      <SupplierForm open={!!form} supplier={form?.supplier || null} billCount={form?.supplier?._f?.billCount}
        onClose={() => setForm(null)} addSupplier={addSupplier} updateSupplier={updateSupplier}
        onSaved={(how, fields, res) => addNotification(
          res?.queued ? `${fields.name} saved on this computer; it will sync when you are online.`
            : how === 'added' ? `${fields.name} added.` : 'Changes saved.', 'success')} />

      <PaySupplierDialog open={!!paying} onClose={() => setPaying(null)}
        supplierId={paying?.id} supplierName={paying?.name}
        owed={paying ? { label: 'You owe', amount: paying._payable } : null}
        cur={cur} paySupplier={paySupplier} onRecheck={refetch}
        onPaid={({ amount, queued }) => addNotification(queued
          ? `Payment of ${rupees(amount, cur)} to ${paying?.name} saved on this computer; it will sync when you are online.`
          : `Paid ${rupees(amount, cur)} to ${paying?.name}.`, 'success')} />

      <HoldConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} outline
        title={deleting ? `Delete ${deleting.name}?` : ''}
        text="Purchase history is kept; the supplier record is removed."
        holdLabel="Hold to delete supplier"
        onConfirm={async () => {
          let res;
          try { res = await deleteSupplier(deleting.id); } catch (e) { res = { success: false, error: e }; }
          if (res?.success) {
            if (panelId === deleting.id) setPanelId(null);
            addNotification(res.queued ? `${deleting.name} removed on this computer; it will sync when you are online.` : `${deleting.name} was removed.`, 'success');
            return null;
          }
          console.error('[suppliers] delete failed:', res?.error);
          const f = classifyWriteFailure(res?.error || 'The server gave no reason.', { noun: 'delete' });
          return f.maySaved
            ? { tone: 'warn', message: `${f.title}. It may have gone through: reload the list to check. (${f.detail})` }
            : { tone: 'bad', message: `Not deleted: ${f.detail}` };
        }}>
        {deleting && deleting._payable > 0.01 && (
          <WarnBox>
            You still owe them {money(deleting._payable, cur)}
            {deleting._due?.unpaidCount ? ` on ${deleting._due.unpaidCount} ${deleting._due.unpaidCount === 1 ? 'bill' : 'bills'}` : ''}.
            {' '}{deleting._due?.unpaidCount === 1 ? 'That bill stays' : 'Those bills stay'} in Purchases, but this list will no longer show {deleting._due?.unpaidCount === 1 ? 'it' : 'them'}.
          </WarnBox>
        )}
      </HoldConfirmDialog>
    </>
  );
}
