import React from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft } from 'lucide-react';
import { useDialogClose } from '../hooks/useDialogClose';

const Modal = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  // maxWidth kept for API compat but ignored — all modals are full-page now
  maxWidth,
}) => {
  // Escape to close + scroll lock + focus restore. Replaces a hand-rolled
  // lock that forced body overflow back to 'unset' whenever ANY modal closed,
  // so shutting a nested modal unlocked the page under the one still open.
  useDialogClose(onClose, { enabled: isOpen });

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
      className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in"
    >

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-black/5 bg-white shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-black/5 hover:bg-canvas transition-all text-ink-primary shrink-0"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0">
          {title && (
            <h1 className="text-lg font-black text-ink-primary leading-tight truncate">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-all text-muted-foreground shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
