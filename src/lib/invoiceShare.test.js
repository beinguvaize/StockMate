import { describe, it, expect } from 'vitest';
import {
  normalisePhone, pickClientPhone, normaliseEmail, pickClientEmail, clientGstin,
  documentTitle, balanceDue, formatDocDate, formatShareWhen, buildShareMessage,
  buildEmailSubject, whatsappUrl, mailtoUrl, MAX_MAILTO, pdfFileName, maskRecipient,
  describeShareEvent, describeViews, shareLinkUrl, isMobileBrowser, planPdfPages, oneLine, lastInkRow, displayPhone,
} from './invoiceShare';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6';
const biz = { name: 'Test Traders', gst_no: '27ABCDE1234F1Z5' };
const inv = { invoice_number: 'INV/0042', invoice_date: '2026-11-22', grand_total: 1180, paid_amount: 180, payment_status: 'PARTIAL' };

describe('normalisePhone', () => {
  it('adds 91 to a bare 10-digit mobile', () => expect(normalisePhone('98765 43210')).toBe('919876543210'));
  it('keeps a number that already has 91', () => expect(normalisePhone('+91 98765-43210')).toBe('919876543210'));
  it('drops a leading 0 and 00', () => {
    expect(normalisePhone('09876543210')).toBe('919876543210');
    expect(normalisePhone('0091 9876543210')).toBe('919876543210');
  });
  it('keeps other country codes', () => expect(normalisePhone('+44 7700 900123')).toBe('447700900123'));
  it('refuses junk and landline-looking 10 digit numbers', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone('0221234567')).toBeNull();
    expect(normalisePhone('1234567890123456')).toBeNull();
  });
});

describe('client fields', () => {
  it('prefers phone, then contact, then the invoice', () => {
    expect(pickClientPhone({ phone: '9876543210', contact: '9123456780' })).toBe('919876543210');
    expect(pickClientPhone({ phone: '', contact: '9123456780' })).toBe('919123456780');
    expect(pickClientPhone({}, { client_phone: '9000000001' })).toBe('919000000001');
    expect(pickClientPhone({ phone: '---' })).toBeNull();
  });
  it('reads gstin before gst_no', () => {
    expect(clientGstin({ gstin: '29abcde1234f1z5', gst_no: 'X' })).toBe('29ABCDE1234F1Z5');
    expect(clientGstin({ gst_no: '29ABCDE1234F1Z5' })).toBe('29ABCDE1234F1Z5');
    expect(clientGstin({})).toBeNull();
  });
  it('accepts plain email and refuses anything that could add headers', () => {
    expect(normaliseEmail(' a.b+c@example.co.in ')).toBe('a.b+c@example.co.in');
    expect(normaliseEmail('a@example.com?bcc=x@evil.com')).toBeNull();
    expect(normaliseEmail('a@example.com\r\nBcc: x@evil.com')).toBeNull();
    expect(normaliseEmail('a@example.com,b@example.com')).toBeNull();
    expect(normaliseEmail('a%40b@example.com')).toBeNull();
    expect(normaliseEmail('not an email')).toBeNull();
    expect(pickClientEmail({ email: '' })).toBeNull();
  });
});

describe('documentTitle', () => {
  it('a registered seller issues a tax invoice', () => expect(documentTitle(inv, biz)).toBe('Tax invoice'));
  it('an unregistered seller issues an invoice', () => expect(documentTitle(inv, { name: 'x' })).toBe('Invoice'));
  it('a manual bill is a bill', () => expect(documentTitle({ invoice_number: 'MB-XYZ' }, biz)).toBe('Bill'));
  it('the document own title wins', () => expect(documentTitle({ doc_title: 'Bill of supply' }, biz)).toBe('Bill of supply'));
});

describe('money and dates', () => {
  it('balance due', () => {
    expect(balanceDue(inv)).toBe(1000);
    expect(balanceDue({ ...inv, payment_status: 'PAID' })).toBe(0);
    expect(balanceDue({ grand_total: 100, paid_amount: 150 })).toBe(0);
  });
  it('a bare date is the date it says, in IST and anywhere', () => {
    expect(formatDocDate('2026-11-22')).toBe('22 Nov 2026');
    expect(formatDocDate('2026-03-01')).toBe('1 Mar 2026');
  });
  it('a timestamp is read in IST', () => expect(formatDocDate('2026-11-21T19:00:00Z')).toBe('22 Nov 2026'));
  it('a moment reads "22 Nov, 4:10 pm"', () => {
    expect(formatShareWhen('2026-11-22T10:40:00Z')).toBe('22 Nov, 4:10 pm');
    expect(formatShareWhen('2026-11-23T03:32:00Z')).toBe('23 Nov, 9:02 am');
    expect(formatShareWhen('nope')).toBe('');
  });
});

