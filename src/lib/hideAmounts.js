import { useCallback, useEffect, useState } from 'react';

/**
 * "Hide amounts" on the employee profile (approved payroll-35).
 *
 * Remembered on this device only. Browser storage can be missing or throw
 * (private window, blocked site data), so every read and write is guarded and
 * the switch then simply starts off. Nothing goes to the database.
 */
export const HIDE_AMOUNTS_KEY = 'bookledger.payroll.hideAmounts';
export const MASK = '₹ ••••••';

export function readHidden(store = globalThis.localStorage) {
  try { return store?.getItem(HIDE_AMOUNTS_KEY) === '1'; } catch { return false; }
}

export function writeHidden(on, store = globalThis.localStorage) {
  try {
    if (on) store?.setItem(HIDE_AMOUNTS_KEY, '1'); else store?.removeItem(HIDE_AMOUNTS_KEY);
    return true;
  } catch { return false; }
}

/** A money formatter that masks when hidden; null stays '—' so "not known" still reads as not known. */
export const maskedMoney = (hidden, fmt) => (n, opts) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return fmt(n, opts);
  return hidden ? MASK : fmt(n, opts);
};

export function useHiddenAmounts() {
  const [hidden, setHidden] = useState(() => readHidden());
  // Another tab on this device flipping the switch.
  useEffect(() => {
    const on = (e) => { if (e.key === HIDE_AMOUNTS_KEY) setHidden(readHidden()); };
    try { window.addEventListener('storage', on); } catch { return undefined; }
    return () => { try { window.removeEventListener('storage', on); } catch { /* gone */ } };
  }, []);
  const toggle = useCallback(() => setHidden((h) => { writeHidden(!h); return !h; }), []);
  return [hidden, toggle];
}
