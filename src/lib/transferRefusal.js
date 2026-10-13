/**
 * What the user is told when the server refuses a stock transfer.
 * ==========================================================================
 *
 * `transfer_inventory_atomic` raises `MARKER: a readable sentence`, the same
 * shape `process_sale` uses for the credit limit and the negative-stock block.
 * The marker lets code tell a REFUSAL (the rule said no, and the transfer is
 * fixable by changing the number) from a FAILURE (something broke).
 *
 * The server's sentence is kept, never replaced. A transfer refused because
 * "Paper Cup 210 Ml has 359.00 at the source and this moves 1359.00" tells the
 * user exactly what to type instead; a generic "Transfer failed" makes them
 * guess. The marker itself is stripped because it is for code — a person
 * reading TRANSFER_SHORT on a screen has learned nothing and assumes the app
 * is broken.
 */

/** Every marker the function can raise, and the heading that goes with it. */
export const TRANSFER_MARKERS = [
  ['TRANSFER_SHORT', 'Not enough stock at the source'],
  ['TRANSFER_INVALID', 'That transfer cannot be made'],
];

/**
 * Turn a Postgres error into { title, detail, refused }.
 *
 * `refused: true` means the shop's own rule declined it and the form should
 * stay exactly as it is so the user can change one field and retry.
 * `refused: false` is everything else — a dropped connection, a missing
 * function, an RLS denial — and those keep their original text rather than
 * being dressed up as a stock problem, because the real reason is the only
 * thing that makes them fixable.
 */
export function describeTransferError(error) {
  const raw = String(error?.message || error || '').trim();
  if (!raw) return { title: 'Transfer failed', detail: '', refused: false };

  for (const [marker, title] of TRANSFER_MARKERS) {
    const at = raw.indexOf(`${marker}:`);
    if (at !== -1) {
      return { title, detail: raw.slice(at + marker.length + 1).trim(), refused: true };
    }
  }

  // Not a refusal. Say so plainly and hand over the server's own words: a
  // transfer that failed for an unknown reason may or may not have moved
  // stock, and hiding why is how an outage looks like a user error.
  return { title: 'Transfer failed', detail: raw, refused: false };
}
