import React, { useRef } from 'react';
import { digitDiff } from '../../lib/motion';

/** Renders `text` with only the changed characters sliding up. Static cue: the
 *  text itself. Keyed by value so an unchanged digit is never re-animated. */
export default function RollingNumber({ text, className = '' }) {
  const prev = useRef(null);
  const first = prev.current === null;
  const parts = digitDiff(prev.current, text);
  prev.current = String(text);
  return (
    <span className={`tabular-nums ${className}`} aria-label={String(text)}>
      {parts.map((p, i) =>
        p.changed && !first && /\d/.test(p.ch)
          ? <span key={`${i}-${p.ch}`} aria-hidden="true" className="roll-digit">{p.ch}</span>
          : <span key={i} aria-hidden="true">{p.ch}</span>
      )}
    </span>
  );
}
