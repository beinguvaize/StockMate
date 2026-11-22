import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

/** Copy text; icon crossfades to a tick for 1.6s. Only flips on a real copy. */
export default function CopyButton({ value, label = 'Copy', size = 14, className = '' }) {
  const [done, setDone] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const copy = async (e) => {
    e?.stopPropagation?.();
    try {
      await navigator.clipboard.writeText(String(value ?? ''));
      setDone(true);
      clearTimeout(t.current);
      t.current = setTimeout(() => setDone(false), 1600);
    } catch { /* clipboard blocked: stay on the copy icon */ }
  };
  return (
    <button type="button" onClick={copy} aria-label={done ? 'Copied' : label} title={done ? 'Copied' : label}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-xl hover:bg-black/5 text-muted-foreground active:scale-[0.97] transition-[background-color,transform] duration-(--dur-press) ${className}`}>
      {done
        ? <Check key="y" size={size} className="copy-icon text-[color:var(--color-pos)]" />
        : <Copy key="n" size={size} className="copy-icon" />}
    </button>
  );
}
