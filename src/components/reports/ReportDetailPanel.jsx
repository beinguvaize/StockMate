import React, { useEffect } from 'react';
import { X, Copy, Share2, Info, Calendar, User, Tag, CreditCard, Hash, FileText } from 'lucide-react';

/**
 * ReportDetailPanel Component
 * 
 * Props:
 * @param {boolean} isOpen - Whether the panel is visible
 * @param {Function} onClose - Close handler
 * @param {Object} data - The record data to display
 * @param {string} title - Panel heading (e.g., "Invoice Details")
 * @param {Array} fields - [{ key, label, type, render }]
 */

const ReportDetailPanel = ({ 
  isOpen = false, 
  onClose = () => {}, 
  data = null, 
  title = "Record Details",
  fields = []
}) => {
  // Handle Escape key to close (Rule 9)
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(val);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderValue = (field, val) => {
    if (field.render) return field.render(val, data);
    if (field.type === 'currency') return formatCurrency(val);
    if (field.type === 'date') return formatDate(val);
    return val || '—';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] no-print">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Panel (Rule 9) */}
      <div className="absolute top-0 right-0 h-full w-full max-w-[450px] bg-white shadow-2xl border-l border-black/5 flex flex-col animate-in slide-in-from-right duration-500 ease-in-out">
        
        {/* Header */}
        <div className="p-6 border-b border-black/5 flex justify-between items-center bg-canvas/30 backdrop-blur-md sticky top-0 z-10">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-black font-sora text-ink-primary uppercase tracking-tighter">
              {title}<span className="text-accent-signature">.</span>
            </h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">In-Depth Perspective</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-black/5 flex items-center justify-center hover:bg-canvas transition-all text-ink-primary"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
          
          {/* Main Hero Value (if any) */}
          {data && (fields.find(f => f.isHero) || fields.find(f => f.type === 'currency')) && (
            <div className="p-6 bg-ink-primary rounded-[2rem] text-white shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent-signature/20 blur-3xl -mr-16 -mt-16" />
              <p className="text-[10px] font-black uppercase text-white/50 tracking-widest mb-2">Total Magnitude</p>
              <h3 className="text-4xl font-black font-sora tracking-tighter">
                {formatCurrency(data[fields.find(f => f.isHero || f.type === 'currency')?.key] || 0)}
              </h3>
            </div>
          )}

          {/* Detailed Fields */}
          <div className="grid grid-cols-1 gap-6">
            {fields.filter(f => !f.isHero).map(field => (
              <div key={field.key} className="flex flex-col gap-1.5 group">
                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {field.icon || <Info size={12} className="text-accent-signature" />}
                  {field.label}
                </div>
                <div className="text-sm font-bold text-ink-primary bg-canvas border border-black/5 p-4 rounded-2xl group-hover:bg-white group-hover:shadow-premium transition-all">
                  {renderValue(field, data[field.key])}
                </div>
              </div>
            ))}
          </div>

          {/* Items / Nested Data (if any) */}
          {data?.items && Array.isArray(data.items) && (
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-black/5 pb-2">Line Items</h4>
              <div className="space-y-3">
                {data.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-canvas rounded-xl border border-black/5">
                    <div>
                      <div className="text-xs font-black text-ink-primary uppercase tracking-tight">{item.name || item.productName}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">{item.quantity} {item.unit || 'units'} × {formatCurrency(item.price || item.unitCost)}</div>
                    </div>
                    <div className="text-sm font-black text-ink-primary tabular-nums">
                      {formatCurrency((item.quantity || 0) * (item.price || item.unitCost || 0))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-black/5 bg-canvas/30 backdrop-blur-md flex gap-3">
           <button 
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-white border border-black/5 rounded-pill text-[10px] font-black uppercase text-ink-primary hover:bg-canvas transition-all shadow-sm active:scale-95"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            }}
          >
            <Copy size={14} className="text-blue-500" />
            COPY DATA
          </button>
          <button 
            className="flex-2 btn-signature !h-14 !px-10 !text-[10px] !rounded-pill shadow-xl"
            onClick={() => window.print()}
          >
            PRINT RECORD
            <div className="icon-nest !w-8 !h-8 ml-4 bg-white/20">
              <Share2 size={16} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportDetailPanel;
