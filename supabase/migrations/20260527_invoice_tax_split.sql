-- GST hardening: convert_sale_to_invoice now splits sale tax into
-- cgst/sgst (intra-state) or igst (inter-state), enforces
-- grand_total = taxable + tax, and backfills existing rows.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-27.

-- Function update — see actual definition in repo / dashboard. The key
-- behaviour changes are: derive is_interstate from business vs client
-- state, split tax into cgst/sgst/igst, and clamp grand_total upward
-- when it was stored less than taxable + tax (legacy bug).

-- Backfill rules:
-- 2a. tax_total > 0 but cgst+sgst+igst = 0 → split by is_interstate.
-- 2b. cgst+sgst+igst > 0 but tax_total mismatched → sync tax_total.
-- 2c. grand_total < taxable + tax_total → bump grand_total.
