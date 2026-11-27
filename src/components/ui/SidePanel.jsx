import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogClose } from '../../hooks/useDialogClose';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { cn } from '../../lib/utils';
import { Button } from './button';

/**
 * Side panel (web redesign): slides in from the right over a soft scrim.
 * Escape, scrim click and the round close button all close it; focus goes
 * back to whatever opened it (useDialogClose).
 *
 *   <SidePanel open={!!sale} onClose={() => setSale(null)} eyebrow="Sale" title="INV-1042"
 *              subtitle="22 Nov, 4:10 pm" footer={<Button>Print</Button>}>…</SidePanel>
 *
 * `trapFocus` (opt-in) moves focus into the panel and keeps Tab inside it.
 * Opt-in because a panel that opens a menu portalled outside itself would
 * have that menu's focus pulled back.
 */
export default function SidePanel({ open, onClose, eyebrow, title, subtitle, footer, children, width = 452, className, trapFocus = false }) {
  const asideRef = useRef(null);
  useDialogClose(onClose, { enabled: !!open });
  useFocusTrap(asideRef, { enabled: !!open && trapFocus });
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[150]">
      <div className="m-scrim absolute inset-0 bg-[rgba(17,20,24,0.28)]" onClick={onClose} aria-hidden="true" />
      <aside ref={asideRef} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'}
        style={{ width: `min(${width}px, 100vw)` }}
        className={cn('m-panel absolute inset-y-0 right-0 flex flex-col bg-surface text-ink shadow-[-24px_0_48px_-24px_rgba(17,20,24,0.35)]', className)}>
        <div className="px-[22px] pt-[18px] pb-3.5 border-b border-sep">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {eyebrow && <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{eyebrow}</span>}
              {title && <h3 className="mt-1 font-tight text-[19px] font-semibold tracking-[-0.01em] truncate">{title}</h3>}
              {subtitle && <p className="mt-0.5 text-[13px] text-body">{subtitle}</p>}
            </div>
            <CloseButton onClick={onClose} />
          </div>
        </div>
        <div className="flex-1 overflow-auto px-[22px] py-4">{children}</div>
        {footer && <div className="px-[22px] pt-3.5 pb-[18px] border-t border-sep">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** The round grey close button used by panels and dialogs. */
export const CloseButton = ({ onClick, label = 'Close' }) => (
  <Button variant="secondary" size="icon-sm" onClick={onClick} aria-label={label} title={label} className="shrink-0">
    <X size={14} />
  </Button>
);
