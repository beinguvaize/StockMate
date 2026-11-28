import { useEffect, useState } from 'react';

/** True when the viewer asked for reduced motion. Safe outside a browser. */
export const prefersReducedMotion = () => {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
};

/**
 * `true` while a page's one-time entrance may still play, `false` once it
 * has (after `ms`), and `false` from the start under reduced motion.
 *
 * Charts use it so the month line draws itself and bars grow once per page
 * open: a refetch after that redraws the figures in place instead of
 * replaying the entrance every 15 seconds.
 */
export default function usePlayOnce(ms = 1400) {
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => setPlaying(false), ms);
    return () => clearTimeout(t);
  }, [playing, ms]);
  return playing;
}
