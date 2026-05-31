/**
 * /embed/receipt/:saleId
 *
 * Pixel-perfect POSReceipt for a given sale, rendered in a bare shell
 * (no app chrome). Mobile WebView loads this URL, calls printToPdf,
 * and the resulting PDF matches what web shows on screen — single
 * source of truth for thermal-receipt layout.
 *
 * Auth: requires a valid Supabase session in the same browser context
 * (mobile WebView ships the JWT in localStorage before navigating).
 * Falls back to a friendly "Open in app" message otherwise.
 */
import React, { useEffect, useState } from 'react';
import html2canvas from 'html2canvas-pro';
import { useParams, useSearchParams } from 'react-router-dom';
import POSReceipt from '../../components/invoice/POSReceipt';
import { supabase } from '../../lib/supabase';

const saleToInvoice = (sale) => {
  const items = (sale.items || []).map(i => {
    const qty  = parseFloat(i.quantity || i.qty || 1);
    const rate = parseFloat(i.price || i.sellingPrice || i.rate || 0);
    const taxRate = parseFloat(i.taxRate ?? 0);
    const taxAmount = qty * rate * taxRate / 100;
    return {
      name:     i.name || i.productName || 'Item',
      sku:      i.sku || '',
      hsn_code: i.hsn_code || i.hsn || '---',
      qty, rate, taxRate, taxAmount,
      unit:  i.unit || 'PCS',
      total: qty * rate + taxAmount,
    };
  });
  const taxableAmt = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const totalTax   = items.reduce((s, i) => s + i.taxAmount, 0);
  const grandTotal = parseFloat(sale.totalAmount || taxableAmt + totalTax);
  return {
    id:             sale.id,
    invoice_number: sale.id?.split('-').pop() || sale.id,
    invoice_date:   sale.date,
    items,
    taxable_amount: taxableAmt,
    tax_total:      totalTax,
    cgst_amount:    totalTax / 2,
    sgst_amount:    totalTax / 2,
    grand_total:    grandTotal,
    paid_amount:    parseFloat(sale.paidAmount || 0),
    payment_status: (sale.paymentStatus === 'PAID') ? 'PAID' : 'UNPAID',
    round_off:      0,
  };
};

const ReceiptEmbed = () => {
  const { saleId } = useParams();
  const [params] = useSearchParams();
  const tendered = params.get('tendered') ? Number(params.get('tendered')) : null;

  const [state, setState] = useState({ loading: true, sale: null, client: null, business: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sale, error: sErr } = await supabase
          .from('sales').select('*').eq('id', saleId).maybeSingle();
        if (sErr) throw sErr;
        if (!sale) throw new Error('Sale not found');

        const [bizRes, cliRes] = await Promise.all([
          supabase.from('business_profile').select('*').eq('tenant_id', sale.tenant_id).maybeSingle(),
          sale.shopId
            ? supabase.from('clients').select('*').eq('id', sale.shopId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (cancelled) return;
        setState({ loading: false, sale, client: cliRes?.data || null, business: bizRes?.data || null, error: null });
      } catch (e) {
        if (!cancelled) setState({ loading: false, sale: null, client: null, business: null, error: String(e.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [saleId]);

  if (state.loading) {
    return <div style={{ padding: 24, fontFamily: 'monospace' }}>Loading receipt…</div>;
  }
  if (state.error) {
    return <div style={{ padding: 24, fontFamily: 'monospace', color: '#c00' }}>Error: {state.error}</div>;
  }

  // Signal readiness so the mobile WebPrintService can snapshot the
  // page only after data fetch + DOM render are done. Without this the
  // PDF often captures the "Loading…" frame and the user sees the
  // wrong layout because mobile silently falls back to its local pw
  // renderer.
  if (typeof window !== 'undefined') {
    window.__embedReady = true;
    // Expose an in-page renderer so mobile (Android in particular,
    // where WebView has no native PDF export) can request a base64
    // PNG of the full receipt rendered by the same React DOM that
    // web prints. Returns the data URL — Dart decodes + wraps in PDF.
    window.__renderToPng = async (opts = {}) => {
      const scale = opts.scale || (window.devicePixelRatio || 2);
      // Target only the receipt sheet itself (mounted directly when
      // POSReceipt is in bare mode). Falls back to the embed-ready
      // container if the sheet hasn't mounted yet — should never
      // happen because we only set __embedReady after render.
      const target =
        document.getElementById('pos-receipt-sheet') ||
        document.querySelector('[data-embed-ready="true"]') ||
        document.body;
      const canvas = await html2canvas(target, {
        scale,
        useCORS:         true,
        backgroundColor: '#ffffff',
        logging:         false,
      });
      // Hand back the captured element's CSS dimensions so the mobile
      // side can size the PDF page to the receipt itself — not the
      // whole viewport, which would otherwise leave large blank space
      // on the printed slip.
      const rect = target.getBoundingClientRect();
      return JSON.stringify({
        dataUrl: canvas.toDataURL('image/png'),
        cssW:    rect.width,
        cssH:    rect.height,
        scale,
      });
    };
  }

  return (
    <div data-embed-ready="true" style={{ background: '#fff', minHeight: '100vh', padding: 0 }}>
      <POSReceipt
        bare
        invoice={saleToInvoice(state.sale)}
        businessProfile={state.business || {}}
        client={state.client || { name: 'Walk-in' }}
        tendered={tendered}
        onClose={() => {}}
      />
    </div>
  );
};

export default ReceiptEmbed;
