import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  subtitle, 
  children, 
  maxWidth = 'max-w-4xl' 
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Portal to document.body so transformed ancestors (animate-fade-in leaves a
  // persistent transform) don't become the containing block for position:fixed,
  // which would push the modal off the viewport center.
  return createPortal(
    <div className="modal-overlay">
      <div className={`glass-modal !p-0 w-full ${maxWidth} animate-in fade-in zoom-in duration-300 h-screen md:h-auto md:max-h-[calc(100vh-2rem)] flex flex-col !rounded-none md:!rounded-[var(--radius-xl)]`}>
        <div className="flex justify-between items-start border-b border-black/5 px-6 py-5 shrink-0">
          <div>
            {title && (
              <h1 className="text-xl font-semibold text-ink-primary leading-tight mb-1">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-xs font-medium text-gray-500">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary shrink-0"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
