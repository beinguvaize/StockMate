import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * What the cashier is told when the server refuses a bill.
 * ==========================================================================
 *
 * process_sale raises `MARKER: a readable sentence`. The marker exists so code
 * can tell a REFUSAL (the shop's own rule says no) from a FAILURE (something
 * broke). They need different words and different behaviour: a refusal keeps
 * the cart exactly as it is so the cashier can take the item off and carry on.
 *
 * This is a source check rather than a render test because the POS component
 * needs a tenant, a cart and a server to mount, and the thing worth protecting
 * is small and specific: that every marker the database raises is one the till
 * translates. A marker added server-side and forgotten here shows the cashier
 * `Checkout failed: NEGATIVE_STOCK_BLOCKED: Salt has 2 in stock...`, which
 * reads as a crash.
 */

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'sales', 'components', 'InvoiceBuilder.jsx'),
  'utf8',
);

/** Every marker process_sale can raise, with the words the cashier should see. */
const MARKERS = [
  ['CREDIT_LIMIT_EXCEEDED', 'Credit limit reached'],
  ['NEGATIVE_STOCK_BLOCKED', 'Not enough stock'],
];

describe('a refused sale', () => {
  it.each(MARKERS)('translates %s', (marker, friendly) => {
    expect(SRC, `${marker} is raised by the database but not handled at the till`).toContain(marker);
    expect(SRC, `${marker} has no words for the cashier`).toContain(friendly);
  });

  it('strips the marker rather than showing it', () => {
    // The marker is for code. A cashier reading NEGATIVE_STOCK_BLOCKED on a
    // screen has learned nothing and assumes the app is broken.
    expect(SRC).toMatch(/replace\(new RegExp\(`\^\.\*\$\{hit\[0\]\}:/);
  });

  it('keeps the cart when the sale is refused', () => {
    // The bill is fine; one line of it is not allowed. Clearing the cart would
    // make the cashier ring the whole basket again.
    expect(SRC).toMatch(/return; \/\/ keep cart/);
  });
});

describe('the rule itself', () => {
  it('is enforced on the server, not in the till', () => {
    // Three clients write sales and the desktop replays them later. A stock
    // rule living in one screen is a rule the other two break — so the till
    // must not be deciding this for itself.
    expect(
      /if\s*\(\s*[^)]*block_negative_stock/i.test(SRC),
      'the POS appears to make the negative-stock decision locally',
    ).toBe(false);
  });
});
