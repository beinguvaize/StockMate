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
export const validateItemPricing = (form = {}, { editing = false } = {}) => {
  const svc = isServiceForm(form);
  const cost = parseFloat(form.costPrice);
  const sell = parseFloat(form.sellingPrice);

  // On an edit the cost is read-only (it comes from purchases, see
  // editFieldsFor), so it cannot be demanded: an item with no purchases yet
  // would otherwise be impossible to save at all.
  if (!svc && !editing && !(cost > 0)) {
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
 * Columns an EDIT must never send.
 *
 *  · stock is owned by the database: inventory_balances, copied onto
 *    products.stock by a trigger. The form does not even show it; the value
 *    on the form is whatever was loaded when the page opened, so writing it
 *    back undid every sale and purchase made since.
 *  · costPrice is owned by recompute_product_cost (weighted average of the
 *    open batches). On an edit it is shown read-only.
 *
 * Create is different and is left alone: a new item has no balance and no
 * batches, so its opening figures go in with the insert.
 */
export const SERVER_OWNED_ON_EDIT = ['stock', 'costPrice'];

/** The row an edit saves: the create row minus the server-owned columns. */
export const editFieldsFor = (row = {}) => {
  const out = { ...row };
  for (const k of SERVER_OWNED_ON_EDIT) delete out[k];
  return out;
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
