import { useEffect, useRef } from 'react';

/**
 * Standard dialog behaviour for hand-rolled overlays: Escape to close, body
 * scroll locked while open, focus returned to whatever opened it.
 *
 * None of the app's overlays did any of this — every modal could only be
 * dismissed with the mouse, which is a real cost in a keyboard-driven billing
 * flow. This is the small alternative to pulling in Radix for all of them.
 *
 * Nested dialogs are handled via a module-level stack: Escape only closes the
 * top-most one, and scroll unlocks only once the last one is gone.
 *
 *   const [open, setOpen] = useState(false);
 *   useDialogClose(() => setOpen(false), { enabled: open });
 *
 * For a component that only renders while open, `enabled` can be omitted:
 *   useDialogClose(onCancel);
 */
const stack = [];

export function useDialogClose(onClose, options = {}) {
  const { enabled = true, closeOnEscape = true, lockScroll = true } = options;

  // Keep the latest callback without re-binding the listener every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return undefined;

    const token = {};
    stack.push(token);

    const prevActive = document.activeElement;
    let prevOverflow;
    if (lockScroll && stack.length === 1) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || !closeOnEscape) return;
      if (stack[stack.length - 1] !== token) return; // only the top-most closes
      e.stopPropagation();
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      if (lockScroll && stack.length === 0) {
        document.body.style.overflow = prevOverflow ?? '';
      }
      // Send focus back where it came from, so tabbing resumes in place.
      if (prevActive instanceof HTMLElement) {
        try { prevActive.focus({ preventScroll: true }); } catch { /* element gone */ }
      }
    };
  }, [enabled, closeOnEscape, lockScroll]);
}

export default useDialogClose;
