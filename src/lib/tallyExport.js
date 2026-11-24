/**
 * Handing the books to Tally.
 * ==========================================================================
 *
 * Every March the shop's accountant asks for the year in Tally, and the answer
 * has been "export a CSV and retype it". Tally imports XML directly — vouchers
 * and masters — so this produces that file.
 *
 * THE ONE PROPERTY THAT MATTERS
 *
 * A Tally voucher is double entry. The amounts on its ledger entries must sum
 * to exactly zero, or Tally rejects the voucher on import — and it rejects it
 * at the END of a long file, after the ones before it are already in, which
 * leaves a half-imported year that somebody has to unpick by hand.
 *
 * So `buildVoucher` balances by construction and `voucherImbalance` is a
 * function anyone can call on the result. The exporter refuses to write a file
 * containing an unbalanced voucher rather than let Tally find it.
 *
 * SIGNS, BECAUSE THEY ARE NOT INTUITIVE
 *
 * In Tally's XML a DEBIT is a negative AMOUNT with ISDEEMEDPOSITIVE=Yes, and a
 * CREDIT is a positive AMOUNT with ISDEEMEDPOSITIVE=No. A sale therefore
 * debits the customer (negative) and credits Sales and the tax ledgers
 * (positive). Getting this backwards produces a file that imports cleanly and
 * reverses the shop's profit, which is the worst available failure, so the
 * helpers below are named for the accounting word rather than the sign.
 */

/** Tally's date format. */
export const tallyDate = (d) => {
  if (!d) return '';
  const s = String(d);
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  return iso.replace(/-/g, '');
};

/**
 * XML escaping.
 *
 * Shop and party names in this market routinely contain & ("Ram & Sons"), and
 * an unescaped ampersand makes the whole file unparseable — Tally reports a
 * generic error at a line number, and the shopkeeper is told their data is
 * corrupt.
 */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Two decimal places, as Tally stores money. */
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** A debit entry: negative amount, deemed positive. */
export const debit = (ledger, amount) => ({ ledger, amount: -Math.abs(money(amount)), deemedPositive: true });

/** A credit entry: positive amount, not deemed positive. */
export const credit = (ledger, amount) => ({ ledger, amount: Math.abs(money(amount)), deemedPositive: false });

/** How far from balanced a voucher is. Zero is the only acceptable answer. */
export function voucherImbalance(voucher) {
  const sum = (voucher?.entries || []).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const rounded = Math.round(sum * 100) / 100;
  // Normalise negative zero. A balanced voucher whose entries happen to sum
  // through a tiny negative yields -0, which is === 0 but prints as "-0.00" in
  // the error message and fails an Object.is check — both of which would make
  // a correct file look broken.
  return rounded === 0 ? 0 : rounded;
}

/**
 * Build one sales voucher from a sale.
 *
 * The party ledger is the customer when there is one and "Cash" when there is
 * not — a counter sale to a walk-in has no debtor, and inventing one would put
 * a receivable in the accountant's books that nobody can ever collect.
 *
 * Tax is split the way the sale was billed: IGST for inter-state, CGST+SGST
 * otherwise. The split is taken from the sale, never recomputed here, so the
 * file agrees with the invoice the customer was given.
 */
export function buildSaleVoucher(sale, { salesLedger = 'Sales', cashLedger = 'Cash' } = {}) {
  const party = String(sale.partyName || '').trim() || cashLedger;
  const taxable = money(sale.taxable ?? sale.subtotal ?? 0);
  const cgst = money(sale.cgst || 0);
  const sgst = money(sale.sgst || 0);
  const igst = money(sale.igst || 0);
  const roundOff = money(sale.roundOff || 0);
  const total = money(taxable + cgst + sgst + igst + roundOff);

  const entries = [debit(party, total), credit(salesLedger, taxable)];
  if (cgst) entries.push(credit('CGST', cgst));
  if (sgst) entries.push(credit('SGST', sgst));
  if (igst) entries.push(credit('IGST', igst));
  if (roundOff) {
    // Round-off can go either way and must still balance.
    entries.push(roundOff > 0 ? credit('Round Off', roundOff) : debit('Round Off', roundOff));
  }

  return {
    type: 'Sales',
    date: tallyDate(sale.date),
    number: sale.number || sale.id,
    party,
    narration: sale.narration || '',
    entries,
  };
}

