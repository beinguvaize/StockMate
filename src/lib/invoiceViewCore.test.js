// The public invoice page's pure parts live with the Edge Function
// (supabase/functions/invoice-view/core.js); they are tested here.
import { describe, it, expect } from 'vitest';
import {
  isValidToken, sha256Hex, escapeHtml, isPreviewBot, clientAddress, publicView,
  renderInvoicePage, renderGonePage, pageCsp, pdfFileName, formatInvoiceDate, SECURITY_HEADERS,
} from '../../supabase/functions/invoice-view/core.js';

const row = {
  ok: true, shop_name: 'Shop <script>alert(1)</script>', shop_gstin: '27ABCDE1234F1Z5', title: 'Tax invoice',
  invoice_number: 'INV/"1"', invoice_date: '2026-11-22', grand_total: 1180, balance_due: 1000,
  pdf_path: '00000000-0000-0000-0000-000000000000/INV-1.pdf',
};

describe('token and hashing', () => {
  it('only 43-char base64url tokens', () => {
    expect(isValidToken('a'.repeat(43))).toBe(true);
    expect(isValidToken('a'.repeat(42))).toBe(false);
    expect(isValidToken('a'.repeat(42) + '=')).toBe(false);
    expect(isValidToken("'; drop table x; --" + 'a'.repeat(24))).toBe(false);
    expect(isValidToken(null)).toBe(false);
  });
  it('sha256 matches the database (pgcrypto digest of the same text)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('the page leaks nothing and escapes everything', () => {
  const view = publicView(row);
  it('drops internal ids', () => {
    expect(JSON.stringify(view)).not.toContain('pdf_path');
    expect(JSON.stringify(view)).not.toContain('00000000-0000');
  });
  it('escapes', () => {
    const html = renderInvoicePage(view, { nonce: 'n1', downloadHref: '/x?t=a&dl=1' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('Shop &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('INV/&quot;1&quot;');
    expect(html).toContain('href="/x?t=a&amp;dl=1"');
    expect(html).toContain('GSTIN 27ABCDE1234F1Z5');
    expect(html).toContain('22 Nov 2026');
    expect(html).toContain('Balance due');
  });
  it('paid invoices say so', () => {
    const html = renderInvoicePage(publicView({ ...row, balance_due: 0 }), { nonce: 'n', downloadHref: '#' });
    expect(html).toContain('Paid in full');
  });
  it('gone page is generic', () => {
    expect(renderGonePage({ nonce: 'n' })).toContain('This link is no longer available');
    expect(renderGonePage({ nonce: 'n', rateLimited: true })).toContain('Too many tries');
  });
  it('escapeHtml', () => expect(escapeHtml(`<a href="x" onclick='y'>&\``)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;'));
  it('title is only ever one of two words', () => expect(publicView({ ...row, title: '<b>x</b>' }).title).toBe('Invoice'));
});

describe('headers', () => {
  it('CSP allows no scripts, no images, no framing', () => {
    const csp = pageCsp('abc');
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("style-src 'nonce-abc'");
  });
  it('no-store and noindex', () => {
    expect(SECURITY_HEADERS['Cache-Control']).toMatch(/no-store/);
    expect(SECURITY_HEADERS['X-Robots-Tag']).toMatch(/noindex/);
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('no-referrer');
  });
});

describe('misc', () => {
  it('preview bots are not counted as views', () => {
    expect(isPreviewBot('WhatsApp/2.23.20.0 A')).toBe(true);
    expect(isPreviewBot('facebookexternalhit/1.1')).toBe(true);
    expect(isPreviewBot('')).toBe(true);
    expect(isPreviewBot('Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile Safari/537.36')).toBe(false);
  });
  it('client address', () => {
    expect(clientAddress(new Map([['x-forwarded-for', '1.2.3.4, 10.0.0.1']]))).toBe('1.2.3.4');
    expect(clientAddress(new Map([['cf-connecting-ip', '5.6.7.8'], ['x-forwarded-for', '1.2.3.4']]))).toBe('5.6.7.8');
    expect(clientAddress(new Map())).toBe('unknown');
  });
  it('file name and date', () => {
    expect(pdfFileName('INV/1"; x')).toBe('Invoice-INV-1-x.pdf');
    expect(formatInvoiceDate('2026-01-05')).toBe('5 Jan 2026');
  });
});
