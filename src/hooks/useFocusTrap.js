import { useEffect } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The elements inside `root` that Tab can reach, in order. */
export const focusablesIn = (root) =>
  root ? [...root.querySelectorAll(FOCUSABLE)].filter(el => !el.closest('[inert]') && el.getClientRects().length > 0) : [];

/**
 * Keeps Tab and Shift+Tab inside `ref` while `enabled`, and moves focus in
 * when it opens (to `initialRef` if given, else the first focusable). Focus
 * going back to the opener on close is useDialogClose's job; the two are
 * used together.
 */
export function useFocusTrap(ref, { enabled = true, initialRef = null } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    const root = ref.current;
    if (!root) return undefined;

    const start = initialRef?.current || focusablesIn(root)[0] || root;
    try { start.focus({ preventScroll: true }); } catch { /* not focusable */ }

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const list = focusablesIn(root);
      if (list.length === 0) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const inside = root.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

export default useFocusTrap;
