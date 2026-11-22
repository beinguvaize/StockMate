import React, { useRef, useState } from 'react';

// Module-level so neighbouring tooltips share "a tip is open" state.
let openCount = 0;
let lastClose = 0;
const WARM_MS = 300;

/** Wraps an icon button. First tip waits 500ms; while one is open (or closed
 *  <300ms ago) neighbours show instantly with no animation. */
export default function Tooltip({ label, children }) {
  const [show, setShow] = useState(false);
  const [instant, setInstant] = useState(false);
  const timer = useRef(null);
  const enter = () => {
    const warm = openCount > 0 || Date.now() - lastClose < WARM_MS;
    clearTimeout(timer.current);
    const open = () => { openCount++; setInstant(warm); setShow(true); };
    if (warm) open(); else timer.current = setTimeout(open, 500);
  };
  const leave = () => {
    clearTimeout(timer.current);
    if (show) { openCount = Math.max(0, openCount - 1); lastClose = Date.now(); setShow(false); }
  };
  return (
    <span className="relative inline-flex" onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave}>
      {children}
      {show && (
        <span role="tooltip" data-instant={instant}
          className="tip pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-1.5 whitespace-nowrap rounded-lg bg-ink-primary text-white text-[11px] font-semibold px-2 py-1">
          {label}
        </span>
      )}
    </span>
  );
}