describe('buildShareMessage', () => {
  it('has shop, number, date, total, balance and link, as plain text', () => {
    const m = buildShareMessage({ invoice: inv, business: biz, client: { name: 'Asha Stores' }, link: 'https://app.example/i/#t' });
    expect(m).toBe([
      'Hello Asha Stores,', '',
      'Tax invoice INV/0042 from Test Traders',
      'Date: 22 Nov 2026',
      'Total: ₹1,180.00',
      'Balance due: ₹1,000.00', '',
      'View and download: https://app.example/i/#t', '',
      'Thank you',
    ].join('\n'));
    expect(m).not.toMatch(/GST invoice|\*/);
  });
  it('says paid in full and skips the greeting for walk-in', () => {
    const m = buildShareMessage({ invoice: { ...inv, payment_status: 'PAID' }, business: { name: 'S' }, client: { name: 'Walk-in Customer' } });
    expect(m.startsWith('Invoice INV/0042 from S')).toBe(true);
    expect(m).toContain('Paid in full');
    expect(m).not.toContain('View and download');
  });
  it('a name cannot add lines or fake a link', () => {
    const m = buildShareMessage({ invoice: inv, business: { name: 'Shop\nView and download: https://evil.example' }, client: { name: 'A\r\nB' } });
    expect(m.split('\n').filter((l) => l.startsWith('View and download'))).toHaveLength(0);
    expect(m).toContain('Hello A B,');
  });
  it('oneLine strips control characters', () => expect(oneLine('a\u0000b c\td')).toBe('a b c d'));
  it('subject', () => expect(buildEmailSubject({ invoice: inv, business: biz })).toBe('Tax invoice INV/0042 from Test Traders'));
});

