/**
 * gstReporting.js
 * ---------------
 * Utilities for building GSTR-1 and GSTR-3B returns from operational data.
 * India-specific: CGST + SGST (intra-state) vs IGST (inter-state).
 */

import { round2, formatINR } from './financialCalculations';

// Indian state codes (GST state codes per GST Act)
export const STATE_CODES = {
  'JAMMU AND KASHMIR': '01', 'HIMACHAL PRADESH': '02', 'PUNJAB': '03',
  'CHANDIGARH': '04', 'UTTARAKHAND': '05', 'HARYANA': '06', 'DELHI': '07',
  'RAJASTHAN': '08', 'UTTAR PRADESH': '09', 'BIHAR': '10', 'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12', 'NAGALAND': '13', 'MANIPUR': '14',
  'MIZORAM': '15', 'TRIPURA': '16', 'MEGHALAYA': '17', 'ASSAM': '18',
  'WEST BENGAL': '19', 'JHARKHAND': '20', 'ODISHA': '21',
  'CHHATTISGARH': '22', 'MADHYA PRADESH': '23', 'GUJARAT': '24',
  'DAMAN AND DIU': '25', 'DADRA AND NAGAR HAVELI': '26', 'MAHARASHTRA': '27',
  'ANDHRA PRADESH': '28', 'KARNATAKA': '29', 'GOA': '30', 'LAKSHADWEEP': '31',
  'KERALA': '32', 'TAMIL NADU': '33', 'PUDUCHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35', 'TELANGANA': '36',
  'ANDHRA PRADESH (NEW)': '37', 'LADAKH': '38',
};

// Standard GST slabs in India
export const GST_RATES = [0, 5, 12, 18, 28];

// B2CL threshold — inter-state sales > ₹2.5L to unregistered go into B2CL section
export const B2CL_THRESHOLD = 250000;

// ---- Helpers ----

export const getStateCode = (state = '') => {
  const key = String(state || '').trim().toUpperCase();
  return STATE_CODES[key] || '';
};

export const isInterstate = (businessState = '', clientState = '') => {
  if (!clientState) return false;
  return String(businessState || '').trim().toLowerCase() !==
         String(clientState || '').trim().toLowerCase();
};

// Is a GSTIN present and valid-looking (15 chars: 2 state + 10 PAN + 1 entity + 1 Z + 1 check)
export const hasValidGSTIN = (gstin) => {
  if (!gstin) return false;
  const v = String(gstin).trim().toUpperCase().replace(/\s/g, '');
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
};

// Extract state code from GSTIN (first 2 digits)
export const stateFromGSTIN = (gstin) => {
  if (!gstin) return '';
  return String(gstin).trim().substring(0, 2);
};

