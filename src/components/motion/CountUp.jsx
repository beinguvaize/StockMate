import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './usePlayOnce';

/**
 * A figure that counts up from 0 the first time it has a value, then shows
 * every later value straight away. Display only: `format` receives the
 * animated number and must not round the final value differently from how
 * the page shows it elsewhere; the last frame is always `format(value)`.
 *
 * `value` null/undefined renders `fallback` (a dash), never a 0.
 */
export default function CountUp({ value, format = (n) => String(n), duration = 700, fallback = '—', className }) {
  const done = useRef(false);
  const [shown, setShown] = useState(null);
  const has = typeof value === 'number' && Number.isFinite(value);

  useEffect(() => {
    if (!has) return undefined;
    if (done.current || prefersReducedMotion() || value === 0) {
      done.current = true;
      setShown(null);
      return undefined;
    }
    done.current = true;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      if (p < 1) { setShown(value * eased); raf = requestAnimationFrame(tick); }
      else setShown(null);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); setShown(null); };
  }, [has, value, duration]);

  if (!has) return <span className={className}>{fallback}</span>;
  return <span className={className}>{format(shown === null ? value : shown)}</span>;
}
