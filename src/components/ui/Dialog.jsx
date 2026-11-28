import React from 'react';
import { createPortal } from 'react-dom';
import { useDialogClose } from '../../hooks/useDialogClose';
import { CloseButton } from './SidePanel';
import { cn } from '../../lib/utils';

/**
 * Centred dialog (web redesign): scales in from 96% and fades (220ms) over
 * a soft scrim. Escape / scrim / close button close it.
 *
 *   <Dialog open={open} onClose={close} title="Take a payment" subtitle="Anand Stores owes ₹12,400"
 *           footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button>Save</Button></>}>…</Dialog>
 *
 * Footer buttons share the width equally, as in the mockup. `header`
 * replaces the title block (a search field beside the close button).
 */
export default function Dialog({ open, onClose, title, subtitle, header, footer, children, width = 500, className, label }) {
  useDialogClose(onClose, { enabled: !!open });
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto px-4 pt-[12vh] pb-8">
      <div className="m-scrim fixed inset-0 bg-[rgba(17,20,24,0.28)]" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={label || (typeof title === 'string' ? title : 'Dialog')}
        style={{ width: `min(${width}px, 100%)` }}
        className={cn('m-dialog relative rounded-[18px] bg-surface text-ink shadow-[0_24px_60px_-20px_rgba(17,20,24,0.45)]', className)}>
        <div className="flex items-start gap-3 px-[22px] pt-5">
          <div className="min-w-0 flex-1">
            {header}
            {title && <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-[13px] text-body">{subtitle}</p>}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="px-[22px] py-4">{children}</div>
        {footer && <div className="flex gap-2 px-[22px] pb-5 [&>*]:flex-1">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