/** The purchase mirror: the supplier is credited, Purchases and tax debited. */
export function buildPurchaseVoucher(purchase, { purchaseLedger = 'Purchase', cashLedger = 'Cash' } = {}) {
  const party = String(purchase.partyName || '').trim() || cashLedger;
  const taxable = money(purchase.taxable ?? purchase.subtotal ?? 0);
  const cgst = money(purchase.cgst || 0);
  const sgst = money(purchase.sgst || 0);
  const igst = money(purchase.igst || 0);
  const total = money(taxable + cgst + sgst + igst);

  const entries = [credit(party, total), debit(purchaseLedger, taxable)];
  if (cgst) entries.push(debit('Input CGST', cgst));
  if (sgst) entries.push(debit('Input SGST', sgst));
  if (igst) entries.push(debit('Input IGST', igst));

  return {
    type: 'Purchase',
    date: tallyDate(purchase.date),
    number: purchase.number || purchase.id,
    party,
    narration: purchase.narration || '',
    entries,
  };
}

const entryXml = (e) => [
  '   <ALLLEDGERENTRIES.LIST>',
  `    <LEDGERNAME>${esc(e.ledger)}</LEDGERNAME>`,
  `    <ISDEEMEDPOSITIVE>${e.deemedPositive ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`,
  `    <AMOUNT>${e.amount.toFixed(2)}</AMOUNT>`,
  '   </ALLLEDGERENTRIES.LIST>',
].join('\n');

/** One <VOUCHER>. */
export function voucherXml(v) {
  return [
    `  <VOUCHER VCHTYPE="${esc(v.type)}" ACTION="Create" OBJVIEW="Invoice Voucher View">`,
    `   <DATE>${v.date}</DATE>`,
    `   <EFFECTIVEDATE>${v.date}</EFFECTIVEDATE>`,
    `   <VOUCHERTYPENAME>${esc(v.type)}</VOUCHERTYPENAME>`,
    `   <VOUCHERNUMBER>${esc(v.number)}</VOUCHERNUMBER>`,
    `   <PARTYLEDGERNAME>${esc(v.party)}</PARTYLEDGERNAME>`,
    `   <NARRATION>${esc(v.narration)}</NARRATION>`,
    v.entries.map(entryXml).join('\n'),
    '  </VOUCHER>',
  ].join('\n');
}

/** A party as a Tally ledger master, under Sundry Debtors/Creditors. */
export function ledgerXml(party, { group = 'Sundry Debtors' } = {}) {
  const lines = [
    `  <LEDGER NAME="${esc(party.name)}" ACTION="Create">`,
    `   <NAME>${esc(party.name)}</NAME>`,
    `   <PARENT>${esc(group)}</PARENT>`,
  ];
  if (party.gst_no) {
    lines.push('   <ISGSTAPPLICABLE>Yes</ISGSTAPPLICABLE>');
    lines.push(`   <PARTYGSTIN>${esc(party.gst_no)}</PARTYGSTIN>`);
  }
  if (party.state) lines.push(`   <LEDSTATENAME>${esc(party.state)}</LEDSTATENAME>`);
  if (party.address) lines.push(`   <ADDRESS>${esc(party.address)}</ADDRESS>`);
  lines.push('  </LEDGER>');
  return lines.join('\n');
}

const envelope = (reportName, inner) => [
  '<ENVELOPE>',
  ' <HEADER>',
  '  <TALLYREQUEST>Import Data</TALLYREQUEST>',
  ' </HEADER>',
  ' <BODY>',
  '  <IMPORTDATA>',
  '   <REQUESTDESC>',
  `    <REPORTNAME>${reportName}</REPORTNAME>`,
  '   </REQUESTDESC>',
  '   <REQUESTDATA>',
  inner,
  '   </REQUESTDATA>',
  '  </IMPORTDATA>',
  ' </BODY>',
  '</ENVELOPE>',
].join('\n');

/**
 * The whole file.
 *
 * Throws rather than returns on an unbalanced voucher. Tally would reject that
 * voucher at the end of a long import, after everything before it had already
 * gone in — a half-imported year is far more expensive to unpick than a file
 * that refuses to be written.
 */
export function buildTallyXml({ vouchers = [], parties = [] } = {}) {
  const broken = vouchers
    .map((v) => ({ v, off: voucherImbalance(v) }))
    .filter(({ off }) => off !== 0);
  if (broken.length) {
    const first = broken[0];
    throw new Error(
      `Voucher ${first.v.number} does not balance (off by ${first.off.toFixed(2)}). `
      + `${broken.length} of ${vouchers.length} vouchers are affected; nothing was written.`,
    );
  }

  const messages = [
    ...parties.map((p) => `  <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${ledgerXml(p)}\n  </TALLYMESSAGE>`),
    ...vouchers.map((v) => `  <TALLYMESSAGE xmlns:UDF="TallyUDF">\n${voucherXml(v)}\n  </TALLYMESSAGE>`),
  ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n${envelope('All Masters', messages)}\n`;
}

export function tallyFileName(shopName = 'shop', from = '', to = '') {
  const slug = String(shopName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
  const range = from && to ? `-${from}-to-${to}` : '';
  return `tally-${slug}${range}.xml`;
}
