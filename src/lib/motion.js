// Pure helpers behind the motion kit. No DOM here so they can be tested.

/** Which characters of `next` changed vs `prev`, aligned from the RIGHT so a
 *  grown total (99 -> 100) rolls every digit that moved place. */
export function digitDiff(prev, next) {
  const a = String(prev ?? '');
  const b = String(next ?? '');
  const out = [];
  for (let i = 0; i < b.length; i++) {
    const fromRight = b.length - 1 - i;
    const pi = a.length - 1 - fromRight;
    const before = pi >= 0 ? a[pi] : null;
    out.push({ ch: b[i], changed: before !== b[i] });
  }
  return out;
}

const KEY = 'bl_first_open_';
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** True exactly once per local day per `name`. Storage failures => false (no motion). */
export function isFirstOpenToday(name, storage, now = new Date()) {
  try {
    const day = localDay(now);
    if (storage.getItem(KEY + name) === day) return false;
    storage.setItem(KEY + name, day);
    return true;
  } catch {
    return false;
  }
}

export const DISMISS_VELOCITY = 0.11; // px per ms

/** Swipe-to-dismiss: fast enough, or dragged past 40% of the width. */
export function shouldDismiss(dx, dtMs, width = 320) {
  const v = Math.abs(dx) / Math.max(1, dtMs);
  return v > DISMISS_VELOCITY || Math.abs(dx) > width * 0.4;
}

/** Toasts: newest last. Returns the visible ones tagged with depth i (0 = newest). */
export function stackToasts(list, max = 3) {
  const vis = list.slice(-max);
  return vis.map((n, idx) => ({ ...n, depth: vis.length - 1 - idx }));
}

/** Hold-to-confirm progress 0..1. */
export const holdProgress = (elapsedMs, totalMs = 1500) => Math.min(1, Math.max(0, elapsedMs / totalMs));
