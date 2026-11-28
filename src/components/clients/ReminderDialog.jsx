import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, MessageSquare } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Seg, Switch } from '../documents/DocParts';
import { reminderText, whatsappUrl, smsUrl, phoneDigits } from '../../lib/clientView';

/**
 * Payment Reminder (approved mockup clients-09; new).
 *
 * Builds the message and opens WhatsApp or the phone's Messages with it
 * filled in, to the client's PHONE number. Nothing is sent from here: the
 * shopkeeper presses send there. It does not use lib/reminders.js, which
 * sends through a server function to `client.contact` (a person's name).
 */
export default function ReminderDialog({ client, shopName = '', upi = '', cur = '₹', onClose }) {
  const open = !!client;
  const [tone, setTone] = useState('POLITE');
  const [withBills, setWithBills] = useState(true);
  useEffect(() => { if (open) { setTone('POLITE'); setWithBills(true); } }, [open, client?.id]);
  const bills = useMemo(() => client?._facts?.unpaid || [], [client]);
  const text = useMemo(() => (client ? reminderText({
    client, shopName, amount: client._out ?? client.outstanding_balance, bills, withBills, tone, upi, cur,
  }) : ''), [client, shopName, bills, withBills, tone, upi, cur]);
  if (!open) return null;
  const hasPhone = !!phoneDigits(client.phone);
  const openUrl = (url) => { window.open(url, '_blank', 'noopener'); };

  return (
    <Dialog open={open} onClose={onClose} width={500} label="Payment reminder"
      title="Payment Reminder"
      subtitle={[client.name, client.contact, client.phone].filter(Boolean).join(' · ')}>
      <div className="-mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink-2">Wording</span>
          <Seg value={tone} onChange={setTone} options={[['POLITE', 'Polite'], ['FIRM', 'Firm']]} ariaLabel="Wording" />
        </div>
        <div className="whitespace-pre-wrap rounded-[14px] rounded-tl-[4px] bg-[#E7F6EC] px-3.5 py-3 text-[13.5px] leading-[1.5] text-ink-2" data-testid="reminder-text">
          {text}
        </div>
        {bills.length > 0 && (
          <div className="mt-3 flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <b className="block font-tight text-[13.5px] font-semibold">Add bill list</b>
              <small className="text-[12px] text-mute">Lists the {bills.length} unpaid bill{bills.length === 1 ? '' : 's'} under the message</small>
            </div>
            <Switch checked={withBills} onChange={setWithBills} label="Add bill list" />
          </div>
        )}
        {!hasPhone && (
          <p className="mt-3 rounded-[10px] bg-amber-soft px-3 py-2 text-[12.5px] text-amber-text">
            No phone number on file. WhatsApp opens and asks who to send it to; add a number to the client to use SMS.
          </p>
        )}
        <div className="mt-5 flex gap-2 [&>*]:flex-1">
          <Button variant="secondary" disabled={!hasPhone} onClick={() => openUrl(smsUrl(client.phone, text))}><MessageSquare /> Send as SMS</Button>
          <Button className="bg-[#1FA855] hover:bg-[#178a45]" onClick={() => openUrl(whatsappUrl(client.phone, text))}><MessageCircle /> Send on WhatsApp</Button>
        </div>
        <p className="-mx-[22px] mt-4 rounded-b-[18px] bg-tile px-[22px] py-[11px] text-[12px] text-body">
          Opens WhatsApp or Messages with this text filled in. Nothing goes until you press send there.
        </p>
      </div>
    </Dialog>
  );
}
