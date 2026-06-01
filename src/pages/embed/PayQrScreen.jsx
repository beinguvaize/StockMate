/**
 * /embed/payqr  — customer-facing UPI payment QR.
 *
 * Built for a dual-monitor POS: the cashier opens this in a popup and
 * drags it to the customer-facing screen. The customer scans and pays.
 *
 * Stateless + auth-free: everything it needs comes from the query
 * string, so it renders instantly and never touches Supabase.
 *   ?pa=<upi-vpa>&pn=<merchant>&am=<amount>&tn=<note>&cur=<symbol>
 *
 * The cashier still confirms receipt on the main screen (the QR here
 * is display-only — it cannot mark a sale paid).
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

const PayQrScreen = () => {
  const [p] = useSearchParams();
  const pa  = p.get('pa') || '';
  const pn  = p.get('pn') || 'Merchant';
  const am  = p.get('am') || '0';
  const tn  = p.get('tn') || '';
  const cur = p.get('cur') || '₹';

  const amount = Number(am) || 0;
  const upiUri =
    `upi://pay?pa=${pa}` +
    `&pn=${encodeURIComponent(pn)}` +
    `&am=${amount.toFixed(2)}&cu=INR` +
    (tn ? `&tn=${encodeURIComponent(tn)}` : '');

  if (!pa) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', color: '#b91c1c' }}>
        No UPI ID configured. Add one in Settings.
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#fff', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 24, fontFamily: 'system-ui, sans-serif', padding: 32,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>{pn}</div>
      <div style={{ fontSize: 18, color: '#6b7280', letterSpacing: 2, textTransform: 'uppercase' }}>
        Scan to pay
      </div>
      <div style={{ padding: 28, border: '4px solid #111827', borderRadius: 28 }}>
        {/* Large QR — sized off the smaller viewport edge so it fills a
            customer-facing monitor without overflowing. */}
        <QRCodeSVG value={upiUri} size={Math.min(440, 70 * 6)} level="M" includeMargin={false} />
      </div>
      <div style={{ fontSize: 56, fontWeight: 900, color: '#111827', letterSpacing: -1 }}>
        {cur}{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </div>
      <div style={{ fontSize: 16, color: '#6b7280' }}>
        UPI: <b style={{ color: '#111827' }}>{pa}</b>
      </div>
      <div style={{ fontSize: 13, color: '#9ca3af' }}>
        PhonePe · Google Pay · Paytm · BHIM
      </div>
    </div>
  );
};

export default PayQrScreen;