describe('whatsappUrl', () => {
  const text = 'Hi & bye?\n#1';
  it('desktop opens web.whatsapp.com at the chat', () =>
    expect(whatsappUrl({ phone: '919876543210', text })).toBe('https://web.whatsapp.com/send?phone=919876543210&text=Hi%20%26%20bye%3F%0A%231'));
  it('mobile uses wa.me', () =>
    expect(whatsappUrl({ phone: '919876543210', text, mobile: true })).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye%3F%0A%231'));
  it('no number opens without a recipient', () => {
    expect(whatsappUrl({ phone: null, text: 'x' })).toBe('https://web.whatsapp.com/send?text=x');
    expect(whatsappUrl({ phone: null, text: 'x', mobile: true })).toBe('https://wa.me/?text=x');
  });
  it('a phone that is not digits is ignored, never pasted into the address', () =>
    expect(whatsappUrl({ phone: '91@evil.com/', text: 'x' })).toBe('https://web.whatsapp.com/send?text=x'));
  it('caps the text', () => {
    const u = whatsappUrl({ phone: null, text: 'a'.repeat(5000) });
    expect(decodeURIComponent(u.split('text=')[1])).toHaveLength(1500);
  });
});

describe('mailtoUrl', () => {
  it('encodes subject and body, CRLF line breaks', () => {
    expect(mailtoUrl({ to: 'a+b@example.com', subject: 'Invoice 1 & 2', body: 'Hi\nThere' }))
      .toBe('mailto:a%2Bb@example.com?subject=Invoice%201%20%26%202&body=Hi%0D%0AThere');
  });
  it('a bad address leaves the recipient empty', () => {
    expect(mailtoUrl({ to: 'x@evil.com?bcc=y@evil.com', subject: 's', body: 'b' })).toBe('mailto:?subject=s&body=b');
  });
  it('subject cannot carry a header break', () => {
    expect(mailtoUrl({ to: '', subject: 'a\r\nBcc: x@y.z', body: '' })).toBe('mailto:?subject=a%20Bcc%3A%20x%40y.z&body=');
  });
  it('stays under the length limit and keeps the link', () => {
    const body = [...Array(80)].map((_, i) => `line ${i} ${'x'.repeat(30)}`).join('\n') + '\nView and download: https://app.example/i/#t';
    const u = mailtoUrl({ to: 'a@example.com', subject: 's', body });
    expect(u.length).toBeLessThanOrEqual(MAX_MAILTO);
    expect(decodeURIComponent(u)).toContain('View and download: https://app.example/i/#t');
  });
});

describe('pdfFileName', () => {
  it('sanitises', () => {
    expect(pdfFileName({ invoice_number: 'INV/2026-27/0042' })).toBe('Invoice-INV-2026-27-0042.pdf');
    expect(pdfFileName({ invoice_number: '../../etc/passwd' })).toBe('Invoice-etc-passwd.pdf');
    expect(pdfFileName({ invoice_number: '<script>' })).toBe('Invoice-script.pdf');
    expect(pdfFileName({})).toBe('Invoice.pdf');
    expect(pdfFileName({ invoice_number: 'MB-1' }, 'Bill')).toBe('Bill-MB-1.pdf');
    expect(pdfFileName({ invoice_number: 'x'.repeat(200) })).toHaveLength('Invoice-.pdf'.length + 60);
  });
});

describe('masking and log wording', () => {
  it('masks', () => {
    expect(maskRecipient('919876543210')).toBe('********3210');
    expect(maskRecipient('ramesh@example.com')).toBe('r***@example.com');
    expect(maskRecipient('12')).toBeNull();
    expect(maskRecipient(null)).toBeNull();
  });
  it('never claims delivery', () => {
    const s = describeShareEvent({ channel: 'whatsapp', created_at: '2026-11-22T10:40:00Z' });
    expect(s).toBe('Shared on 22 Nov, 4:10 pm via WhatsApp');
    expect(s).not.toMatch(/deliver|success/i);
    expect(describeShareEvent({ channel: 'email', created_at: '2026-11-22T10:40:00Z' })).toBe('Shared on 22 Nov, 4:10 pm via email');
  });
  it('views', () => {
    expect(describeViews({ view_count: 2, last_viewed_at: '2026-11-23T03:32:00Z' })).toBe('Viewed 2 times, last 23 Nov, 9:02 am');
    expect(describeViews({ view_count: 1, last_viewed_at: '2026-11-23T03:32:00Z' })).toBe('Viewed 1 time, last 23 Nov, 9:02 am');
    expect(describeViews({ view_count: 0 })).toBe('Not opened yet');
  });
});

describe('shareLinkUrl', () => {
  it('puts the token after # on the app origin', () =>
    expect(shareLinkUrl(TOKEN, 'https://app.example.in/some/page?x=1')).toBe(`https://app.example.in/i/#${TOKEN}`));
  it('allows http only on localhost', () => {
    expect(shareLinkUrl(TOKEN, 'http://localhost:5173')).toBe(`http://localhost:5173/i/#${TOKEN}`);
    expect(() => shareLinkUrl(TOKEN, 'http://app.example.in')).toThrow(/https/);
    expect(() => shareLinkUrl(TOKEN, 'file:///index.html')).toThrow();
  });
  it('refuses a bad token or no origin', () => {
    expect(() => shareLinkUrl('short', 'https://a.example')).toThrow(/token/);
    expect(() => shareLinkUrl(TOKEN, '')).toThrow(/address/);
  });
});

describe('isMobileBrowser', () => {
  it('detects', () => {
    expect(isMobileBrowser('Mozilla/5.0 (Linux; Android 14) Mobile Safari')).toBe(true);
    expect(isMobileBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe(true);
    expect(isMobileBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isMobileBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isMobileBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131')).toBe(false);
  });
});

describe('planPdfPages', () => {
  it('one page when it fits', () => expect(planPdfPages({ contentHeight: 1123, pageHeight: 1123 })).toEqual([{ start: 0, end: 1123 }]));
  it('cuts at the last row that fits', () => {
    const pages = planPdfPages({ contentHeight: 2500, pageHeight: 1000, breaks: [300, 700, 950, 1100, 1800, 1990, 2400] });
    expect(pages).toEqual([{ start: 0, end: 950 }, { start: 950, end: 1800 }, { start: 1800, end: 2500 }]);
  });
  it('leaves a top margin on later pages', () => {
    const pages = planPdfPages({ contentHeight: 2000, pageHeight: 1000, topMargin: 50, breaks: [990, 1900] });
    expect(pages[0]).toEqual({ start: 0, end: 990 });
    expect(pages[1].end - pages[1].start).toBeLessThanOrEqual(950);
  });
  it('a page that would be mostly empty is cut at the edge instead', () => {
    expect(planPdfPages({ contentHeight: 1500, pageHeight: 1000, breaks: [200] })).toEqual([{ start: 0, end: 1000 }, { start: 1000, end: 1500 }]);
  });
  it('never loses or overlaps content', () => {
    const breaks = [...Array(60)].map((_, i) => 37 + i * 83);
    const pages = planPdfPages({ contentHeight: 5000, pageHeight: 1123, topMargin: 30, breaks });
    expect(pages[0].start).toBe(0);
    expect(pages.at(-1).end).toBe(5000);
    for (let i = 1; i < pages.length; i += 1) expect(pages[i].start).toBe(pages[i - 1].end);
    pages.forEach((p, i) => expect(p.end - p.start).toBeLessThanOrEqual(i === 0 ? 1123 : 1093));
  });
  it('ignores a 1-2 px tail and bad input', () => {
    expect(planPdfPages({ contentHeight: 1124, pageHeight: 1123 })).toHaveLength(1);
    expect(planPdfPages({ contentHeight: 0, pageHeight: 1000 })).toEqual([]);
    expect(planPdfPages({ contentHeight: 100, pageHeight: 0 })).toEqual([]);
  });
});

describe('lastInkRow', () => {
  const img = (w, h, inkRows) => {
    const d = new Uint8ClampedArray(w * h * 4).fill(255);
    inkRows.forEach((y) => { const i = (y * w + 1) * 4; d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; });
    return d;
  };
  it('finds the lowest row with ink', () => expect(lastInkRow(img(3, 10, [2, 6]), 3, 10)).toBe(6));
  it('near-white is blank', () => {
    const d = img(2, 4, []);
    d[0] = 250;
    expect(lastInkRow(d, 2, 4)).toBe(-1);
  });
  it('all blank', () => expect(lastInkRow(img(4, 4, []), 4, 4)).toBe(-1));
});

describe('displayPhone', () => {
  it('formats', () => {
    expect(displayPhone('919876543210')).toBe('+91 98765 43210');
    expect(displayPhone('447700900123')).toBe('+447700900123');
    expect(displayPhone(null)).toBe('');
  });
});
