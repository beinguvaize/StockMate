/**
 * Did the write happen? Three answers, not two.
 * ==========================================================================
 *
 * A failed `await supabase...` is usually read as "it did not save". That is
 * only true for one of the two kinds of failure, and the difference is not
 * cosmetic -- it decides what the screen is allowed to claim and which button
 * it offers next.
 *
 * REJECTED — the server answered, and the answer was no. RLS refused it, a
 *   constraint refused it, the function refused it. Nothing was written, the
 *   app knows that for certain, and "Not saved" is honest.
 *
 * UNCONFIRMED — the request never completed a round trip. `TypeError: Failed
 *   to fetch`, a dropped connection, an abort, the laptop lid closing. The
 *   browser knows only that it stopped listening. The write may have been
 *   rejected, may never have left, or MAY HAVE COMMITTED.
 *
 * That last case is not hypothetical. On 2026-10-17 at 11:06:36 UTC a payroll
 * attendance batch for a real shop preflighted (OPTIONS 200), committed four
 * rows in Postgres at 11:06:36.679 -- and the browser showed
 * `Not saved · TypeError: Failed to fetch`, with a Discard button beside it.
 * Discarding there would have thrown away edits the database already held, and
 * left the screen disagreeing with the books until someone reloaded.
 *
 * So an UNCONFIRMED failure must not assert either outcome. The only honest
 * move is to say so and go and look: re-read from the server and show what is
 * actually there.
 */

/**
 * A transport-level failure: the request did not complete a round trip.
 *
 * This is the one definition of the rule. `hookAdapter.isOfflineError` is this
 * function under its older name -- five hooks call it to decide whether to
 * queue a write for replay, which is the same question asked for a different
 * purpose, and two copies of this rule would drift.
 */
export function isTransportFailure(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  if (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timed out') ||
    msg.includes('abort')
  ) return true;

  // `navigator.onLine` is consulted only where it is a real boolean. The
  // inherited form was `!navigator.onLine`, which is TRUE wherever the
  // property is merely absent -- Node, a test runner, a stripped embedder --
  // so every server rejection classified as an offline failure there. In a
  // browser the property exists, so this changes nothing a user sees; it stops
  // the rule being wrong everywhere else, including in its own tests.
  const onLine = typeof navigator !== 'undefined' ? navigator.onLine : undefined;
  return onLine === false;
}

/**
 * Turn a write failure into something a screen can say truthfully.
 *
 * Returns { kind, title, detail, maySaved }, where `maySaved` is the flag that
 * matters: when it is true the screen must not claim the write was lost, and
 * must offer a re-read rather than a discard.
 */
export function classifyWriteFailure(error, { noun = 'change' } = {}) {
  const detail = String(error?.message || error || '').trim();

  if (isTransportFailure(error)) {
    return {
      kind: 'UNCONFIRMED',
      maySaved: true,
      // Deliberately not "Not saved". The app does not know that.
      title: `Couldn't confirm this ${noun}`,
      detail: detail || 'The connection dropped before the server answered.',
    };
  }

  return {
    kind: 'REJECTED',
    maySaved: false,
    title: 'Not saved',
    // The server's own words. A bare "failed to save" is how a real outage
    // stays invisible.
    detail: detail || 'The server refused it and gave no reason.',
  };
}
