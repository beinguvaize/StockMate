import { useEffect } from 'react';

/**
 * Re-runs `refetch` when the browser tab becomes visible again or the window
 * regains focus (covers Alt-Tab, mobile app-switch, sleep/wake, etc.).
 *
 * Pass the hook's memoised fetch callback directly — since it's wrapped in
 * useCallback it is stable and won't create an infinite loop.
 *
 * @param {() => void} refetch  - The fetch function to call on focus
 * @param {number}    [minIdleMs=30_000] - Only refetch if tab was hidden for
 *                    at least this many ms (prevents spurious refetches on
 *                    quick Alt-Tab for password managers, etc.)
 */
const useRefetchOnFocus = (refetch, minIdleMs = 30_000) => {
  useEffect(() => {
    if (!refetch) return;

    let hiddenAt = null;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        const idleMs = hiddenAt ? Date.now() - hiddenAt : Infinity;
        if (idleMs >= minIdleMs) {
          refetch();
        }
        hiddenAt = null;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refetch, minIdleMs]);
};

export default useRefetchOnFocus;
