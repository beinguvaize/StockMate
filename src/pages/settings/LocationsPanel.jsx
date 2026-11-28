import React, { useState } from 'react';
import { MapPin, Pencil, Trash2, Plus } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { useInventory } from '../../hooks/useInventory';
import { PLANS } from '../../lib/tenancy';
import { Button } from '../../components/ui/button';
import Dialog from '../../components/ui/Dialog';
import WriteFailure from '../../components/invoices/WriteFailure';
import { PanelHead, Stack, SCard, Note, Pill, IconBtn, TextLink, fieldCls } from './parts';
import UpgradeDialog from './UpgradeDialog';

/**
 * Locations (approved settings-07, 08 and 17): branches that hold stock.
 * Pro plan or higher, by the shop's plan as before. Same hook calls; a delete
 * asks in a dialog, and a refused write shows the server's reason.
 */

const MAIN = '00000000-0000-0000-0000-000000000001';

export default function LocationsPanel() {
  const { currentTenant, currentTenantId } = useTenant();
  const { inventoryLocations = [], addLocation, updateLocation, deleteLocation, refetch } = useInventory(currentTenantId);

  const plan = currentTenant?.plan || 'STARTER';
  const planMeta = PLANS[plan] || PLANS.STARTER || {};
  const isPro = plan === 'PRO' || plan === 'ENTERPRISE';

  const [newName, setNewName] = useState('');
  const [newAddr, setNewAddr] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmErr, setConfirmErr] = useState(null);
  const [upgrade, setUpgrade] = useState(false);

  const attempt = async (fn, setE = setErr) => {
    setBusy(true); setE(null);
    try {
      const res = await fn();
      if (res?.error) { console.error('[settings] location write failed', res.error); setE(res.error); return false; }
      return true;
    } catch (e) {
      console.error('[settings] location write threw', e);
      setE(e);
      return false;
    } finally { setBusy(false); }
  };

  const add = async () => {
    if (!newName.trim()) return;
    const ok = await attempt(() => addLocation({ name: newName.trim(), address: newAddr.trim() }));
    if (ok) { setNewName(''); setNewAddr(''); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const ok = await attempt(() => updateLocation(editing));
    if (ok) setEditing(null);
  };

  const doDelete = async () => {
    const ok = await attempt(() => deleteLocation(confirm.id), setConfirmErr);
    if (ok) setConfirm(null);
  };

  return (
    <div>
      <PanelHead title="Locations" sub="Where stock is kept. Needs the Pro plan or higher." />
      <Stack>
        <SCard title="Branches and locations" sub="Warehouses, outlets and branches that hold stock."
          right={<Pill tone={isPro ? 'b' : 'n'}>{planMeta.label || plan}</Pill>} pad={!isPro}>
          {!isPro ? (
            <Note tone="am">
              Multi-branch stock needs the Pro plan or higher.
              <TextLink className="ml-1.5" onClick={() => setUpgrade(true)}>Upgrade</TextLink>
            </Note>
          ) : (
            <>
              {err && <WriteFailure error={err} noun="branch change" onReread={() => { setErr(null); refetch?.(); }} className="mt-3" />}
              {inventoryLocations.map((loc) => (
                <div key={loc.id} className="flex items-center gap-3 border-t border-sep py-3 first:border-t-0">
                  <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-tile text-ink-2"><MapPin size={16} aria-hidden="true" /></span>
                  {editing?.id === loc.id ? (
                    <>
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                        <input className={fieldCls} aria-label="Branch name" value={editing.name}
                          onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
                        <input className={fieldCls} aria-label="Address" placeholder="Address" value={editing.address || ''}
                          onChange={(e) => setEditing((p) => ({ ...p, address: e.target.value }))} />
                      </div>
                      <Button variant="dark" size="xs" onClick={saveEdit} disabled={busy}>Save</Button>
                      <Button variant="secondary" size="xs" onClick={() => setEditing(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <b className="block truncate font-tight text-[13.5px] font-semibold text-ink">{loc.name}</b>
                        {loc.address && <small className="block truncate text-[12px] text-mute">{loc.address}</small>}
                      </div>
                      {loc.id === MAIN ? <Pill>Main</Pill> : (
                        <>
                          <IconBtn label={`Rename ${loc.name}`} onClick={() => setEditing({ ...loc })}><Pencil /></IconBtn>
                          <IconBtn label={`Delete ${loc.name}`} tone="rd" onClick={() => { setConfirmErr(null); setConfirm(loc); }}><Trash2 /></IconBtn>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
              <div className="mb-3.5 mt-1 flex flex-col gap-2 sm:flex-row">
                <input className={fieldCls} aria-label="Branch name" placeholder="Branch name, for example Kozhikode outlet" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input className={fieldCls} aria-label="Address, optional" placeholder="Address, optional" value={newAddr} onChange={(e) => setNewAddr(e.target.value)} />
                <Button variant="dark" size="sm" className="h-9" onClick={add} disabled={busy || !newName.trim()}><Plus aria-hidden="true" />Add</Button>
              </div>
            </>
          )}
        </SCard>
        {isPro && <Note tone="gy">The main store cannot be renamed or deleted. Deleting a branch keeps its stock balances.</Note>}
      </Stack>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} width={460}
        title={confirm ? `Delete ${confirm.name}?` : ''} subtitle="Branch"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="destructive" onClick={doDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete branch'}</Button>
        </>}>
        <p className="text-[14px] text-ink-2">The branch is removed from stock screens and transfers. Its stock balances are kept, not moved or zeroed.</p>
        {confirmErr && <WriteFailure error={confirmErr} noun="delete" className="mt-3" />}
      </Dialog>

      <UpgradeDialog open={upgrade} onClose={() => setUpgrade(false)} reason="Branches and locations need Pro or higher" />
    </div>
  );
}
