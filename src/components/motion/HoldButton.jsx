import React, { useRef, useState, useEffect } from 'react';

/** Press and hold 1.5s to fire onConfirm. Release early snaps back; fires only
 *  on completion. Keyboard: holding Enter/Space works the same way. */
export default function HoldButton({ onConfirm, children, holdMs = 1500, className = '', disabled = false, title }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);
  const stop = () => { clearTimeout(timer.current); setHolding(false); };
  const start = () => {
    if (disabled) return;
    setHolding(true);
    timer.current = setTimeout(() => { setHolding(false); onConfirm?.(); }, holdMs);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const keyStart = (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(); } };
  const keyStop = (e) => { if (e.key === 'Enter' || e.key === ' ') stop(); };
  return (
    <button
      type="button"
      data-holding={holding}
      disabled={disabled}
      aria-label={title || 'Hold to confirm'}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={keyStart}
      onKeyUp={keyStop}
      onBlur={stop}
      className={`hold-btn relative overflow-hidden select-none touch-none transition-transform duration-(--dur-press) active:scale-[0.97] ${className}`}
    >
      <span className="hold-fill absolute inset-0 bg-red-600/25" aria-hidden="true" />
      <span className="relative inline-flex items-center gap-1">{children}</span>
    </button>
  );
}
