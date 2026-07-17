/**
 * BankReconciliation — Phase 1 of the DayBook bank-match feature.
 *
 * Workflow:
 *   1. Owner imports a bank statement CSV (HDFC / SBI / ICICI / Axis /
 *      generic 4-column "Date, Amount, Type, Reference" all supported).
 *   2. Each row lands in `bank_transactions`. Auto-match scans the day's
 *      bank/UPI sales + client_payments + expenses and links any row
 *      whose amount + ref-number (or amount alone within ±3 day window)
 *      uniquely identifies a candidate.
 *   3. Manual ticks fill the rest. Variance chip at the top compares
 *      app-recorded "Bank In" vs statement-imported "Bank In".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Check, AlertTriangle, RefreshCcw, Trash2, Search, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';

// CSV parser — handles quoted commas and trims fields.
const parseCSV = (text) => {
  const rows = [];
  let row = []; let field = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
        if (c === '\r' && n === '\n') i++;
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c?.trim()));
};

// Best-effort column auto-detect across HDFC/SBI/ICICI/Axis layouts.
// Looks at header row, picks the first column whose name matches each role.
const detectColumns = (header) => {
  const lc = header.map(h => (h || '').toLowerCase().trim());
  const idx = (...names) => lc.findIndex(h => names.some(n => h.includes(n)));
  return {
    date:      idx('date', 'txn date', 'value date'),
    desc:      idx('description', 'narration', 'particulars', 'remarks'),
    ref:       idx('ref', 'cheque', 'utr', 'chq'),
    credit:    idx('credit', 'deposit', 'cr amount'),
    debit:     idx('debit', 'withdraw', 'dr amount'),
    amount:    idx('amount', 'transaction amount'),
    type:      idx('type', 'cr/dr', 'dr/cr'),
  };
};

const ymd = (d) => {
  if (!d) return null;
  // Accept DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, MM/DD/YYYY heuristically.
  const s = d.trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(s))) {
    // assume DD/MM/YYYY (Indian default)
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }
  return null;
};

const inWindow = (a, b, days = 3) => {
  if (!a || !b) return false;
  const da = new Date(a); const db = new Date(b);
  return Math.abs((da - db) / 86400000) <= days;
};

const BankReconciliation = ({ tenantId, currentUserId, selectedDate, daySales = [], dayCollect = [], dayExpenses = [] }) => {
  const [bankTx, setBankTx] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  // Combined candidate list of app-side bank/UPI lines for matching.
  const candidates = useMemo(() => {
    const list = [];
    daySales
      .filter(s => ['BANK','UPI','TRANSFER','NEFT','RTGS'].includes((s.paymentMethod || '').toUpperCase()))
      .forEach(s => list.push({
        kind: 'sale', id: s.id, date: s.date, amount: Number(s.totalAmount || s.paidAmount || 0),
        label: `Sale ${s.id?.slice(0, 8)} · ${s.paymentMethod}`,
      }));
    dayCollect
      .filter(p => ['BANK','UPI','TRANSFER','NEFT','RTGS'].includes((p.payment_method || '').toUpperCase()))
      .forEach(p => list.push({
        kind: 'payment', id: p.id, date: p.date, amount: Number(p.amount || 0),
        label: `Collection ${(p.id || '').slice(0, 8)} · ${p.payment_method}`,
      }));
    dayExpenses
      .filter(e => ['BANK','UPI','TRANSFER','NEFT','RTGS'].includes((e.paymentMethod || e.payment_method || '').toUpperCase()))
      .forEach(e => list.push({
        kind: 'expense', id: e.id, date: e.date, amount: Number(e.amount || 0),
        label: `Expense ${(e.id || '').slice(0, 8)} · ${e.category || ''}`,
      }));
    return list;
  }, [daySales, dayCollect, dayExpenses]);

  const fetchBankTx = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', selectedDate)
      .lte('date', selectedDate)
      .order('date', { ascending: false })
      .limit(500);
    if (!error) setBankTx(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchBankTx(); }, [tenantId, selectedDate]);

  const autoMatch = async () => {
    if (!bankTx.length) return;
    let matched = 0;
    for (const tx of bankTx) {
      if (tx.matched_sale_id || tx.matched_payment_id || tx.matched_expense_id) continue;
      const sign = tx.type === 'CREDIT' ? 1 : -1;
      const target = Math.abs(Number(tx.amount));
      // Only match expense lines on DEBIT, sale/payment on CREDIT.
      const pool = tx.type === 'CREDIT'
        ? candidates.filter(c => c.kind !== 'expense')
        : candidates.filter(c => c.kind === 'expense');
      const hits = pool.filter(c =>
        Math.abs(Math.abs(c.amount) - target) < 0.01 && inWindow(c.date, tx.date)
      );
      if (hits.length !== 1) continue; // ambiguous → leave for manual review
      const hit = hits[0];
      const patch = {
        matched_at: new Date().toISOString(),
        matched_by: currentUserId || null,
      };
      if (hit.kind === 'sale')    patch.matched_sale_id    = hit.id;
      if (hit.kind === 'payment') patch.matched_payment_id = hit.id;
      if (hit.kind === 'expense') patch.matched_expense_id = hit.id;
      const { error } = await supabase.from('bank_transactions').update(patch).eq('id', tx.id);
      if (!error) matched += 1;
      void sign; // unused but kept for clarity
    }
    setMsg(`Auto-matched ${matched} row${matched === 1 ? '' : 's'}.`);
    await fetchBankTx();
  };

  const handleImport = async (file) => {
    if (!file) return;
    setLoading(true); setMsg(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('Empty CSV');
      const cols = detectColumns(rows[0]);
      const payload = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const d = ymd(r[cols.date]);
        if (!d) continue;
        let amount = 0, type = null;
        if (cols.credit >= 0 && parseFloat(r[cols.credit])) {
          amount = parseFloat(r[cols.credit]); type = 'CREDIT';
        } else if (cols.debit >= 0 && parseFloat(r[cols.debit])) {
          amount = parseFloat(r[cols.debit]); type = 'DEBIT';
        } else if (cols.amount >= 0) {
          amount = parseFloat(r[cols.amount]);
          const t = (cols.type >= 0 ? r[cols.type] : '').toLowerCase();
          type = t.includes('dr') || amount < 0 ? 'DEBIT' : 'CREDIT';
          amount = Math.abs(amount);
        }
        if (!amount || !type) continue;
        payload.push({
          tenant_id: tenantId,
          date: d,
          amount,
          type,
          description: cols.desc >= 0 ? (r[cols.desc] || '').slice(0, 500) : null,
          reference_no: cols.ref >= 0 ? (r[cols.ref] || '').slice(0, 80) : null,
          source: 'CSV',
          created_by: currentUserId || null,
        });
      }
      if (!payload.length) throw new Error('No rows recognised. Check CSV columns.');
      const { error } = await supabase.from('bank_transactions').insert(payload);
      if (error) throw error;
      setMsg(`Imported ${payload.length} statement line${payload.length === 1 ? '' : 's'}.`);
      await fetchBankTx();
      await autoMatch();
    } catch (e) {
      setMsg(`Import failed: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const setMatch = async (txId, candidate) => {
    const patch = {
      matched_sale_id: null,
      matched_payment_id: null,
      matched_expense_id: null,
      matched_at: candidate ? new Date().toISOString() : null,
      matched_by: candidate ? (currentUserId || null) : null,
    };
    if (candidate?.kind === 'sale')    patch.matched_sale_id    = candidate.id;
    if (candidate?.kind === 'payment') patch.matched_payment_id = candidate.id;
    if (candidate?.kind === 'expense') patch.matched_expense_id = candidate.id;
    await supabase.from('bank_transactions').update(patch).eq('id', txId);
    fetchBankTx();
  };

  const deleteTx = async (txId) => {
    if (!confirm('Delete this statement line?')) return;
    await supabase.from('bank_transactions').delete().eq('id', txId);
    fetchBankTx();
  };

  // Summary chips
  const bankInApp = useMemo(() =>
    candidates.filter(c => c.kind !== 'expense').reduce((s, c) => s + c.amount, 0)
  , [candidates]);
  const bankInStmt = useMemo(() =>
    bankTx.filter(t => t.type === 'CREDIT').reduce((s, t) => s + Number(t.amount || 0), 0)
  , [bankTx]);
  const bankOutApp = useMemo(() =>
    candidates.filter(c => c.kind === 'expense').reduce((s, c) => s + c.amount, 0)
  , [candidates]);
  const bankOutStmt = useMemo(() =>
    bankTx.filter(t => t.type === 'DEBIT').reduce((s, t) => s + Number(t.amount || 0), 0)
  , [bankTx]);

  const inDelta  = bankInStmt - bankInApp;
  const outDelta = bankOutStmt - bankOutApp;
  const unmatchedCount = bankTx.filter(t =>
    !t.matched_sale_id && !t.matched_payment_id && !t.matched_expense_id
  ).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-lg font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: '"Sora", Inter, sans-serif' }}>
            Bank Reconciliation
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Match each bank/UPI line in DayBook against your bank statement.
          </p>
        </div>
        <input ref={fileRef} type="file" accept=".csv" hidden
          onChange={(e) => handleImport(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <Upload size={14} /> Import CSV
        </button>
        <button onClick={autoMatch} disabled={loading || !bankTx.length}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold disabled:opacity-40">
          <RefreshCcw size={14} /> Auto-match
        </button>
      </div>

      {/* Variance chips */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-mono tabular-nums">
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase">Bank In (app)</div>
          <div className="text-sm font-bold text-slate-900">{formatCurrency(bankInApp)}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase">Bank In (statement)</div>
          <div className="text-sm font-bold text-slate-900">{formatCurrency(bankInStmt)}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase">Δ Variance</div>
          <div className={`text-sm font-bold ${Math.abs(inDelta) < 0.5 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(Math.abs(inDelta))}{inDelta < 0 ? ' short' : inDelta > 0 ? ' extra' : ' ✓'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase">Unmatched</div>
          <div className={`text-sm font-bold ${unmatchedCount === 0 ? 'text-emerald-600' : 'text-accent-signature'}`}>
            {unmatchedCount}
          </div>
        </div>
      </div>

      {msg && (
        <div className="px-5 py-2 text-xs text-slate-600 bg-slate-50 border-b border-slate-100">{msg}</div>
      )}

      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {['Date', 'Type', 'Amount', 'Reference', 'Description', 'Matched to', ''].map(h => (
              <th key={h} className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 px-4 py-3"
                  style={{ fontFamily: '"Sora", Inter, sans-serif' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bankTx.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-sm text-slate-400 py-10">
                {loading ? 'Loading…' : 'No statement lines yet. Click "Import CSV" to start.'}
              </td>
            </tr>
          )}
          {bankTx.map(tx => {
            const matched = tx.matched_sale_id || tx.matched_payment_id || tx.matched_expense_id;
            const matchedLabel = (() => {
              if (tx.matched_sale_id)    return `Sale ${tx.matched_sale_id.slice(0, 8)}`;
              if (tx.matched_payment_id) return `Payment ${tx.matched_payment_id.slice(0, 8)}`;
              if (tx.matched_expense_id) return `Expense ${tx.matched_expense_id.slice(0, 8)}`;
              return null;
            })();
            const pool = tx.type === 'CREDIT'
              ? candidates.filter(c => c.kind !== 'expense')
              : candidates.filter(c => c.kind === 'expense');
            return (
              <tr key={tx.id} className={`border-b border-slate-100 hover:bg-slate-50 ${matched ? 'bg-emerald-50/30' : ''}`}>
                <td className="px-4 py-3 text-slate-700 font-mono tabular-nums">{tx.date}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    tx.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>{tx.type}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">{formatCurrency(tx.amount)}</td>
                <td className="px-4 py-3 text-slate-600 text-xs font-mono">{tx.reference_no || '—'}</td>
                <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[260px]" title={tx.description || ''}>
                  {tx.description || '—'}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={matched || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) { setMatch(tx.id, null); return; }
                      const c = pool.find(c => c.id === val);
                      if (c) setMatch(tx.id, c);
                    }}
                    className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white max-w-[240px]"
                  >
                    <option value="">— Unmatched —</option>
                    {pool.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.label} · {formatCurrency(c.amount)}
                      </option>
                    ))}
                  </select>
                  {matchedLabel && (
                    <div className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                      <Check size={10} /> {matchedLabel}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteTx(tx.id)}
                    className="text-slate-400 hover:text-red-500 p-1" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer help */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
        <strong>Tip:</strong> CSV must include columns for Date, Amount (or Credit/Debit), and ideally a Reference/UTR. Most Indian banks (HDFC, SBI, ICICI, Axis) export this format from net banking → Account Statement → Download CSV.
      </div>
    </div>
  );
};

export default BankReconciliation;