// ---- Build tax lines from a sale ----
// A sale = one invoice. If sale.items exists we use per-item tax rates;
// otherwise we derive tax from sale-level subtotal/tax/totalAmount fields.
//
// NOTE: The `sales` table stores client info in a JSONB `customerInfo` field,
// not as a foreign key column. Items may lack taxRate — default 18%.
export const buildTaxLinesFromSale = (sale, { businessState = '', clients = [] } = {}) => {
  // Client lookup — customerInfo is a JSONB blob: { id, name, gstin, state, ... }
  const customerId =
    sale.customerInfo?.id ||
    sale.customerInfo?.clientId ||
    sale.clientId ||
    sale.client_id ||
    null;
  const client = customerId ? clients.find((c) => c.id === customerId) : null;

  const clientGSTIN =
    client?.gstin || client?.gst_no ||
    sale.customerInfo?.gstin || sale.customerInfo?.gst_no ||
    sale.gstin || '';
  const clientState =
    client?.state ||
    sale.customerInfo?.state ||
    sale.client_state || '';

  const isB2B = hasValidGSTIN(clientGSTIN);
  const interstate = isInterstate(businessState, clientState);

  // Sale-level amounts (may be null for older records)
  const directSubtotal = Number(sale.subtotal) || 0;
  const directTax     = Number(sale.tax) || 0;
  const directTotal   = Number(sale.totalAmount) || 0;

  const hasItems = Array.isArray(sale.items) && sale.items.length > 0;

  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  const byRate = {}; // taxRate -> { taxable, cgst, sgst, igst }
  const byHSN = {};  // key -> { hsn, taxRate, uqc, qty, taxable, cgst, sgst, igst }

  if (hasItems) {
    sale.items.forEach((item) => {
      const qty      = Number(item.qty ?? item.quantity) || 1;
      const rate     = Number(item.rate ?? item.sellingPrice ?? item.price) || 0;
      const discount = Number(item.discount ?? 0);
      // Items may not carry taxRate — fall back to sale-level tax rate or 18%
      const taxRate  = Number(item.taxRate ?? item.tax_rate ?? sale.taxRate ?? 18);
      const hsn      = String(item.hsn_code || item.hsn || '---');
      const uqc      = String(item.uqc || item.unit || 'NOS').toUpperCase();

      const itemTaxable = qty * rate - discount;
      const taxAmt      = (itemTaxable * taxRate) / 100;

      let itemCgst = 0, itemSgst = 0, itemIgst = 0;
      if (interstate) {
        itemIgst = taxAmt;
      } else {
        itemCgst = taxAmt / 2;
        itemSgst = taxAmt / 2;
      }

      taxable += itemTaxable;
      cgst    += itemCgst;
      sgst    += itemSgst;
      igst    += itemIgst;

      // By rate
      if (!byRate[taxRate]) byRate[taxRate] = { taxRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      byRate[taxRate].taxable += itemTaxable;
      byRate[taxRate].cgst    += itemCgst;
      byRate[taxRate].sgst    += itemSgst;
      byRate[taxRate].igst    += itemIgst;

      // By HSN
      const hsnKey = `${hsn}|${taxRate}|${uqc}`;
      if (!byHSN[hsnKey]) {
        byHSN[hsnKey] = { hsn, taxRate, uqc, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      }
      byHSN[hsnKey].qty     += qty;
      byHSN[hsnKey].taxable += itemTaxable;
      byHSN[hsnKey].cgst    += itemCgst;
      byHSN[hsnKey].sgst    += itemSgst;
      byHSN[hsnKey].igst    += itemIgst;
    });

    // If items had no taxRate info (computed tax = 0) but DB has tax amount, use it
    if (taxable > 0 && (cgst + sgst + igst === 0) && directTax > 0) {
      if (interstate) {
        igst = directTax;
      } else {
        cgst = directTax / 2;
        sgst = directTax / 2;
      }
      // Re-assign to byRate/byHSN totals at 18% bucket
      const key18 = 18;
      if (!byRate[key18]) byRate[key18] = { taxRate: key18, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      byRate[key18].taxable += taxable;
      byRate[key18].cgst    += cgst;
      byRate[key18].sgst    += sgst;
      byRate[key18].igst    += igst;
    }
  } else {
    // No items array — derive from sale-level fields
    if (directSubtotal > 0) {
      taxable = directSubtotal;
      const taxAmt = directTax > 0 ? directTax : directSubtotal * 0.18;
      if (interstate) { igst = taxAmt; } else { cgst = taxAmt / 2; sgst = taxAmt / 2; }
    } else if (directTotal > 0) {
      // Inclusive total — back-calculate assuming 18%
      taxable = directTotal / 1.18;
      const taxAmt = directTotal - taxable;
      if (interstate) { igst = taxAmt; } else { cgst = taxAmt / 2; sgst = taxAmt / 2; }
    }
    const fallbackRate = 18;
    byRate[fallbackRate] = { taxRate: fallbackRate, taxable: round2(taxable), cgst: round2(cgst), sgst: round2(sgst), igst: round2(igst) };
    byHSN['---|18|NOS'] = { hsn: '---', taxRate: fallbackRate, uqc: 'NOS', qty: 1, taxable: round2(taxable), cgst: round2(cgst), sgst: round2(sgst), igst: round2(igst) };
  }

  const invoiceValue = taxable + cgst + sgst + igst;

  return {
    saleId: sale.id,
    // sales table uses `id` as invoice identifier — no separate invoice_number column
    invoiceNo: sale.invoice_number || sale.invoiceNo || sale.id || '',
    date: sale.date,
    clientName: client?.name || sale.customerInfo?.name || sale.client_name || 'Walk-in',
    clientGSTIN,
    clientState,
    stateCode: getStateCode(clientState),
    isB2B,
    isInterstate: interstate,
    taxable: round2(taxable),
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    invoiceValue: round2(invoiceValue),
    byRate: Object.values(byRate).map((r) => ({
      ...r,
      taxable: round2(r.taxable),
      cgst: round2(r.cgst),
      sgst: round2(r.sgst),
      igst: round2(r.igst),
    })),
    byHSN: Object.values(byHSN).map((h) => ({
      ...h,
      taxable: round2(h.taxable),
      cgst: round2(h.cgst),
      sgst: round2(h.sgst),
      igst: round2(h.igst),
    })),
  };
};

// ---- Build tax lines from a formal Invoice row ----
// Invoices created via InvoiceBuilder store CGST/SGST/IGST directly.
// This is more accurate than deriving from sales items.
export const buildTaxLinesFromInvoice = (inv, { businessState = '', clients = [] } = {}) => {
  const client = clients.find((c) => c.id === inv.client_id) || null;
  const clientGSTIN = client?.gstin || client?.gst_no || '';
  const clientState  = client?.state || '';
  const isB2B        = hasValidGSTIN(clientGSTIN);
  const interstate   = inv.is_interstate ?? isInterstate(businessState, clientState);

  const taxable      = round2(Number(inv.taxable_amount) || 0);
  const cgst         = round2(Number(inv.cgst_amount) || 0);
  const sgst         = round2(Number(inv.sgst_amount) || 0);
  const igst         = round2(Number(inv.igst_amount) || 0);
  const invoiceValue = round2(Number(inv.grand_total) || (taxable + cgst + sgst + igst));

  // HSN / rate from items if present
  const byRate = {};
  const byHSN  = {};
  const rawItems = Array.isArray(inv.items) && inv.items.length ? inv.items : [];

  if (rawItems.length > 0) {
    rawItems.forEach((item) => {
      const qty       = Number(item.qty ?? item.quantity) || 1;
      const rate      = Number(item.rate ?? item.sellingPrice ?? item.price) || 0;
      const discount  = Number(item.discount ?? 0);
      const taxRate   = Number(item.taxRate ?? item.tax_rate ?? 18);
      const hsn       = String(item.hsn_code || item.hsn || '---');
      const uqc       = String(item.uqc || item.unit || 'NOS').toUpperCase();
      const itemTax   = round2((rate * qty - discount) * taxRate / 100);
      const itemTaxable = round2(rate * qty - discount);
      const itemCgst  = interstate ? 0 : round2(itemTax / 2);
      const itemSgst  = interstate ? 0 : round2(itemTax / 2);
      const itemIgst  = interstate ? itemTax : 0;

      if (!byRate[taxRate]) byRate[taxRate] = { taxRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      byRate[taxRate].taxable += itemTaxable;
      byRate[taxRate].cgst    += itemCgst;
      byRate[taxRate].sgst    += itemSgst;
      byRate[taxRate].igst    += itemIgst;

      const hsnKey = `${hsn}|${taxRate}|${uqc}`;
      if (!byHSN[hsnKey]) byHSN[hsnKey] = { hsn, taxRate, uqc, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      byHSN[hsnKey].qty     += qty;
      byHSN[hsnKey].taxable += itemTaxable;
      byHSN[hsnKey].cgst    += itemCgst;
      byHSN[hsnKey].sgst    += itemSgst;
      byHSN[hsnKey].igst    += itemIgst;
    });
  } else {
    // No items — use stored total tax split at 18%
    const fallbackRate = 18;
    byRate[fallbackRate] = { taxRate: fallbackRate, taxable, cgst, sgst, igst };
    byHSN['---|18|NOS']  = { hsn: '---', taxRate: fallbackRate, uqc: 'NOS', qty: 1, taxable, cgst, sgst, igst };
  }

  return {
    saleId: inv.sale_id || inv.id,
    invoiceNo: inv.invoice_number || inv.id,
    date: inv.invoice_date || (inv.date ? String(inv.date).split('T')[0] : ''),
    clientName: client?.name || inv.client_name || 'Walk-in',
    clientGSTIN,
    clientState,
    stateCode: getStateCode(clientState),
    isB2B,
    isInterstate: interstate,
    taxable,
    cgst,
    sgst,
    igst,
    invoiceValue,
    byRate: Object.values(byRate).map((r) => ({ ...r, taxable: round2(r.taxable), cgst: round2(r.cgst), sgst: round2(r.sgst), igst: round2(r.igst) })),
    byHSN:  Object.values(byHSN).map((h) => ({ ...h, taxable: round2(h.taxable), cgst: round2(h.cgst), sgst: round2(h.sgst), igst: round2(h.igst) })),
  };
};

// ---- GSTR-1 section builders ----

/**
 * Returns object with sections:
 *   b2b:   B2B invoices (to registered buyers)
 *   b2cl:  Inter-state B2C invoices > ₹2.5L
 *   b2cs:  Intra-state B2C + small inter-state (grouped by state & rate)
 *   hsn:   HSN-wise summary
 *   docs:  Document-issued summary
 *   totals: Grand totals
 */
export const buildGSTR1 = (sales = [], { businessState = '', clients = [], invoices = [] } = {}) => {
  // Prefer invoice rows (have accurate stored CGST/SGST/IGST) over re-deriving from sales.
  // Build a Set of sale_ids covered by invoices to avoid double-counting.
  const invoiceSaleIds = new Set(invoices.map((inv) => inv.sale_id).filter(Boolean));

  const invoiceLines = invoices.map((inv) =>
    buildTaxLinesFromInvoice(inv, { businessState, clients })
  );

  // Only process sales that don't have a corresponding invoice
  const saleLinesOnly = sales
    .filter((s) => !invoiceSaleIds.has(s.id))
    .map((s) => buildTaxLinesFromSale(s, { businessState, clients }));

  const lines = [...invoiceLines, ...saleLinesOnly];

  const b2b = [];
  const b2cl = [];
  const b2csMap = {}; // key: state|rate
  const hsnMap = {};  // key: hsn|rate|uqc
  let invoiceCount = 0;

  lines.forEach((l) => {
    invoiceCount++;

    if (l.isB2B) {
      b2b.push({
        gstin: l.clientGSTIN,
        invoiceNo: l.invoiceNo,
        date: l.date,
        invoiceValue: l.invoiceValue,
        placeOfSupply: `${l.stateCode} - ${l.clientState}`,
        reverseCharge: 'N',
        invoiceType: 'Regular',
        taxRate: l.byRate[0]?.taxRate || 18,
        taxable: l.taxable,
        cgst: l.cgst,
        sgst: l.sgst,
        igst: l.igst,
      });
    } else if (l.isInterstate && l.invoiceValue > B2CL_THRESHOLD) {
      b2cl.push({
        invoiceNo: l.invoiceNo,
        date: l.date,
        invoiceValue: l.invoiceValue,
        placeOfSupply: `${l.stateCode} - ${l.clientState}`,
        taxRate: l.byRate[0]?.taxRate || 18,
        taxable: l.taxable,
        igst: l.igst,
        cess: 0,
      });
    } else {
      // B2CS — group by state + rate
      l.byRate.forEach((r) => {
        const key = `${l.stateCode || 'INTRA'}|${r.taxRate}`;
        if (!b2csMap[key]) {
          b2csMap[key] = {
            type: l.isInterstate ? 'Inter-State' : 'Intra-State',
            stateCode: l.stateCode,
            state: l.clientState || 'Within State',
            taxRate: r.taxRate,
            taxable: 0, cgst: 0, sgst: 0, igst: 0,
            invoices: 0,
          };
        }
        b2csMap[key].taxable += r.taxable;
        b2csMap[key].cgst += r.cgst;
        b2csMap[key].sgst += r.sgst;
        b2csMap[key].igst += r.igst;
        b2csMap[key].invoices += 1;
      });
    }

    // HSN summary
    l.byHSN.forEach((h) => {
      const key = `${h.hsn}|${h.taxRate}|${h.uqc}`;
      if (!hsnMap[key]) {
        hsnMap[key] = {
          hsn: h.hsn, description: '', uqc: h.uqc, taxRate: h.taxRate,
          qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalValue: 0,
        };
      }
      hsnMap[key].qty += h.qty;
      hsnMap[key].taxable += h.taxable;
      hsnMap[key].cgst += h.cgst;
      hsnMap[key].sgst += h.sgst;
      hsnMap[key].igst += h.igst;
      hsnMap[key].totalValue += h.taxable + h.cgst + h.sgst + h.igst;
    });
  });

  const b2cs = Object.values(b2csMap).map((r) => ({
    ...r,
    taxable: round2(r.taxable),
    cgst: round2(r.cgst),
    sgst: round2(r.sgst),
    igst: round2(r.igst),
  }));

  const hsn = Object.values(hsnMap).map((h) => ({
    ...h,
    taxable: round2(h.taxable),
    cgst: round2(h.cgst),
    sgst: round2(h.sgst),
    igst: round2(h.igst),
    totalValue: round2(h.totalValue),
  }));

  const docs = [
    {
      natureOfDoc: 'Invoices for outward supply',
      from: b2b[0]?.invoiceNo || b2cl[0]?.invoiceNo || '—',
      to: lines[lines.length - 1]?.invoiceNo || '—',
      total: invoiceCount,
      cancelled: 0,
      net: invoiceCount,
    },
  ];

  // Grand totals
  const totals = {
    taxable: round2(lines.reduce((a, l) => a + l.taxable, 0)),
    cgst: round2(lines.reduce((a, l) => a + l.cgst, 0)),
    sgst: round2(lines.reduce((a, l) => a + l.sgst, 0)),
    igst: round2(lines.reduce((a, l) => a + l.igst, 0)),
    invoiceValue: round2(lines.reduce((a, l) => a + l.invoiceValue, 0)),
    invoiceCount,
  };

  return { b2b, b2cl, b2cs, hsn, docs, totals, lines };
};

// ---- GSTR-1 Portal JSON export ----
/**
 * Converts buildGSTR1() output to the official GST Portal JSON schema.
 * The resulting file can be uploaded at https://gst.gov.in → Returns → GSTR-1.
 *
 * @param {object} gstr1       - Output of buildGSTR1()
 * @param {object} opts
 * @param {string} opts.gstin  - Taxpayer GSTIN (15 chars)
 * @param {string} opts.fp     - Filing period "MMYYYY" e.g. "042025"
 */
export const buildGSTR1PortalJSON = (gstr1, { gstin = '', fp = '' } = {}) => {
  const fmtDate = (d) => {
    if (!d) return '';
    // Accept ISO (2025-04-01) → DD-MM-YYYY
    const [y, m, day] = d.split('T')[0].split('-');
    return day ? `${day}-${m}-${y}` : d;
  };

  // B2B — group invoices by GSTIN (ctin)
  const b2bMap = {};
  gstr1.b2b.forEach((inv, idx) => {
    if (!b2bMap[inv.gstin]) b2bMap[inv.gstin] = { ctin: inv.gstin, inv: [] };
    b2bMap[inv.gstin].inv.push({
      inum: inv.invoiceNo,
      idt:  fmtDate(inv.date),
      val:  round2(inv.invoiceValue),
      pos:  (inv.placeOfSupply || '').split(' ')[0], // extract state code
      rchrg: inv.reverseCharge || 'N',
      inv_typ: 'R',
      itms: [
        {
          num: 1,
          itm_det: {
            txval: round2(inv.taxable),
            rt:    inv.taxRate || 18,
            camt:  round2(inv.cgst),
            samt:  round2(inv.sgst),
            iamt:  round2(inv.igst),
            csamt: 0,
          },
        },
      ],
    });
  });

  // B2CL
  const b2cl = gstr1.b2cl.map((inv) => ({
    pos: (inv.placeOfSupply || '').split(' ')[0],
    inv: [
      {
        inum: inv.invoiceNo,
        idt:  fmtDate(inv.date),
        val:  round2(inv.invoiceValue),
        itms: [
          {
            num: 1,
            itm_det: {
              txval: round2(inv.taxable),
              rt:    inv.taxRate || 18,
              iamt:  round2(inv.igst),
              csamt: 0,
            },
          },
        ],
      },
    ],
  }));

  // B2CS
  const b2cs = gstr1.b2cs.map((r) => ({
    sply_ty: r.type === 'Inter-State' ? 'INTER' : 'INTRA',
    pos:     r.stateCode || '',
    typ:     'OE',
    rt:      r.taxRate,
    txval:   round2(r.taxable),
    iamt:    round2(r.igst),
    camt:    round2(r.cgst),
    samt:    round2(r.sgst),
    csamt:   0,
  }));

  // HSN Summary (section 12)
  const hsnData = gstr1.hsn.map((h, idx) => ({
    num:    idx + 1,
    hsn_sc: h.hsn,
    desc:   h.description || '',
    uqc:    h.uqc || 'NOS',
    qty:    round2(h.qty),
    val:    round2(h.totalValue),
    txval:  round2(h.taxable),
    iamt:   round2(h.igst),
    camt:   round2(h.cgst),
    samt:   round2(h.sgst),
    csamt:  0,
  }));

  // Doc issue (section 13)
  const docDet = gstr1.docs.map((d, idx) => ({
    doc_num: idx + 1,
    docs: [
      {
        num:       1,
        from:      d.from || '',
        to:        d.to   || '',
        totnum:    d.total || 0,
        cancel:    d.cancelled || 0,
        net_issue: d.net || 0,
      },
    ],
  }));

  return {
    gstin,
    fp,
    gt:     round2(gstr1.totals.invoiceValue),
    cur_gt: round2(gstr1.totals.invoiceValue),
    b2b:    Object.values(b2bMap),
    b2cl,
    b2cs,
    hsn:    { data: hsnData },
    doc_issue: { doc_det: docDet },
  };
};

/**
 * Trigger browser download of a JSON blob.
 */
export const downloadGSTR1JSON = (gstr1, { gstin, fp, filename } = {}) => {
  const payload = buildGSTR1PortalJSON(gstr1, { gstin, fp });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename || `GSTR1_${gstin}_${fp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
};

// ---- GSTR-3B builder ----
/**
 * GSTR-3B is a summary return. We aggregate outward supplies by taxability
 * and compute estimated ITC from purchases.
 */
export const buildGSTR3B = (sales = [], purchases = [], expenses = [], { businessState = '', clients = [], invoices = [] } = {}) => {
  const gstr1 = buildGSTR1(sales, { businessState, clients, invoices });

  // 3.1(a) Outward taxable supplies (other than zero/nil/exempted)
  const taxableSupplies = gstr1.totals;

  // 3.2 Inter-state supplies to unregistered / composition / UIN
  const interStateSupplies = gstr1.lines
    .filter((l) => l.isInterstate && !l.isB2B)
    .map((l) => ({
      recipientType: 'Unregistered',
      placeOfSupply: l.clientState || 'Unknown',
      taxable: l.taxable,
      igst: l.igst,
    }));

  // 4. Eligible ITC — from purchases.
  // purchases table has no tax_rate or supplier_state columns.
  // Assume intra-state supply at 18% to derive approximate ITC (conservative).
  const itcByType = { centralTax: 0, stateTax: 0, integratedTax: 0, cess: 0 };
  purchases.forEach((p) => {
    const amt      = Number(p.total_amount ?? p.amount) || 0;
    const taxRate  = Number(p.tax_rate ?? p.taxRate ?? 18); // fallback 18%
    const supplierState = p.supplier_state || '';
    const isInter  = supplierState ? isInterstate(businessState, supplierState) : false;
    // Back-calculate: total_amount is typically inclusive of GST
    const taxableAmt = amt / (1 + taxRate / 100);
    const tax = amt - taxableAmt;
    if (isInter) {
      itcByType.integratedTax += tax;
    } else {
      itcByType.centralTax += tax / 2;
      itcByType.stateTax   += tax / 2;
    }
  });

  // Round
  Object.keys(itcByType).forEach((k) => { itcByType[k] = round2(itcByType[k]); });

  // 6.1 — Tax payable
  const taxPayable = {
    integratedTax: round2(Math.max(taxableSupplies.igst - itcByType.integratedTax, 0)),
    centralTax: round2(Math.max(taxableSupplies.cgst - itcByType.centralTax, 0)),
    stateTax: round2(Math.max(taxableSupplies.sgst - itcByType.stateTax, 0)),
    cess: 0,
  };

  // Total tax liability (gross, before ITC)
  const grossTax = round2(taxableSupplies.cgst + taxableSupplies.sgst + taxableSupplies.igst);
  const totalITC = round2(itcByType.centralTax + itcByType.stateTax + itcByType.integratedTax);
  const netTaxDue = round2(
    taxPayable.integratedTax + taxPayable.centralTax + taxPayable.stateTax + taxPayable.cess
  );

  return {
    // Section 3.1
    section3_1: [
      { row: '(a) Outward taxable supplies', taxable: taxableSupplies.taxable, integratedTax: taxableSupplies.igst, centralTax: taxableSupplies.cgst, stateTax: taxableSupplies.sgst, cess: 0 },
      { row: '(b) Outward taxable supplies (zero rated)', taxable: 0, integratedTax: 0, centralTax: 0, stateTax: 0, cess: 0 },
      { row: '(c) Other outward supplies (Nil rated, exempted)', taxable: 0, integratedTax: 0, centralTax: 0, stateTax: 0, cess: 0 },
      { row: '(d) Inward supplies liable to reverse charge', taxable: 0, integratedTax: 0, centralTax: 0, stateTax: 0, cess: 0 },
      { row: '(e) Non-GST outward supplies', taxable: 0, integratedTax: 0, centralTax: 0, stateTax: 0, cess: 0 },
    ],
    // Section 3.2
    section3_2: interStateSupplies,
    // Section 4 — ITC
    section4: [
      { row: '(A) ITC Available (whether in full or part)', integratedTax: itcByType.integratedTax, centralTax: itcByType.centralTax, stateTax: itcByType.stateTax, cess: 0 },
      { row: '(B) ITC Reversed', integratedTax: 0, centralTax: 0, stateTax: 0, cess: 0 },
      { row: '(C) Net ITC Available', integratedTax: itcByType.integratedTax, centralTax: itcByType.centralTax, stateTax: itcByType.stateTax, cess: 0 },
      { row: '(D) Ineligible ITC', integratedTax: 0, centralTax: 0, stateTax: 0, cess: 0 },
    ],
    // Section 5 — exempt/nil
    section5: [
      { row: 'From a supplier under composition scheme, Exempt, Nil rated', interstate: 0, intrastate: 0 },
      { row: 'Non-GST supply', interstate: 0, intrastate: 0 },
    ],
    // Section 6.1 — Tax payable
    section6_1: [
      { row: 'Integrated Tax', taxPayable: taxPayable.integratedTax, paidThroughITC: itcByType.integratedTax, paidInCash: Math.max(taxPayable.integratedTax, 0) },
      { row: 'Central Tax', taxPayable: taxPayable.centralTax, paidThroughITC: itcByType.centralTax, paidInCash: Math.max(taxPayable.centralTax, 0) },
      { row: 'State/UT Tax', taxPayable: taxPayable.stateTax, paidThroughITC: itcByType.stateTax, paidInCash: Math.max(taxPayable.stateTax, 0) },
      { row: 'Cess', taxPayable: 0, paidThroughITC: 0, paidInCash: 0 },
    ],
    summary: {
      grossTax,
      totalITC,
      netTaxDue,
      totalTurnover: taxableSupplies.taxable,
      invoiceCount: taxableSupplies.invoiceCount,
    },
  };
};
