import React from 'react';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { cn } from '../../lib/utils';

/**
 * A failed write, said truthfully (lib/writeOutcome).
 *
 * The server refused: "Not saved" and the server's own reason.
 * The connection dropped: the write may have gone through, so this never says
 * "Not saved"; it says the save could not be confirmed and offers a re-read.
 */
export default function WriteFailure({ error, noun = 'change', onReread, className }) {
  if (!error) return null;
  const f = classifyWriteFailure(error, { noun });
  return (
    <div role="alert" className={cn('rounded-[10px] px-3 py-2.5 text-[12.5px]', f.maySaved ? 'bg-amber-soft text-amber-text' : 'bg-bad-soft text-bad-text', className)}>
      <b className="block font-tight font-semibold">{f.title}</b>
      <span className="block break-words">{f.detail}</span>
      {f.maySaved && (
        <span className="block mt-1">
          It may have been saved.{' '}
          {onReread && (
            <button type="button" onClick={onReread} className="font-tight font-semibold underline underline-offset-2">Check again</button>
          )}
        </span>
      )}
    </div>
  );
}
