import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * An A4 sheet (794 CSS px wide) shrunk to fit the box it sits in, keeping its
 * proportions: the detail page's document preview and the Customise page's
 * live preview. `scale` fixes the size instead of fitting.
 */
export default function ScaledSheet({ children, scale: fixed, max = 1, className = '' }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [fit, setFit] = useState(0.6);
  const [h, setH] = useState(1123);
  useLayoutEffect(() => {
    const o = outer.current; const i = inner.current;
    if (!o || !i || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const w = o.clientWidth || 794;
      setFit(Math.min(max, w / 794));
      setH(i.scrollHeight || 1123);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o); ro.observe(i);
    return () => ro.disconnect();
  }, [max]);
  const s = fixed || fit;
  return (
    <div ref={outer} className={`w-full ${className}`}>
      <div className="relative mx-auto overflow-hidden" style={{ width: 794 * s, height: h * s }}>
        <div ref={inner} className="absolute left-0 top-0 w-[794px] origin-top-left shadow-[0_0_0_1px_rgba(17,20,24,0.06),0_14px_34px_-20px_rgba(17,20,24,0.4)]"
          style={{ transform: `scale(${s})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
