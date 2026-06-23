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

  let taxable = 0, cgst = 0, sgst = 0, igst = 0, cess = 0;
  const byRate = {}; // taxRate -> { taxable, cgst, sgst, igst, cess }
  const byHSN = {};  // key -> { hsn, taxRate, uqc, qty, taxable, cgst, sgst, igst, cess }

  if (hasItems) {
    sale.items.forEach((item) => {
      const qty      = Number(item.qty ?? item.quantity) || 1;
      const rate     = Number(item.rate ?? item.sellingPrice ?? item.price) || 0;
      const discount = Number(item.discount ?? 0);
      // Items may not carry taxRate — fall back to sale-level tax rate or 18%
      const taxRate  = Number(item.taxRate ?? item.tax_rate ?? sale.taxRate ?? 18);
      // Compensation cess (ad-valorem %) — 0 unless the product is a cess good.
      const cessRate = Number(item.cess ?? item.cess_rate ?? 0);
      const hsn      = String(item.hsn_code || item.hsn || '---');
      const uqc      = String(item.uqc || item.unit || 'NOS').toUpperCase();

      const itemTaxable = qty * rate - discount;
      const taxAmt      = (itemTaxable * taxRate) / 100;
      const itemCess    = (itemTaxable * cessRate) / 100;

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
      cess    += itemCess;

      // By rate
      if (!byRate[taxRate]) byRate[taxRate] = { taxRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
      byRate[taxRate].taxable += itemTaxable;
      byRate[taxRate].cgst    += itemCgst;
      byRate[taxRate].sgst    += itemSgst;
      byRate[taxRate].igst    += itemIgst;
      byRate[taxRate].cess    += itemCess;

      // By HSN
      const hsnKey = `${hsn}|${taxRate}|${uqc}`;
      if (!byHSN[hsnKey]) {
        // Use the first product's name as a human-readable HSN description
        // (no HSN master in the app; the GST portal auto-fills the official one).
        byHSN[hsnKey] = { hsn, description: String(item.name || item.productName || '').trim(), taxRate, uqc, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
      }
      byHSN[hsnKey].qty     += qty;
      byHSN[hsnKey].taxable += itemTaxable;
      byHSN[hsnKey].cgst    += itemCgst;
      byHSN[hsnKey].sgst    += itemSgst;
      byHSN[hsnKey].igst    += itemIgst;
      byHSN[hsnKey].cess    += itemCess;
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

  const invoiceValue = taxable + cgst + sgst + igst + cess;

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
    cess: round2(cess),
    invoiceValue: round2(invoiceValue),
    byRate: Object.values(byRate).map((r) => ({
      ...r,
      taxable: round2(r.taxable),
      cgst: round2(r.cgst),
      sgst: round2(r.sgst),
      igst: round2(r.igst),
      cess: round2(r.cess || 0),
    })),
    byHSN: Object.values(byHSN).map((h) => ({
      ...h,
      taxable: round2(h.taxable),
      cgst: round2(h.cgst),
      sgst: round2(h.sgst),
      igst: round2(h.igst),
      cess: round2(h.cess || 0),
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
          hsn: h.hsn, description: h.description || '', uqc: h.uqc, taxRate: h.taxRate,
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
    cess: round2(lines.reduce((a, l) => a + (l.cess || 0), 0)),
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
    cess: round2(Math.max((taxableSupplies.cess || 0) - itcByType.cess, 0)),
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
      { row: '(a) Outward taxable supplies', taxable: taxableSupplies.taxable, integratedTax: taxableSupplies.igst, centralTax: taxableSupplies.cgst, stateTax: taxableSupplies.sgst, cess: round2(taxableSupplies.cess || 0) },
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

// ─────────────────────────────────────────────────────────────────────────────
// GSTR-2B reconciliation — parse the portal's auto-drafted 2B (JSON download)
// and reconcile it against the purchase register at supplier (GSTIN) level.
// (Invoice-level needs a supplier bill-number on purchases — not stored yet.)
// ─────────────────────────────────────────────────────────────────────────────
export const parseGSTR2B = (raw) => {
  let json;
  try { json = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return { byGstin: {}, count: 0, error: 'File is not valid JSON. Download the GSTR-2B JSON from the GST portal.' }; }

  // The portal nests B2B under data.docdata.b2b; tolerate a few shapes.
  const b2b = json?.data?.docdata?.b2b || json?.docdata?.b2b || json?.b2b || [];
  if (!Array.isArray(b2b)) return { byGstin: {}, count: 0, error: 'No B2B section found in this file.' };

  const byGstin = {};
  const invoices = [];   // flat invoice-level list for invoice-by-invoice match
  for (const sup of b2b) {
    const gstin = String(sup.ctin || sup.gstin || '').trim().toUpperCase();
    if (!gstin) continue;
    const supplierName = sup.trdnm || sup.trade_name || '';
    if (!byGstin[gstin]) byGstin[gstin] = { gstin, supplierName, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0, invoices: 0 };
    const r = byGstin[gstin];
    const invs = sup.inv || sup.invoices || [];
    for (const inv of invs) {
      let txv = 0, ig = 0, cg = 0, sg = 0, cs = 0;
      const items = inv.items || inv.itms || [];
      if (items.length) {
        for (const it of items) {
          const d = it.itm_det || it.det || it;
          txv += Number(d.txval) || 0; ig += Number(d.iamt) || 0;
          cg += Number(d.camt) || 0;  sg += Number(d.samt) || 0; cs += Number(d.csamt) || 0;
        }
      } else {
        txv = Number(inv.txval) || 0; ig = Number(inv.iamt) || 0;
        cg = Number(inv.camt) || 0;  sg = Number(inv.samt) || 0;
      }
      r.invoices += 1; r.total += Number(inv.val) || 0;
      r.taxable += txv; r.igst += ig; r.cgst += cg; r.sgst += sg; r.cess += cs;
      invoices.push({
        gstin, supplierName,
        inum: String(inv.inum || inv.invoice_number || '').trim(),
        date: inv.dt || inv.date || '',
        taxable: round2(txv), igst: round2(ig), cgst: round2(cg), sgst: round2(sg),
        itc: round2(ig + cg + sg), total: round2(Number(inv.val) || (txv + ig + cg + sg)),
      });
    }
  }
  Object.values(byGstin).forEach((r) => {
    ['taxable', 'igst', 'cgst', 'sgst', 'cess', 'total'].forEach((k) => { r[k] = round2(r[k]); });
  });
  return { byGstin, invoices, count: Object.keys(byGstin).length };
};

// Normalise an invoice number for matching (case/space/leading-zero tolerant).
const normInv = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/^0+/, '');

// books / twoB are arrays of { gstin, inum, supplierName, taxable, igst, cgst, sgst, itc }
export const reconcile2BInvoices = (books = [], twoB = []) => {
  const key = (g, i) => `${String(g).toUpperCase()}|${normInv(i)}`;
  const bMap = {}, tMap = {};
  books.forEach((b) => { bMap[key(b.gstin, b.inum)] = b; });
  twoB.forEach((t) => { tMap[key(t.gstin, t.inum)] = t; });

  const keys = new Set([...Object.keys(bMap), ...Object.keys(tMap)]);
  const rows = [];
  for (const k of keys) {
    const b = bMap[k], t = tMap[k];
    const bItc = b?.itc || 0, tItc = t?.itc || 0;
    const bTax = b?.taxable || 0, tTax = t?.taxable || 0;
    let status;
    if (b && !t) status = 'MISSING IN 2B';
    else if (!b && t) status = 'MISSING IN BOOKS';
    else status = (Math.abs(bTax - tTax) < 1 && Math.abs(bItc - tItc) < 1) ? 'MATCHED' : 'MISMATCH';
    rows.push({
      gstin: (b || t).gstin, supplier: b?.supplierName || t?.supplierName || '—',
      inum: b?.inum || t?.inum || '—',
      booksTaxable: round2(bTax), b2bTaxable: round2(tTax),
      booksItc: round2(bItc), b2bItc: round2(tItc), diff: round2(bItc - tItc), status,
    });
  }
  const order = { 'MISMATCH': 0, 'MISSING IN 2B': 1, 'MISSING IN BOOKS': 2, 'MATCHED': 3 };
  rows.sort((a, b) => (order[a.status] - order[b.status]) || a.gstin.localeCompare(b.gstin));
  const summary = {
    matched: rows.filter(r => r.status === 'MATCHED').length,
    mismatch: rows.filter(r => r.status === 'MISMATCH').length,
    missingIn2B: rows.filter(r => r.status === 'MISSING IN 2B').length,
    missingInBooks: rows.filter(r => r.status === 'MISSING IN BOOKS').length,
    booksItc: round2(rows.reduce((a, r) => a + r.booksItc, 0)),
    b2bItc: round2(rows.reduce((a, r) => a + r.b2bItc, 0)),
    atRiskItc: round2(rows.filter(r => r.status === 'MISSING IN 2B' || r.status === 'MISMATCH').reduce((a, r) => a + Math.max(0, r.booksItc - r.b2bItc), 0)),
  };
  return { rows, summary };
};

// books / twoB are maps keyed by GSTIN → { gstin, supplierName, taxable, igst, cgst, sgst }
export const reconcile2B = (books = {}, twoB = {}) => {
  const gstins = new Set([...Object.keys(books), ...Object.keys(twoB)]);
  const rows = [];
  for (const g of gstins) {
    const b = books[g];
    const t = twoB[g];
    const bTax = b?.taxable || 0, tTax = t?.taxable || 0;
    const bItc = (b?.igst || 0) + (b?.cgst || 0) + (b?.sgst || 0);
    const tItc = (t?.igst || 0) + (t?.cgst || 0) + (t?.sgst || 0);
    let status;
    if (b && !t) status = 'MISSING IN 2B';        // booked but supplier hasn't filed → ITC at risk
    else if (!b && t) status = 'MISSING IN BOOKS'; // in 2B but not recorded → unclaimed ITC
    else status = (Math.abs(bTax - tTax) < 1 && Math.abs(bItc - tItc) < 1) ? 'MATCHED' : 'MISMATCH';
    rows.push({
      gstin: g, supplier: b?.supplierName || t?.supplierName || '—',
      booksTaxable: round2(bTax), b2bTaxable: round2(tTax),
      booksItc: round2(bItc), b2bItc: round2(tItc),
      diff: round2(bItc - tItc), status,
    });
  }
  const order = { 'MISMATCH': 0, 'MISSING IN 2B': 1, 'MISSING IN BOOKS': 2, 'MATCHED': 3 };
  rows.sort((a, b) => (order[a.status] - order[b.status]) || (b.b2bItc - a.b2bItc));
  const summary = {
    matched: rows.filter(r => r.status === 'MATCHED').length,
    mismatch: rows.filter(r => r.status === 'MISMATCH').length,
    missingIn2B: rows.filter(r => r.status === 'MISSING IN 2B').length,
    missingInBooks: rows.filter(r => r.status === 'MISSING IN BOOKS').length,
    booksItc: round2(rows.reduce((a, r) => a + r.booksItc, 0)),
    b2bItc: round2(rows.reduce((a, r) => a + r.b2bItc, 0)),
    atRiskItc: round2(rows.filter(r => r.status === 'MISSING IN 2B' || r.status === 'MISMATCH').reduce((a, r) => a + Math.max(0, r.booksItc - r.b2bItc), 0)),
  };
  return { rows, summary };
};

// ─────────────────────────────────────────────────────────────────────────────
// GST credit set-off worksheet — applies the statutory utilisation order of
// Sec 49 / 49A / 49B (post-2019): IGST credit clears IGST then CGST then SGST;
// CGST credit clears CGST then IGST; SGST/UTGST credit clears SGST then IGST;
// Cess only against Cess. Returns ITC used + cash payable + closing ITC by head.
// Inputs are plain {igst,cgst,sgst,cess} liability + available-ITC objects.
// ─────────────────────────────────────────────────────────────────────────────
export const computeGstSetOff = (output = {}, itc = {}) => {
  let li = Number(output.igst) || 0, lc = Number(output.cgst) || 0,
      ls = Number(output.sgst) || 0, lcs = Number(output.cess) || 0;
  let ci = Number(itc.igst) || 0, cc = Number(itc.cgst) || 0,
      cs = Number(itc.sgst) || 0, ccs = Number(itc.cess) || 0;

  const take = (avail, due) => Math.min(avail, due);
  const u = { igstToIgst: 0, igstToCgst: 0, igstToSgst: 0, cgstToCgst: 0, cgstToIgst: 0, sgstToSgst: 0, sgstToIgst: 0, cessToCess: 0 };

  // 1. IGST credit → IGST, CGST, SGST (in that order)
  u.igstToIgst = take(ci, li); li -= u.igstToIgst; ci -= u.igstToIgst;
  u.igstToCgst = take(ci, lc); lc -= u.igstToCgst; ci -= u.igstToCgst;
  u.igstToSgst = take(ci, ls); ls -= u.igstToSgst; ci -= u.igstToSgst;
  // 2. CGST credit → CGST, then IGST
  u.cgstToCgst = take(cc, lc); lc -= u.cgstToCgst; cc -= u.cgstToCgst;
  u.cgstToIgst = take(cc, li); li -= u.cgstToIgst; cc -= u.cgstToIgst;
  // 3. SGST/UTGST credit → SGST, then IGST
  u.sgstToSgst = take(cs, ls); ls -= u.sgstToSgst; cs -= u.sgstToSgst;
  u.sgstToIgst = take(cs, li); li -= u.sgstToIgst; cs -= u.sgstToIgst;
  // 4. Cess → Cess only
  u.cessToCess = take(ccs, lcs); lcs -= u.cessToCess; ccs -= u.cessToCess;

  return {
    detail: u,
    itcUsed: {
      igst: round2(u.igstToIgst + u.cgstToIgst + u.sgstToIgst),
      cgst: round2(u.cgstToCgst + u.igstToCgst),
      sgst: round2(u.sgstToSgst + u.igstToSgst),
      cess: round2(u.cessToCess),
    },
    cash: { igst: round2(li), cgst: round2(lc), sgst: round2(ls), cess: round2(lcs) },
    itcClosing: { igst: round2(ci), cgst: round2(cc), sgst: round2(cs), cess: round2(ccs) },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Filing-pack exports — GST offline-tool Excel workbook, GSTR-3B portal JSON,
// and a "share with CA" WhatsApp summary. Added for the GST filing pack.
// ─────────────────────────────────────────────────────────────────────────────

const dl = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
};

/**
 * GSTR-1 Excel workbook matching the GST offline-tool template sheets:
 * b2b, b2cl, b2cs, hsn, docs. Headers follow the government template wording
 * so the offline tool's "Import Excel" maps columns without manual fixes.
 */
export const downloadGSTR1Excel = async (gstr1, { gstin = '', fp = '' } = {}) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const sheet = (name, headers, rows) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(14, String(h).length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  sheet('b2b', [
    'GSTIN/UIN of Recipient', 'Invoice Number', 'Invoice date', 'Invoice Value',
    'Place Of Supply', 'Reverse Charge', 'Invoice Type', 'Rate',
    'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax',
  ], (gstr1.b2b || []).map(r => [
    r.gstin, r.invoiceNo, r.date, round2(r.invoiceValue), r.placeOfSupply,
    r.reverseCharge || 'N', r.invoiceType || 'Regular', r.taxRate,
    round2(r.taxable), round2(r.igst), round2(r.cgst), round2(r.sgst),
  ]));

  sheet('b2cl', [
    'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply',
    'Rate', 'Taxable Value', 'Integrated Tax', 'Cess Amount',
  ], (gstr1.b2cl || []).map(r => [
    r.invoiceNo, r.date, round2(r.invoiceValue), r.placeOfSupply,
    r.taxRate, round2(r.taxable), round2(r.igst), round2(r.cess || 0),
  ]));

  sheet('b2cs', [
    'Type', 'Place Of Supply', 'Rate', 'Taxable Value',
    'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess Amount',
  ], (gstr1.b2cs || []).map(r => [
    r.type || (r.igst > 0 ? 'OE' : 'OE'), r.placeOfSupply, r.taxRate,
    round2(r.taxable), round2(r.igst || 0), round2(r.cgst || 0),
    round2(r.sgst || 0), 0,
  ]));

  sheet('hsn', [
    'HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value',
    'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount',
    'State/UT Tax Amount', 'Cess Amount', 'Rate',
  ], (gstr1.hsn || []).map(r => [
    r.hsn, r.description || '', r.uqc || 'NOS', round2(r.qty),
    round2((r.taxable || 0) + (r.cgst || 0) + (r.sgst || 0) + (r.igst || 0)),
    round2(r.taxable), round2(r.igst || 0), round2(r.cgst || 0),
    round2(r.sgst || 0), 0, r.taxRate,
  ]));

  sheet('docs', [
    'Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled',
  ], (gstr1.docs || []).map(r => [
    r.nature || 'Invoices for outward supply', r.from || '', r.to || '',
    r.total ?? r.count ?? 0, r.cancelled || 0,
  ]));

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  dl(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
     `GSTR1_${gstin || 'export'}_${fp}.xlsx`);
};

/** GSTR-3B portal JSON (sup_details 3.1 + itc_elg 4A summary). */
export const downloadGSTR3BJSON = (g3b, { gstin = '', fp = '' } = {}) => {
  const a = (g3b?.section3_1 || [])[0] || {};
  const t = { taxable: a.taxable, igst: a.integratedTax, cgst: a.centralTax, sgst: a.stateTax, exempt: 0 };
  const net = (g3b?.section4 || [])[2] || {};
  const itc = { integratedTax: net.integratedTax, centralTax: net.centralTax, stateTax: net.stateTax, cess: net.cess };
  const json = {
    gstin,
    ret_period: fp,
    sup_details: {
      osup_det: { // 3.1(a) outward taxable supplies
        txval: round2(t.taxable || 0),
        iamt:  round2(t.igst || 0),
        camt:  round2(t.cgst || 0),
        samt:  round2(t.sgst || 0),
        csamt: 0,
      },
      osup_zero:  { txval: 0, iamt: 0, csamt: 0 },
      osup_nil_exmp: { txval: round2(t.exempt || 0) },
      isup_rev:   { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 },
      osup_nongst: { txval: 0 },
    },
    itc_elg: {
      itc_avl: [
        { ty: 'OTH',
          iamt: round2(itc.integratedTax || 0),
          camt: round2(itc.centralTax || 0),
          samt: round2(itc.stateTax || 0),
          csamt: round2(itc.cess || 0) },
      ],
      itc_rev: [], itc_net: {
        iamt: round2(itc.integratedTax || 0),
        camt: round2(itc.centralTax || 0),
        samt: round2(itc.stateTax || 0),
        csamt: round2(itc.cess || 0),
      }, itc_inelg: [],
    },
  };
  dl(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }),
     `GSTR3B_${gstin || 'export'}_${fp}.json`);
};

/** GSTR-3B Excel summary (one-sheet, CA-friendly). */
export const downloadGSTR3BExcel = async (g3b, { gstin = '', fp = '' } = {}) => {
  const XLSX = await import('xlsx');
  const a = (g3b?.section3_1 || [])[0] || {};
  const t = { taxable: a.taxable, igst: a.integratedTax, cgst: a.centralTax, sgst: a.stateTax, exempt: 0 };
  const net = (g3b?.section4 || [])[2] || {};
  const itc = { integratedTax: net.integratedTax, centralTax: net.centralTax, stateTax: net.stateTax, cess: net.cess };
  const aoa = [
    ['GSTR-3B Summary', '', ''],
    ['GSTIN', gstin, ''],
    ['Period', fp, ''],
    [],
    ['Section', 'Description', 'Taxable Value', 'IGST', 'CGST', 'SGST'],
    ['3.1(a)', 'Outward taxable supplies', round2(t.taxable || 0), round2(t.igst || 0), round2(t.cgst || 0), round2(t.sgst || 0)],
    ['3.1(c)', 'Nil-rated / exempted', round2(t.exempt || 0), 0, 0, 0],
    [],
    ['4(A)', 'Eligible ITC (all other)', '', round2(itc.integratedTax || 0), round2(itc.centralTax || 0), round2(itc.stateTax || 0)],
    [],
    ['Net tax payable (outward − ITC)', '',
      '', round2((t.igst || 0) - (itc.integratedTax || 0)),
      round2((t.cgst || 0) - (itc.centralTax || 0)),
      round2((t.sgst || 0) - (itc.stateTax || 0))],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GSTR-3B');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  dl(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
     `GSTR3B_${gstin || 'export'}_${fp}.xlsx`);
};

/** Open WhatsApp with a filing summary for the CA (files go as a follow-up attach). */
export const shareGSTWithCA = ({ kind = 'GSTR-1', gstin = '', fp = '', totals = {} }) => {
  const msg = encodeURIComponent(
    `${kind} ready for filing\n` +
    `GSTIN: ${gstin}\nPeriod: ${fp}\n` +
    `Taxable: ₹${round2(totals.taxable || 0).toLocaleString('en-IN')}\n` +
    `CGST: ₹${round2(totals.cgst || 0).toLocaleString('en-IN')} · ` +
    `SGST: ₹${round2(totals.sgst || 0).toLocaleString('en-IN')} · ` +
    `IGST: ₹${round2(totals.igst || 0).toLocaleString('en-IN')}\n\n` +
    `Files exported from bookledger — attaching the Excel/JSON next.`
  );
  window.open(`https://wa.me/?text=${msg}`, '_blank');
};
