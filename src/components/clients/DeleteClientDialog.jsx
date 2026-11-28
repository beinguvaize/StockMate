import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import HoldButton from '../motion/HoldButton';
import { money } from '../../lib/clientView';
import { ClientAvatar } from './parts';

/**
 * Delete client (approved mockup clients-16). Hold the button to confirm.
 * `onDelete(client)` returns null when done, or the reason it was not, which
 * is shown in red while the client stays.
 */
export default function DeleteClientDialog({ client, cur = '₹', onDelete, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setBusy(false); setError(''); }, [client?.id]);
  if (!client) return null;
  const out = Number(client._out ?? client.outstanding_balance) || 0;
  const go = async () => {
    setBusy(true); setError('');
    const err = await onDelete(client);
    setBusy(false);
    if (err) setError(err); else onClose();
  };
  return (
    <Dialog open={!!client} onClose={busy ? () => {} : onClose} width={440} label={`Delete ${client.name}`}
      header={(
        <div className="flex items-center gap-3">
          <ClientAvatar name={client.name} size="lg" />
          <div className="min-w-0">
            <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">Delete {client.name}?</h3>
            <p className="mt-0.5 text-[13px] text-body">{out > 0 ? `Owes you ${money(out, cur)}` : out < 0 ? `${money(-out, cur)} with you` : 'Settled · nothing owed either way'}</p>
          </div>
        </div>
      )}>
      <p className="text-[14px] text-ink-2">The client is taken off your Clients list. Hold the button for a moment to confirm.</p>
      {error
        ? <p role="alert" className="mt-3 rounded-[10px] bg-bad-soft px-3 py-2 text-[12.5px] text-bad-text break-words">The client could not be deleted: {error}</p>
        : <p className="mt-2 text-[12px] text-mute">If it cannot be deleted, the reason shows here in red and the client stays.</p>}
      <div className="mt-5 flex gap-2 [&>*]:flex-1">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <HoldButton onConfirm={go} disabled={busy} title="Hold 1.5s to delete this client"
          className="inline-flex h-10 items-center justify-center rounded-pill bg-bad-soft px-[18px] font-tight text-[13.5px] font-semibold text-bad-text">
          <Trash2 size={15} /> {busy ? 'Deleting…' : 'Hold to delete'}
        </HoldButton>
      </div>
    </Dialog>
  );
}
