import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import Button from '../../shared/Button';

/**
 * Save button that mirrors a REAL save. `status` comes from the caller's
 * promise: 'idle' | 'saving' | 'saved' | 'error'. This component never decides
 * success on its own. After 'saved' it holds the tick ~1.5s via `onSettled`.
 * Errors are shown by the caller (real reason); the button just returns to idle.
 */
export default function SaveButton({ status = 'idle', idleLabel, savingLabel = 'Saving', savedLabel = 'Saved', icon, className = '', ...rest }) {
  const label = status === 'saving' ? savingLabel : status === 'saved' ? savedLabel : idleLabel;
  return (
    <Button
      {...rest}
      icon={status === 'idle' || status === 'error' ? icon : undefined}
      // 'saved' stays disabled too: the dialog closes ~700ms later, and a click
      // in that window would save the same thing twice.
      disabled={rest.disabled || status === 'saving' || status === 'saved'}
      className={`${className} ${status === 'saved' ? 'save-btn-saved' : ''}`}
    >
      <span key={status} className="save-label inline-flex items-center gap-2" aria-live="polite">
        {status === 'saving' && <Loader2 size={14} className="animate-spin" />}
        {status === 'saved' && <Check size={14} />}
        {label}
      </span>
    </Button>
  );
}

/** Drives status from a real promise. run(fn) resolves with fn's result; a
 *  rejection or a {error} result puts status to 'error' and is re-thrown / returned. */
export function useSaveStatus(holdMs = 1500) {
  const [status, setStatus] = useState('idle');
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const settle = () => { clearTimeout(t.current); t.current = setTimeout(() => setStatus('idle'), holdMs); };
  const start = () => { clearTimeout(t.current); setStatus('saving'); };
  const ok = () => { setStatus('saved'); settle(); };
  const fail = () => { setStatus('error'); settle(); };
  return { status, start, ok, fail };
}
