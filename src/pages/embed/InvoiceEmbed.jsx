/**
 * /embed/invoice/:invoiceId
 *
 * Pixel-perfect GST InvoiceTemplate for a given invoice row, rendered
 * bare (no app chrome). Mobile WebView loads this URL → printToPdf →
 * matches web exactly.
 */
import React, { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas-pro';
import { useParams } from 'react-router-dom';
import InvoiceTemplate from '../../components/invoice/InvoiceTemplate';
import { supabase } from '../../lib/supabase';

const InvoiceEmbed = () => {
  const { invoiceId } = useParams();
  const [state, setState] = useState({ loading: true, invoice: null, client: null, business: null, error: null });
  const cloneHostRef = useRef(null);

  // After InvoiceTemplate mounts its portal in document.body, copy the
  // A4 sheet's DOM into our embed-ready wrapper. The clone is laid out
  // in normal flow (no fixed-position parent, no dark backdrop) so
  // html2canvas-pro captures it cleanly on Android WebView. The
  // original portal stays in the document so any state / event
  // handlers continue to work.
  useEffect(() => {
    if (state.loading || !state.invoice) return;
    const tryClone = () => {
      const host = cloneHostRef.current;
      const orig = document.getElementById('invoice-print-area');
      if (!host || !orig) return false;
      if (host.childElementCount > 0) return true;
      const clone = orig.cloneNode(true);
      // Strip the inline scale transform — embed renders at native A4.
      clone.style.transform   = 'none';
      clone.style.boxShadow   = 'none';
      clone.style.margin      = '0 auto';
      clone.removeAttribute('id');
      clone.setAttribute('data-invoice-clone', 'true');
      host.appendChild(clone);
      return true;
    };
    if (tryClone()) return;
    // Portal mounts in the next tick; poll briefly.
    const t0 = Date.now();
    const id = setInterval(() => {
      if (tryClone() || Date.now() - t0 > 3000) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [state.loading, state.invoice]);

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
      // We snapshot the clone we placed inside the embed-ready wrapper
      // (see useEffect above) rather than the original portal's
      // #invoice-print-area. The clone sits in normal flow, off the
      // fixed-position dark backdrop, which is the layout shape
      // html2canvas-pro reliably captures on Android WebView.
      let target = document.querySelector('[data-invoice-clone="true"]');
      const start = Date.now();
      while (!target && Date.now() - start < 3000) {
        await new Promise(r => setTimeout(r, 100));
        target = document.querySelector('[data-invoice-clone="true"]');
      }
      if (!target) {
        target = document.getElementById('invoice-print-area')
              || document.querySelector('[data-embed-ready="true"]')
              || document.body;
      }
      // Invoice sheet is w-[210mm] (~794 CSS px). On a narrow mobile
      // WebView the sheet overflows the viewport horizontally and the
      // default html2canvas capture window matches the viewport — so
      // the right edge of the sheet gets cropped. We force every
      // dimension to match the sheet's natural scroll size so the
      // entire A4 page lands in the canvas regardless of how narrow
      // the actual phone viewport is.
      const sheetW = Math.max(target.scrollWidth, 800);
      const sheetH = Math.max(target.scrollHeight, 1200);
      const rect = { width: sheetW, height: sheetH };
      const canvas = await html2canvas(target, {
        scale,
        useCORS:         true,
        backgroundColor: '#ffffff',
        logging:         false,
        width:           sheetW,
        height:          sheetH,
        windowWidth:     sheetW,
        windowHeight:    sheetH,
        scrollX:         0,
        scrollY:         0,
      });
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
        /* Render InvoiceTemplate's portal offscreen — the user sees
           only the cloned A4 sheet we copy into
           [data-invoice-clone="true"]. display:none would unmount
           the portal contents so the clone source disappears; pushing
           the portal off-viewport keeps it laid out and visible to
           our cloneNode() while staying invisible to the user. */
        #invoice-template-portal {
          position: fixed !important;
          left: -99999px !important;
          top: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `}</style>
      <InvoiceTemplate
        invoice={state.invoice}
        businessProfile={state.business || {}}
        client={state.client || { name: 'Walk-in' }}
        onClose={() => {}}
      />
      {/* Host for the cloned A4 sheet — this is what html2canvas
          actually snapshots, NOT the portal-mounted original. The
          original is hidden by CSS so the user only sees the clone. */}
      <div ref={cloneHostRef} style={{ background: '#fff' }} />
    </div>
  );
};

export default InvoiceEmbed;
