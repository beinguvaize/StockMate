// Single source of truth for per-line GST math. Both the live billing engine
// (gstEngine.calculateGST) and the report engine (gstReporting) call this so
// the tax split + cess can never drift between what's billed and what's filed.
//
// Inputs are already-resolved numbers (caller decides taxRate fallback and the
// intra/inter-state rule). Either an absolute discount or a percent may be
// given. Returns raw (un-rounded) figures — callers round at their own grain.
// `inclusive` means the rate the customer sees ALREADY CONTAINS the tax, so the
// tax is extracted out of it rather than added on top:
//
//   exclusive   taxable = 100, tax = 18, customer pays 118
//   inclusive   customer pays 100, taxable = 84.75, tax = 15.25
//
// This existed only inside the POS screen (InvoiceBuilder.jsx:637-645) and
// nowhere else, so every document built on calculateGST -- manual bill,
// quotation, proforma, challan, credit note -- could only ever be exclusive. A
// shop that prices inclusive of GST had to either overcharge its customer by
// the tax or hand-reverse the rate on every line. Putting it here rather than
// in a second place keeps what is billed and what is filed computed by one
// rule, which is the whole reason this file exists.
export const computeLineTax = ({
  qty = 0, rate = 0, discountAbs = 0, discountPercent = 0,
  taxRate = 0, cessRate = 0, interstate = false, inclusive = false,
}) => {
  const r = Number(taxRate) || 0;
  const cr = Number(cessRate) || 0;
  const gross = (Number(qty) || 0) * (Number(rate) || 0);
  const discount = discountPercent ? (gross * discountPercent) / 100 : (Number(discountAbs) || 0);
  const net = gross - discount;

  // Inclusive: strip the tax (and cess, which is levied the same way) out of
  // the money the customer hands over. Dividing by (1 + rate) is the exact
  // inverse of adding it, so an inclusive line and an exclusive line that
  // collect the same total agree to the paisa.
  const divisor = 1 + (r + cr) / 100;
  const taxable = inclusive && divisor !== 0 ? net / divisor : net;

  const tax = (taxable * r) / 100;
  const cess = (taxable * cr) / 100;
  const cgst = interstate ? 0 : tax / 2;
  const sgst = interstate ? 0 : tax / 2;
  const igst = interstate ? tax : 0;
  return { gross, discount, taxable, tax, cgst, sgst, igst, cess };
};
