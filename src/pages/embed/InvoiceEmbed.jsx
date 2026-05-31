/**
 * /embed/invoice/:invoiceId
 *
 * Pixel-perfect GST InvoiceTemplate for a given invoice row, rendered
 * bare (no app chrome). Mobile WebView loads this URL → printToPdf →
 * matches web exactly.
 */
import React, { useEffect, useState } from 'react';
import html2canvas from 'html2canvas-pro';
import { useParams } from 'react-router-dom';
import InvoiceTemplate from '../../components/invoice/InvoiceTemplate';
import { supabase } from '../../lib/supabase';

const InvoiceEmbed = () => {
  const { invoiceId } = useParams();
  const [state, setState] = useState({ loading: true, invoice: null, client: null, business: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: invoice, error: iErr } = await supabase
          .from('invoices').select('*').eq('id', invoiceId).maybeSingle();
        if (iErr) throw iErr;
        if (!invoice) throw new Error('Invoice not found');

        const [bizRes, cliRes] = await Promise.all([
          supabase.from('business_profile').select('*').eq('tenant_id', invoice.tenant_id).maybeSingle(),
          invoice.client_id
            ? supabase.from('clients').select('*').eq('id', invoice.client_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (cancelled) return;
        setState({ loading: false, invoice, client: cliRes?.data || null, business: bizRes?.data || null, error: null });
      } catch (e) {
        if (!cancelled) setState({ loading: false, invoice: null, client: null, business: null, error: String(e.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [invoiceId]);

  if (state.loading) {
    return <div style={{ padding: 24, fontFamily: 'monospace' }}>Loading invoice…</div>;
  }
  if (state.error) {
    return <div style={{ padding: 24, fontFamily: 'monospace', color: '#c00' }}>Error: {state.error}</div>;
  }

  // See ReceiptEmbed for why we expose a ready signal here.
  if (typeof window !== 'undefined') {
    window.__embedReady = true;
    window.__renderToPng = async (opts = {}) => {
      const scale = opts.scale || (window.devicePixelRatio || 2);
      // Target the invoice print sheet directly. InvoiceTemplate
      // renders into a portal mounted on document.body (so the
      // embed-ready wrapper doesn't contain it) and we want only the
      // A4 sheet — not the dark toolbar / zoom bar — in the captured
      // PNG. The wait loop below ensures the portal has actually
      // committed before we snapshot.
      let target = document.getElementById('invoice-print-area');
      const start = Date.now();
      while (!target && Date.now() - start < 2000) {
        await new Promise(r => setTimeout(r, 100));
        target = document.getElementById('invoice-print-area');
      }
      if (!target) {
        target = document.querySelector('[data-embed-ready="true"]') || document.body;
      }
      const canvas = await html2canvas(target, {
        scale,
        useCORS:         true,
        backgroundColor: '#ffffff',
        logging:         false,
      });
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
      {/* Strip InvoiceTemplate's portal chrome so the captured PNG
          contains only the printable A4 sheet. We hide the toolbar
          (close / zoom / share / print row) and the backdrop, and
          undo the scale transform on the sheet — but we deliberately
          do NOT change the scroller's overflow / display because
          flattening that block to display:block hid the sheet on
          some Android WebView builds (blank capture). */}
      <style>{`
        body { background: #fff !important; }
        #invoice-template-portal {
          position: static !important;
          inset: auto !important;
          background: #fff !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          overflow: visible !important;
        }
        /* Toolbar (action bar at the top of the portal). */
        #invoice-template-portal > .print-hidden { display: none !important; }
        /* Zoom transform off so the sheet renders at native A4. */
        #invoice-print-area {
          transform: none !important;
          box-shadow: none !important;
        }
      `}</style>
      <InvoiceTemplate
        invoice={state.invoice}
        businessProfile={state.business || {}}
        client={state.client || { name: 'Walk-in' }}
        onClose={() => {}}
      />
    </div>
  );
};

export default InvoiceEmbed;
