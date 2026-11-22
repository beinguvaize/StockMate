import React, { useEffect, useRef, useState } from 'react';

/** Reveals a real error message (grid rows 0fr->1fr) and shakes its wrapper
 *  once when a new message appears. Pass `message` falsy to hide. */
export function useShake(message) {
  const [n, setN] = useState(0);
  const prev = useRef('');
  useEffect(() => { if (message && message !== prev.current) setN(x => x + 1); prev.current = message || ''; }, [message]);
  return n ? 'field-shake' : '';
}
export default function FieldError({ message, id }) {
  const last = useRef('');
  if (message) last.current = message;
  return (
    <div className="reveal-rows" data-open={!!message}>
      <div><p id={id} role="alert" className="text-xs font-semibold text-red-600 pt-1">{message || last.current}</p></div>
    </div>
  );
}
