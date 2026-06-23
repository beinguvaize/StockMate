// Single source of truth for per-line GST math. Both the live billing engine
// (gstEngine.calculateGST) and the report engine (gstReporting) call this so
// the tax split + cess can never drift between what's billed and what's filed.
//
// Inputs are already-resolved numbers (caller decides taxRate fallback and the
// intra/inter-state rule). Either an absolute discount or a percent may be
// given. Returns raw (un-rounded) figures — callers round at their own grain.
export const computeLineTax = ({
  qty = 0, rate = 0, discountAbs = 0, discountPercent = 0,
  taxRate = 0, cessRate = 0, interstate = false,
}) => {
  const gross = (Number(qty) || 0) * (Number(rate) || 0);
  const discount = discountPercent ? (gross * discountPercent) / 100 : (Number(discountAbs) || 0);
  const taxable = gross - discount;
  const tax = (taxable * (Number(taxRate) || 0)) / 100;
  const cess = (taxable * (Number(cessRate) || 0)) / 100;
  const cgst = interstate ? 0 : tax / 2;
  const sgst = interstate ? 0 : tax / 2;
  const igst = interstate ? tax : 0;
  return { gross, discount, taxable, tax, cgst, sgst, igst, cess };
};
