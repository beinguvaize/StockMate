import { useEffect, useRef, useState } from 'react';

/**
 * Put the cursor on a field once a dialog has closed.
 *
 * Focusing straight from the click handler loses: the dialog's own cleanup
 * (useDialogClose) runs afterwards and sends focus back to whatever opened it.
 * A parent's effect runs after every child's unmount cleanup in the same
 * commit, so focusing from here wins.
 *
 *   const focusAmount = useFocusAfterDialog((key) => formRef.current?.querySelector(...));
 *   focusAmount(key); closeDialog();
 */
export function useFocusAfterDialog(find) {
  const pending = useRef(null);
  const findRef = useRef(find);
  useEffect(() => { findRef.current = find; });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (pending.current === null) return;
    const el = findRef.current(pending.current);
    pending.current = null;
    if (el) { el.focus(); el.select?.(); }
  }, [tick]);
  return (key) => { pending.current = key ?? ''; setTick((t) => t + 1); };
}
