import React, { useEffect, useRef, useState } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { CheckCircle2, AlertCircle, ShoppingCart, DollarSign, X } from 'lucide-react';
import { shouldDismiss, stackToasts } from '../lib/motion';

const EXIT_MS = 300;

/** One toast card. Depth 0 = newest (front). Swipe right to dismiss. */
const Toast = ({ n, depth, leaving, onClose }) => {
  const [entered, setEntered] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef(null);
  useEffect(() => { const r = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(r); }, []);

  const down = (e) => { drag.current = { x: e.clientX, t: performance.now() }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (drag.current) setDx(Math.max(0, e.clientX - drag.current.x)); };
  const up = () => {
    if (!drag.current) return;
    const dt = performance.now() - drag.current.t;
    const dismiss = shouldDismiss(dx, dt);
    drag.current = null;
    if (dismiss) onClose(); else setDx(0);
  };

  const isErr = n.type === 'error';
  const tone = n.type === 'success' ? 'bg-green-50 text-green-600'
    : n.type === 'expense' ? 'bg-pink-50 text-pink-600'
    : isErr ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600';
  const Icon = n.type === 'success' ? ShoppingCart : n.type === 'expense' ? DollarSign : isErr ? AlertCircle : CheckCircle2;
  const label = n.type === 'success' ? 'Done' : n.type === 'expense' ? 'Expense Logged' : isErr ? 'Problem' : 'System Update';

  return (
    <div
      role={isErr ? 'alert' : 'status'}
      data-enter={!entered}
      data-leave={leaving}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ '--toast-i': depth, '--toast-dx': `${dx}px`, transition: drag.current ? 'none' : undefined, touchAction: 'pan-y' }}
      className="toast-card group pointer-events-auto absolute bottom-0 right-0 w-[340px] max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-2xl border border-black/5 p-4 flex items-start gap-3"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}><Icon size={18} /></div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-ink-primary text-sm break-words">{n.message}</p>
        <p className="text-[10px] font-semibold text-ink-secondary opacity-80 uppercase mt-1">{label}</p>
      </div>
      <button type="button" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); onClose(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="opacity-60 group-hover:opacity-100 transition-opacity duration-(--dur-hover) text-ink-secondary">
        <X size={14} />
      </button>
    </div>
  );
};

const NotificationStack = () => {
  const { notifications, removeNotification } = useNotifications();
  // Keep removed toasts around for their exit animation.
  const [shown, setShown] = useState([]);
  useEffect(() => {
    setShown((prev) => {
      const live = new Set(notifications.map((n) => n.id));
      const leaving = prev.filter((p) => !live.has(p.id)).map((p) => ({ ...p, leaving: true }));
      const cur = notifications.map((n) => ({ ...n, leaving: false }));
      const byId = new Map([...leaving, ...cur].map((n) => [n.id, n]));
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
  }, [notifications]);
  useEffect(() => {
    if (!shown.some((s) => s.leaving)) return;
    const t = setTimeout(() => setShown((p) => p.filter((s) => !s.leaving)), EXIT_MS);
    return () => clearTimeout(t);
  }, [shown]);

  if (shown.length === 0) return null;
  const stacked = stackToasts(shown.filter((s) => !s.leaving));
  const depthOf = new Map(stacked.map((s) => [s.id, s.depth]));
  const visible = shown.filter((s) => s.leaving || depthOf.has(s.id));

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-[340px] max-w-[calc(100vw-2rem)] h-0 pointer-events-none">
      {visible.map((n) => (
        <Toast key={n.id} n={n} depth={n.leaving ? 0 : depthOf.get(n.id)} leaving={n.leaving} onClose={() => removeNotification(n.id)} />
      ))}
    </div>
  );
};

export default NotificationStack;
