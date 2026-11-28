import React, { useState } from 'react';
import { Lock, RefreshCcw } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Eyebrow } from '../ui/FigureStrip';
import { AmountField, VarianceStrip, fmt, money } from './parts';
import { varianceLook, dayLabel } from '../../lib/dayBookView';

/**
 * Close Day (mockup daybook-03). Same inputs and the same hand-back as the
 * page's former modal: onConfirm(count or null, note). The variance shown
 * here is display only; the page computes what it saves.
 */
export default function CloseDayDialog({ open, date, closingBal, cy, initialPhysical, isClosing, onCancel, onConfirm }) {
  const [pc, setPc] = useState(initialPhysical || '');
  const [note, setNote] = useState('');
  const pcNum = parseFloat(pc);
  const v = !isNaN(pcNum) ? Math.round((pcNum - closingBal) * 100) / 100 : null;
  const look = varianceLook(v, { surplusWord: 'Cash Surplus' });

  return (
    <Dialog open={open} onClose={onCancel} title="Close Day" subtitle={dayLabel(date)} width={440}
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="dark" className="flex-[2]!" disabled={isClosing}
            onClick={() => onConfirm(isNaN(pcNum) ? null : pcNum, note)}>
            {isClosing ? <RefreshCcw className="animate-spin" /> : <Lock />} Confirm &amp; Lock Day
          </Button>
        </>
      )}>
      <div className="flex items-center justify-between rounded-xl bg-tile px-4 py-3.5">
        <Eyebrow>Expected Cash</Eyebrow>
        <b className="font-tight text-[20px] font-semibold tabular-nums">{cy}{fmt(closingBal)}</b>
      </div>

      <label className="mt-3.5 block">
        <span className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Physical Count</span>
        <AmountField cy={cy} step="0.01" placeholder="Count cash in drawer" autoFocus
          value={pc} onChange={(e) => setPc(e.target.value)} />
      </label>

      <VarianceStrip look={look} value={look && (look.exact ? 'Exact match' : money(v, cy, { signed: true, plus: true }))} />
      {look && !look.exact && (
        <p className="mt-2 text-[12px] text-mute">Variance will be recorded as an account adjustment.</p>
      )}

      <label className="mt-3.5 block">
        <span className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Note (optional)</span>
        <Input className="h-10" placeholder="e.g. Handover to office" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Dialog>
  );
}
