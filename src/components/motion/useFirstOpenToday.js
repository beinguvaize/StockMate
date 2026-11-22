import { useState } from 'react';
import { isFirstOpenToday } from '../../lib/motion';

/** True for the whole first mount of the day for `name`, then false forever (today). */
export default function useFirstOpenToday(name) {
  const [first] = useState(() => {
    try { return typeof window !== 'undefined' && isFirstOpenToday(name, window.localStorage); } catch { return false; }
  });
  return first;
}
