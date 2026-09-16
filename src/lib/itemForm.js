/**
 * What the Add/Edit Item form will accept, as a pure function.
 *
 * Extracted so the rules can be tested rather than only observed by opening the
 * modal — the same reason reportPeriods.js and payrollPeriods.js exist. The bug
 * this was written for could only be seen by being a services tenant and
 * pressing Save: the form demanded a cost price for an item whose Cost Price
 * input it had already hidden, so the error named a field that was not on
 * screen and the save could never succeed.
 */

import { isService } from './productTypes';

/**
 * True when the form is in service mode.
 *
 * Either the whole tenant sells services, or this one item is a service — a
 * retail shop billing repair labour alongside stock is a real case, not an
 * edge one.
 */
export const isServiceForm = ({ businessType, product_type } = {}) =>
  String(businessType || '').toUpperCase() === 'SERVICES' || isService({ product_type });

/**
 * Validate the pricing fields. Returns an error string, or null when valid.
 *
 * Rules:
 *  · a service has no cost of goods, so cost price is not asked for and must
 *    not be demanded;
 *  · RAW material is bought, not sold, so it needs no selling price;
 *  · everything else needs both.
 */
export const validateItemPricing = (form = {}) => {
  const svc = isServiceForm(form);
  const cost = parseFloat(form.costPrice);
  const sell = parseFloat(form.sellingPrice);

  if (!svc && !(cost > 0)) {
    return 'Cost price is required and must be greater than 0.';
  }
  if (String(form.product_type || '').toUpperCase() !== 'RAW' && !(sell > 0)) {
    return svc
      ? 'Service price is required and must be greater than 0.'
      : 'Selling price is required and must be greater than 0.';
  }
  return null;
};

/**
 * The stock fields to persist. A service holds none.
 *
 * The threshold is null rather than 0 or 10: a service that carries a threshold
 * matches every low-stock test forever, and "there is nothing to be below" is
 * the honest value. Readers still guard with isStocked, but the data should not
 * depend on every one of them remembering.
 */
export const stockFieldsFor = (form = {}) =>
  isServiceForm(form)
    ? { stock: 0, lowStockThreshold: null }
    : {
        stock: parseInt(form.stock, 10) || 0,
        lowStockThreshold: parseInt(form.lowStockThreshold, 10) || 10,
      };

/**
 * What type a NEW item should start as, given the tenant's vertical.
 *
 * The form seeded 'STANDARD' unconditionally (and its reset branch omitted the
 * field altogether, leaving it undefined). In a SERVICES tenant the form then
 * *looked* like a service form — cost price hidden, duration shown — while the
 * saved row said STANDARD. Every row-level check downstream reads the stored
 * type, so the POS badge, the stock-gate bypass and the report guards would all
 * have missed it. Saveable but mis-typed is not fixed.
 *
 * Editing never calls this: an existing item keeps the type it was saved with.
 */
export const defaultProductType = (businessType) =>
  String(businessType || '').toUpperCase() === 'SERVICES' ? 'SERVICE' : 'STANDARD';
