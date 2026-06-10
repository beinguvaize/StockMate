import React, { useEffect, useState } from 'react';
import {
  User, Building, Printer, Users as UsersIcon, CreditCard,
  LifeBuoy, ChevronRight, Check, BellRing, Zap, Tag, Database,
  FileText, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { supabase, uploadProductImage } from '../../lib/supabase';
import { PLANS } from '../../lib/tenancy';
import Settings from '../Settings';
import Users from '../Users';
import CashBillPrint from '../sales/components/CashBillPrint';
import InvoiceTemplate from '../../components/invoice/InvoiceTemplate';
import { INVOICE_LAYOUT_META, RECEIPT_META, DEFAULT_DOC_TEXTS, DEFAULT_INV_OPTS, ACCENT_SWATCHES } from '../../components/invoice/invoiceLayouts';

// Sample documents for the print previews — exact production components.
const SAMPLE_SALE = {
  id: 'SALE-2026-001042', date: new Date().toISOString(), paymentMethod: 'CASH',
  totalAmount: 405,
  items: [
    { name: 'Basmati Rice 5kg', quantity: 2, price: 80 },
    { name: 'Sunflower Oil 1L', quantity: 1, price: 245 },
  ],
};
const SAMPLE_INVOICE = {
  invoice_no: 'INV-1042', date: new Date().toISOString(), client_name: 'Sample Client',
  due_date: new Date(Date.now() + 15 * 864e5).toISOString(),
  is_interstate: false, taxable_amount: 0, tax_total: 0, grand_total: 0, paid_amount: 0,
  items: [
    { name: 'Basmati Rice 5kg', sku: 'RICE-5KG', hsn_code: '1006', qty: 2, rate: 80,  taxRate: 5,  unit: 'PCS' },
    { name: 'Sunflower Oil 1L', sku: 'OIL-1L',   hsn_code: '1512', qty: 1, rate: 245, taxRate: 5,  unit: 'PCS' },
    { name: 'Detergent 2kg',    sku: 'DET-2KG',  hsn_code: '3402', qty: 3, rate: 120, taxRate: 18, unit: 'PCS' },
  ],
};
const SAMPLE_CLIENT = { name: 'Sample Client', address: '12 MG Road, Bengaluru', contact: '98765 43210', state: 'Karnataka', outstanding_balance: 2500 };

// Settings hub — corporate-SaaS layout: grouped left rail + card panels with
// header / body / footer structure and label-left form rows.

const NAV_GROUPS = [
  { caption: 'General', items: [
    { id: 'account',  label: 'Account',     icon: <User size={15} /> },
    { id: 'business', label: 'Business',    icon: <Building size={15} /> },
    { id: 'workspace', label: 'Preferences', icon: <Zap size={15} /> },
  ]},
  { caption: 'Catalog', items: [
    { id: 'categories', label: 'Categories', icon: <Tag size={15} /> },
    { id: 'locations',  label: 'Locations',  icon: <Database size={15} /> },
  ]},
  { caption: 'Sales & printing', items: [
    { id: 'print',     label: 'Printing',          icon: <Printer size={15} /> },
    { id: 'reminders', label: 'Payment reminders', icon: <BellRing size={15} /> },
  ]},
  { caption: 'Team & billing', items: [
    { id: 'users',    label: 'Users & roles',  icon: <UsersIcon size={15} /> },
    { id: 'pricing',  label: 'Plan & billing', icon: <CreditCard size={15} /> },
  ]},
  { caption: 'Advanced', items: [
    { id: 'data',     label: 'Data tools', icon: <RotateCcw size={15} /> },
    { id: 'api',      label: 'API',        icon: <ShieldCheck size={15} /> },
    { id: 'support',  label: 'Help & support', icon: <LifeBuoy size={15} /> },
  ]},
];

// Hub ids that map to a section of the classic Settings page.
const CLASSIC_SECTIONS = {
  business: 'tab-business', workspace: 'tab-workspace', categories: 'tab-categories',
  locations: 'tab-locations', data: 'tab-data', api: 'tab-api',
};

// ── Shared primitives ────────────────────────────────────────────────────────
const Card = ({ title, description, footer, children }) => (
  <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
    {(title || description) && (
      <header className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-[14px] font-semibold text-gray-900">{title}</h2>
        {description && <p className="text-[12.5px] text-gray-500 mt-0.5">{description}</p>}
      </header>
    )}
    <div className="px-5 py-4">{children}</div>
    {footer && (
      <footer className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
        {footer}
      </footer>
    )}
  </section>
);

const FormRow = ({ label, hint, children }) => (
  <div className="grid sm:grid-cols-[180px_1fr] gap-1.5 sm:gap-6 py-3.5 first:pt-0 last:pb-0 border-b border-gray-100 last:border-0 items-start">
    <div>
      <div className="text-[13px] font-medium text-gray-700">{label}</div>
      {hint && <div className="text-[12px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

const PrimaryBtn = ({ children, ...props }) => (
  <button {...props}
    className="px-3.5 py-2 rounded-md bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors">
    {children}
  </button>
);

const Toggle = ({ checked, onChange }) => (
  <button type="button" onClick={() => onChange(!checked)} aria-pressed={checked}
    className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-gray-900' : 'bg-gray-300'}`}>
    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);

const inputCls = 'w-full max-w-sm border border-gray-300 rounded-md px-3 py-2 text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 transition';

// ── Account ──────────────────────────────────────────────────────────────────
const AccountPanel = () => {
  const { currentUser, logout } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const changePassword = async () => {
    setMsg('');
    if (pw.length < 8) { setMsg('Password must be at least 8 characters.'); return; }
    if (pw !== pw2) { setMsg('Passwords do not match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    setMsg(error ? error.message : 'Password updated.');
    if (!error) { setPw(''); setPw2(''); }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card title="Profile" description="Your personal account details.">
        <FormRow label="Name">
          <div className="text-[13px] text-gray-900 py-1.5">{currentUser?.name || '—'}</div>
        </FormRow>
        <FormRow label="Email">
          <div className="text-[13px] text-gray-900 py-1.5">{currentUser?.email}</div>
        </FormRow>
        <FormRow label="Roles">
          <div className="flex flex-wrap gap-1.5 py-1">
            {(currentUser?.roles || []).map(r => (
              <span key={r} className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">{r}</span>
            ))}
          </div>
        </FormRow>
      </Card>

      <Card
        title="Password"
        description="Use at least 8 characters. You'll stay signed in on this device."
        footer={<PrimaryBtn onClick={changePassword} disabled={busy}>{busy ? 'Saving…' : 'Update password'}</PrimaryBtn>}
      >
        <FormRow label="New password">
          <input type="password" className={inputCls} placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)} />
        </FormRow>
        <FormRow label="Confirm password">
          <input type="password" className={inputCls} placeholder="••••••••" value={pw2} onChange={e => setPw2(e.target.value)} />
          {msg && <p className="text-[12px] text-gray-600 mt-2">{msg}</p>}
        </FormRow>
      </Card>

      <Card title="Session">
        <FormRow label="Sign out" hint="Sign out of LedgrPro on this device.">
          <button onClick={logout}
            className="px-3.5 py-2 rounded-md border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition-colors">
            Log out
          </button>
        </FormRow>
      </Card>
    </div>
  );
};

// ── Printing ─────────────────────────────────────────────────────────────────
const PrintPanel = ({ tenantId }) => {
  const { businessProfile, updateBusinessProfile } = useTenant();
  // Receipt content toggles live in business_profile.bill_settings (shared
  // with the POS receipt) — consolidated here from the old Bill layout tab.
  const BILL_DEFAULTS = {
    show_address: true, show_phone: true, show_gstin: true, show_customer_name: true,
    show_customer_gstin: true, show_tax_breakdown: true, show_upi: true, show_discount: true,
  };
  const [billSet, setBillSet] = useState({ ...BILL_DEFAULTS, ...(businessProfile?.bill_settings || {}) });
  useEffect(() => {
    setBillSet({ ...BILL_DEFAULTS, ...(businessProfile?.bill_settings || {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfile?.bill_settings]);
  const key = `print_settings_${tenantId || 'default'}`;
  const PREF_BASE = { paper: '80', copies: 1, autoPrint: false, invoiceTemplate: 'classic', receiptTemplate: 'classic', docTexts: {}, invOpts: {}, invAccent: '#0f172a', customFields: [] };
  const [prefs, setPrefs] = useState(() => {
    // Tenant-level settings (DB) are the source of truth; localStorage only
    // bridges saves made before print_settings moved server-side.
    try { return { ...PREF_BASE, ...(JSON.parse(localStorage.getItem(key)) || {}) }; }
    catch { return PREF_BASE; }
  });
  useEffect(() => {
    if (businessProfile?.print_settings && typeof businessProfile.print_settings === 'object') {
      setPrefs(prev => ({ ...PREF_BASE, ...prev, ...businessProfile.print_settings }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfile?.print_settings]);
  const [saved, setSaved] = useState(false);
  const [docTab, setDocTab] = useState('receipt');
  const [sigBusy, setSigBusy] = useState(false);

  const uploadSignature = async (file) => {
    if (!file) return;
    setSigBusy(true);
    const { url, error } = await uploadProductImage(file, tenantId);
    if (!error && url) await updateBusinessProfile?.({ signature_url: url });
    setSigBusy(false);
  };
  const removeSignature = async () => {
    setSigBusy(true);
    await updateBusinessProfile?.({ signature_url: null });
    setSigBusy(false);
  };
  const [saveErr, setSaveErr] = useState('');
  const save = async () => {
    localStorage.setItem(key, JSON.stringify(prefs)); // same-browser cache
    setSaveErr('');
    // Tenant-level: every device + the mobile app print with these settings.
    const res = await updateBusinessProfile?.({
      print_settings: prefs,
      bill_settings: { ...(businessProfile?.bill_settings || {}), ...billSet },
    });
    if (res && !res.success) {
      setSaveErr(`Could not save to your workspace: ${res.error?.message || 'permission denied'}. Other devices won't see these settings.`);
      return;
    }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };
  const onEditText = (k, v) =>
    setPrefs(prev => ({ ...prev, docTexts: { ...(prev.docTexts || {}), [k]: v } }));
  const texts = { ...DEFAULT_DOC_TEXTS, ...(prefs.docTexts || {}) };
  const invOpts = { ...DEFAULT_INV_OPTS, ...(prefs.invOpts || {}) };
  const setOpt = (k, v) => setPrefs(prev => ({ ...prev, invOpts: { ...(prev.invOpts || {}), [k]: v } }));

  const OPT_GROUPS = [
    ['Invoice details', [['logo', 'Business logo'], ['gstin', 'GSTIN'], ['words', 'Amount in words']]],
    ['Party details', [['clientAddr', 'Client address'], ['phone', 'Phone numbers'], ['partyBalance', 'Party balance']]],
    ['Item table', [['hsn', 'HSN column'], ['desc', 'Item description']]],
    ['Footer', [['terms', 'Terms & conditions'], ['sign', 'Signature block'], ['bank', 'Bank details'], ['upiQr', 'UPI QR code']]],
  ];

  return (
    <div className="max-w-3xl space-y-4">
      {saveErr && (
        <div className="px-4 py-2.5 rounded-md bg-red-50 border border-red-200 text-[12.5px] text-red-700 font-medium">
          {saveErr}
        </div>
      )}
      <Card
        title="Receipt printer"
        description="Applies to cash receipts printed after each sale."
        footer={<PrimaryBtn onClick={save}>{saved ? <span className="inline-flex items-center gap-1.5"><Check size={13} /> Saved</span> : 'Save changes'}</PrimaryBtn>}
      >
        <FormRow label="Paper width" hint="Match your thermal printer roll.">
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
            {[['58', '58 mm'], ['80', '80 mm'], ['A4', 'A4']].map(([v, l], i) => (
              <button key={v} onClick={() => setPrefs({ ...prefs, paper: v })}
                className={`px-4 py-2 text-[13px] font-medium transition-colors ${i > 0 ? 'border-l border-gray-300' : ''} ${
                  prefs.paper === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>
        </FormRow>
        <FormRow label="Copies per receipt">
          <div className="inline-flex items-center rounded-md border border-gray-300 overflow-hidden">
            <button onClick={() => setPrefs({ ...prefs, copies: Math.max(1, prefs.copies - 1) })}
              className="w-9 h-9 text-gray-600 hover:bg-gray-50 text-[15px]">−</button>
            <span className="w-10 text-center text-[13px] font-semibold text-gray-900 border-x border-gray-300 leading-9">{prefs.copies}</span>
            <button onClick={() => setPrefs({ ...prefs, copies: Math.min(3, prefs.copies + 1) })}
              className="w-9 h-9 text-gray-600 hover:bg-gray-50 text-[15px]">+</button>
          </div>
        </FormRow>
        <FormRow label="Auto-print" hint="Open the print dialog automatically after each sale.">
          <Toggle checked={prefs.autoPrint} onChange={v => setPrefs({ ...prefs, autoPrint: v })} />
        </FormRow>
      </Card>

      <Card
        title="Document designer"
        description="Choose a design and click the highlighted text in the preview to edit it. Changes apply to printed documents after saving."
        footer={<PrimaryBtn onClick={save}>{saved ? <span className="inline-flex items-center gap-1.5"><Check size={13} /> Saved</span> : 'Save design & text'}</PrimaryBtn>}
      >
        {/* doc tabs */}
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden mb-4">
          {[['receipt', 'Thermal receipt'], ['invoice', 'A4 tax invoice']].map(([v, l], i) => (
            <button key={v} onClick={() => setDocTab(v)}
              className={`px-4 py-2 text-[13px] font-medium transition-colors ${i > 0 ? 'border-l border-gray-300' : ''} ${
                docTab === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>

        {docTab === 'receipt' ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {RECEIPT_META.map(t => (
                <button key={t.id} onClick={() => setPrefs({ ...prefs, receiptTemplate: t.id })}
                  className={`text-left rounded-md border p-3 transition-colors ${prefs.receiptTemplate === t.id ? 'border-gray-900 ring-2 ring-gray-900/10' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="text-[13px] font-semibold text-gray-900">{t.name}</div>
                  <div className="text-[11.5px] text-gray-500">{t.blurb}</div>
                </button>
              ))}
            </div>
            <div className="grid lg:grid-cols-[1fr_230px] gap-4">
            <div className="bg-gray-100 rounded-md p-4 overflow-auto">
              <CashBillPrint
                key={`${prefs.paper}-${prefs.receiptTemplate}-${JSON.stringify(prefs.docTexts)}`}
                previewMode editable
                paperOverride={prefs.paper === '58' ? '58' : '80'}
                receiptOverride={prefs.receiptTemplate}
                textsOverride={texts}
                onEditText={onEditText}
                sale={SAMPLE_SALE}
                business={{
                  name: businessProfile?.name || 'Your Business',
                  address: billSet.show_address ? businessProfile?.address : null,
                  phone: billSet.show_phone ? businessProfile?.phone : null,
                  upi_id: billSet.show_upi ? businessProfile?.upi_id : null,
                }}
              />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-gray-500 mb-1.5">Receipt content</div>
              <div className="space-y-1.5">
                {[
                  ['show_address', 'Business address'],
                  ['show_phone', 'Phone number'],
                  ['show_customer_name', 'Customer name'],
                  ['show_tax_breakdown', 'Tax breakdown'],
                  ['show_discount', 'Discount line'],
                  ['show_upi', 'UPI QR / ID'],
                ].map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between text-[12.5px] text-gray-700 cursor-pointer">
                    {label}
                    <Toggle checked={!!billSet[k]} onChange={v => setBillSet({ ...billSet, [k]: v })} />
                  </label>
                ))}
              </div>
              <div className="text-[10.5px] text-gray-400 mt-2">Applies to POS receipts. Saved with this card.</div>
            </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {INVOICE_LAYOUT_META.map(t => (
                <button key={t.id} onClick={() => setPrefs({ ...prefs, invoiceTemplate: t.id })}
                  className={`text-left rounded-md border p-3 transition-colors ${prefs.invoiceTemplate === t.id ? 'border-gray-900 ring-2 ring-gray-900/10' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="text-[13px] font-semibold text-gray-900">{t.name}</div>
                  <div className="text-[11.5px] text-gray-500">{t.blurb}</div>
                </button>
              ))}
            </div>
            <div className="grid lg:grid-cols-[1fr_230px] gap-4">
              {/* live preview */}
              <div className="bg-gray-100 rounded-md p-4 overflow-auto">
                <div style={{ width: 794 * 0.55 }} className="mx-auto">
                  {/* zoom (not transform) so the wrapper's layout height shrinks with the content */}
                  <div style={{ zoom: 0.55, width: 794 }}>
                    <InvoiceTemplate
                      key={`${prefs.invoiceTemplate}-${prefs.invAccent}-${JSON.stringify(prefs.docTexts)}-${JSON.stringify(prefs.invOpts)}-${JSON.stringify(prefs.customFields)}`}
                      previewMode editable
                      themeOverride={prefs.invoiceTemplate}
                      textsOverride={texts}
                      optsOverride={invOpts}
                      accentOverride={prefs.invAccent}
                      customFieldsOverride={prefs.customFields}
                      onEditText={onEditText}
                      invoice={SAMPLE_INVOICE}
                      businessProfile={businessProfile || { name: 'Your Business' }}
                      client={SAMPLE_CLIENT}
                      onClose={() => {}} onPrint={() => {}} onShare={() => {}}
                    />
                  </div>
                </div>
              </div>

              {/* control rail */}
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] font-semibold text-gray-500 mb-1.5">Accent colour</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ACCENT_SWATCHES.map(c => (
                      <button key={c} onClick={() => setPrefs({ ...prefs, invAccent: c })}
                        className={`w-7 h-7 rounded ${prefs.invAccent === c ? 'ring-2 ring-offset-1 ring-gray-900' : ''}`}
                        style={{ background: c }} aria-label={c} />
                    ))}
                  </div>
                  <div className="text-[10.5px] text-gray-400 mt-1">Applies to Modern & Letterhead designs.</div>
                </div>
                {OPT_GROUPS.map(([group, items]) => (
                  <div key={group}>
                    <div className="text-[11px] font-semibold text-gray-500 mb-1.5">{group}</div>
                    <div className="space-y-1.5">
                      {items.map(([k, label]) => (
                        <label key={k} className="flex items-center justify-between text-[12.5px] text-gray-700 cursor-pointer">
                          {label}
                          <Toggle checked={invOpts[k]} onChange={v => setOpt(k, v)} />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Signature image */}
                <div>
                  <div className="text-[11px] font-semibold text-gray-500 mb-1.5">Signature image</div>
                  {businessProfile?.signature_url ? (
                    <div className="space-y-1.5">
                      <div className="bg-white border border-gray-200 rounded-md p-2 flex justify-center">
                        <img src={businessProfile.signature_url} alt="signature" className="h-10 object-contain" />
                      </div>
                      <button onClick={removeSignature} disabled={sigBusy}
                        className="w-full py-1.5 rounded-md border border-gray-200 text-[12px] font-medium text-gray-500 hover:text-red-500 hover:border-red-200 disabled:opacity-50">
                        {sigBusy ? 'Removing…' : 'Remove signature'}
                      </button>
                    </div>
                  ) : (
                    <label className={`block w-full py-1.5 rounded-md border border-dashed border-gray-300 text-[12px] font-medium text-gray-500 text-center cursor-pointer hover:border-gray-400 hover:text-gray-700 ${sigBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                      {sigBusy ? 'Uploading…' : '+ Upload signature (PNG)'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                        onChange={e => uploadSignature(e.target.files?.[0])} />
                    </label>
                  )}
                  <div className="text-[10.5px] text-gray-400 mt-1">Transparent PNG works best. Shown above "Authorised Signatory".</div>
                </div>

                {/* Custom fields (label: value pairs printed on every invoice) */}
                <div>
                  <div className="text-[11px] font-semibold text-gray-500 mb-1.5">Custom fields</div>
                  <div className="space-y-2">
                    {(prefs.customFields || []).map((f, i) => (
                      <div key={i} className="flex gap-1.5 items-center">
                        <input value={f.label} placeholder="Label"
                          onChange={e => {
                            const cf = [...prefs.customFields]; cf[i] = { ...cf[i], label: e.target.value };
                            setPrefs({ ...prefs, customFields: cf });
                          }}
                          className="w-[38%] border border-gray-300 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-gray-900" />
                        <input value={f.value} placeholder="Value"
                          onChange={e => {
                            const cf = [...prefs.customFields]; cf[i] = { ...cf[i], value: e.target.value };
                            setPrefs({ ...prefs, customFields: cf });
                          }}
                          className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-gray-900" />
                        <button onClick={() => setPrefs({ ...prefs, customFields: prefs.customFields.filter((_, j) => j !== i) })}
                          className="w-6 h-6 shrink-0 rounded border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 text-[12px]">×</button>
                      </div>
                    ))}
                    {(prefs.customFields || []).length < 4 && (
                      <button onClick={() => setPrefs({ ...prefs, customFields: [...(prefs.customFields || []), { label: '', value: '' }] })}
                        className="w-full py-1.5 rounded-md border border-dashed border-gray-300 text-[12px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700">
                        + Add field
                      </button>
                    )}
                    <div className="text-[10.5px] text-gray-400">e.g. PAN, FSSAI No, Website — printed on every invoice.</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card title="Barcode labels" description="Label templates, per-field typography and bulk barcode generation.">
        <FormRow label="Labels tool" hint="Design and print price labels for products.">
          <a href="labels"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-gray-300 text-gray-700 text-[13px] font-semibold hover:bg-gray-50 transition-colors">
            Open Labels <ChevronRight size={14} />
          </a>
        </FormRow>
      </Card>
    </div>
  );
};

// ── Payment reminders ────────────────────────────────────────────────────────
const RemindersPanel = ({ tenantId }) => {
  const { businessProfile } = useTenant();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone, outstanding_balance')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gt('outstanding_balance', 0)
        .order('outstanding_balance', { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [tenantId]);

  const waLink = (c) => {
    const msg = encodeURIComponent(
      `Dear ${c.name},\nThis is a friendly reminder from ${businessProfile?.name || 'us'} — ` +
      `your outstanding balance is ₹${Number(c.outstanding_balance).toFixed(2)}. ` +
      `Kindly arrange the payment at your convenience. Thank you!`
    );
    const phone = String(c.phone || '').replace(/\D/g, '');
    const e164 = phone.length === 10 ? `91${phone}` : phone;
    return `https://wa.me/${e164}?text=${msg}`;
  };

  return (
    <div className="max-w-2xl">
      <Card
        title="Outstanding balances"
        description="Send a WhatsApp payment reminder with the client's name and amount prefilled."
      >
        {loading ? (
          <p className="py-4 text-center text-[13px] text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-gray-400">No outstanding balances.</p>
        ) : (
          <div className="-mx-5 -my-4 divide-y divide-gray-100 max-h-[480px] overflow-y-auto">
            {rows.map(c => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-900 truncate">{c.name}</div>
                  <div className="text-[12px] text-gray-400">{c.phone || 'No phone on file'}</div>
                </div>
                <div className="text-[13px] font-semibold text-gray-900 tabular-nums shrink-0">
                  ₹{Number(c.outstanding_balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
                {c.phone ? (
                  <a href={waLink(c)} target="_blank" rel="noreferrer"
                    className="shrink-0 px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 text-[12px] font-semibold hover:bg-gray-50 transition-colors">
                    Send reminder
                  </a>
                ) : (
                  <span className="text-[11px] text-gray-400 shrink-0">—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

// ── Plan & billing ───────────────────────────────────────────────────────────
const PricingPanel = () => {
  const { currentTenant } = useTenant();
  const plan = currentTenant?.plan || 'STARTER';
  const trialEnd = currentTenant?.trial_end_date ? new Date(currentTenant.trial_end_date) : null;
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - Date.now()) / 86400000)) : null;

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Current plan">
        <FormRow label="Plan">
          <div className="flex items-center gap-2 py-1">
            <span className="text-[13px] font-semibold text-gray-900">{PLANS[plan]?.label || plan}</span>
            {currentTenant?.status === 'TRIAL' && daysLeft != null && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                Trial · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
              </span>
            )}
          </div>
        </FormRow>
        <FormRow label="Billing" hint="Online payments are coming soon.">
          <div className="text-[13px] text-gray-500 py-1.5">Contact us to upgrade or change plans.</div>
        </FormRow>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        {Object.entries(PLANS).map(([id, p]) => (
          <section key={id}
            className={`bg-white rounded-lg border p-5 ${id === plan ? 'border-gray-900' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-gray-900 uppercase tracking-wide">{p.label}</span>
              {id === plan && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-900 text-white">CURRENT</span>
              )}
            </div>
            <div className="text-[18px] font-semibold text-gray-900 mt-1.5">{p.price}</div>
            <ul className="text-[12.5px] text-gray-600 space-y-1.5 mt-3">
              <li className="flex items-center gap-2"><Check size={13} className="text-gray-400 shrink-0" />{(p.modules || []).length} modules</li>
              <li className="flex items-center gap-2"><Check size={13} className="text-gray-400 shrink-0" />{p.maxUsers === -1 ? 'Unlimited users' : `Up to ${p.maxUsers} users`}</li>
              {(p.features || []).slice(0, 4).map(f => (
                <li key={f} className="flex items-center gap-2">
                  <Check size={13} className="text-gray-400 shrink-0" />
                  <span className="capitalize">{String(f).replaceAll('_', ' ')}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
};

// ── Support ──────────────────────────────────────────────────────────────────
const SupportPanel = () => (
  <div className="max-w-2xl">
    <Card title="Help & support" description="We usually respond within a business day.">
      {[
        ['Email', 'support@ledgrpro.co', 'mailto:support@ledgrpro.co', 'Send email'],
        ['WhatsApp', 'Chat with our support team', 'https://wa.me/919778707474', 'Open chat'],
        ['Report a bug', 'Use the Report Issue button at the bottom-right of any page', null, null],
      ].map(([t, sub, href, cta]) => (
        <FormRow key={t} label={t} hint={sub}>
          {href ? (
            <a href={href} target="_blank" rel="noreferrer"
              className="inline-flex px-3.5 py-2 rounded-md border border-gray-300 text-gray-700 text-[13px] font-semibold hover:bg-gray-50 transition-colors">
              {cta}
            </a>
          ) : <span className="text-[13px] text-gray-400 py-1.5 inline-block">—</span>}
        </FormRow>
      ))}
    </Card>
  </div>
);

// ── Hub ──────────────────────────────────────────────────────────────────────
const SettingsHub = () => {
  const { currentTenantId } = useTenant();
  const [active, setActive] = useState('account');

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-6 pb-5 border-b border-gray-200">
        <h1 className="text-[20px] font-semibold text-gray-900">Settings</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Manage your account, workspace and billing preferences.</p>
      </header>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left rail */}
        <nav className="lg:w-52 shrink-0">
          <div className="flex lg:flex-col gap-0.5 overflow-x-auto no-scrollbar lg:sticky lg:top-6">
            {NAV_GROUPS.map(g => (
              <div key={g.caption} className="lg:mb-4 flex lg:block gap-0.5">
                <div className="hidden lg:block px-2.5 mb-1.5 text-[10.5px] font-semibold text-gray-400 uppercase tracking-wider">
                  {g.caption}
                </div>
                {g.items.map(n => (
                  <button key={n.id} onClick={() => setActive(n.id)}
                    className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] whitespace-nowrap w-full text-left transition-colors ${
                      active === n.id
                        ? 'bg-gray-200/70 text-gray-900 font-semibold'
                        : 'text-gray-600 hover:bg-gray-100 font-medium'
                    }`}>
                    <span className={active === n.id ? 'text-gray-900' : 'text-gray-400'}>{n.icon}</span>
                    {n.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>

        {/* Panel */}
        <main className="flex-1 min-w-0">
          {active === 'account'  && <AccountPanel />}
          {CLASSIC_SECTIONS[active] && (
            <Settings embedded section={CLASSIC_SECTIONS[active]} key={active} />
          )}
          {active === 'print'    && <PrintPanel tenantId={currentTenantId} />}
          {active === 'users'    && <Users embedded />}
          {active === 'reminders' && <RemindersPanel tenantId={currentTenantId} />}
          {active === 'pricing'  && <PricingPanel />}
          {active === 'support'  && <SupportPanel />}
        </main>
      </div>
    </div>
  );
};

export default SettingsHub;
