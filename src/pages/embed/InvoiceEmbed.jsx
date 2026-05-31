/**
 * /embed/invoice/:invoiceId
 *
 * Pixel-perfect GST InvoiceTemplate for a given invoice row, rendered
 * bare (no app chrome). Mobile WebView loads this URL → printToPdf →
 * matches web exactly.
 */
import React, { useEffect, useState } from 'react';
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
  if (typeof window !== 'undefined') window.__embedReady = true;

  return (
    <div data-embed-ready="true" style={{ background: '#fff', minHeight: '100vh', padding: 0 }}>
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
