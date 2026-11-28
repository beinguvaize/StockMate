import React from 'react';
import { Factory } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Ico } from './Cards';

/**
 * The shared dialog with the icon tile beside the title, as every
 * Manufacturing dialog is drawn. Motion is the shared Dialog's (scale + fade
 * on the --dur-dialog token, none under reduced motion).
 */
export default function MfgDialog({ open, onClose, title, subtitle, icon = Factory, tone, width = 500, footer, children }) {
  return (
    <Dialog open={open} onClose={onClose} width={width} label={title} footer={footer}
      header={(
        <div className="flex items-start gap-3">
          <Ico icon={icon} tone={tone} />
          <div className="min-w-0">
            <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[13px] text-body">{subtitle}</p>}
          </div>
        </div>
      )}>
      {children}
    </Dialog>
  );
}

/** A coloured notice (red / amber / grey), as .nt in the mockups. */
export const Note = ({ tone = 'n', icon: Icon, title, children }) => (
  <div role={tone === 'r' ? 'alert' : undefined}
    className={`flex items-start gap-2.5 rounded-xl px-3.5 py-[11px] text-[12.5px] leading-[1.45] ${
      tone === 'r' ? 'bg-bad-soft text-bad-text' : tone === 'a' ? 'bg-amber-soft text-amber-text' : tone === 'g' ? 'bg-good-soft text-good-text' : 'bg-tile text-body'}`}>
    {Icon && <Icon size={16} className="mt-px shrink-0" />}
    <span className="min-w-0 break-words">{title && <b className="font-tight text-[13px] font-semibold">{title} </b>}{children}</span>
  </div>
);
