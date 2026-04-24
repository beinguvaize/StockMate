import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import {
  ArrowLeft, User, Calendar, FileText,
  CheckCircle2, AlertCircle, Search, Clock, Receipt
} from 'lucide-react';
import { todayISOInAppTZ, formatDate, formatCurrency } from '../lib/utils';

const ClientSettlement = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { clients, recordClientPayment, loading: peoLoading } = usePeople(currentTenantId);
  const { invoices, loading: salesLoading } = useSales(currentTenantId);

  const loading = peoLoading || salesLoading;

  const client = useMemo(() =>
    (clients || []).find(c => String(c.id) === String(id)),
    [clients, id]
  );

  const [paymentData, setPaymentData] = useState({
    amount: '',
    date: todayISOInAppTZ(),
    notes: '',
    paymentMethod: 'CASH'
  });
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [paymentError, setPaymentError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const clientInvoices = useMemo(() => {
    if (!client) return [];
    return (invoices || [])
      .filter(inv => inv.client_id === client.id && inv.payment_status !== 'PAID')
      .filter(inv =>
        inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(inv.grand_total).includes(searchTerm)
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [client, invoices, searchTerm]);

  const toggleInvoice = (inv) => {
    const isSelected = selectedInvoiceIds.includes(inv.id);
    const newSelection = isSelected
      ? selectedInvoiceIds.filter(x => x !== inv.id)
      : [...selectedInvoiceIds, inv.id];
    const newAmt = isSelected
      ? Math.max(0, (parseFloat(paymentData.amount) || 0) - inv.grand_total)
      : (parseFloat(paymentData.amount) || 0) + inv.grand_total;
    setSelectedInvoiceIds(newSelection);
    setPaymentData({ ...paymentData, amount: newAmt.toString() });
  };

  const toggleAll = () => {
    if (selectedInvoiceIds.length === clientInvoices.length) {
      setSelectedInvoiceIds([]);
      setPaymentData({ ...paymentData, amount: '0' });
    } else {
      setSelectedInvoiceIds(clientInvoices.map(i => i.id));
      setPaymentData({ ...paymentData, amount: clientInvoices.reduce((s, i) => s + i.grand_total, 0).toString() });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!client) return;
    setPaymentError('');
    const amt = parseFloat(paymentData.amount);
    if (isNaN(amt) || amt <= 0) { setPaymentError('Enter a valid payment amount.'); return; }
    setIsSubmitting(true);
    try {
      const res = await recordClientPayment(client.id, amt, paymentData.date, paymentData.notes, selectedInvoiceIds);
      if (res?.success === false) {
        setPaymentError(res.error || 'Payment failed. Try again.');
      } else {
        setSuccess(true);
        setTimeout(() => navigate(-1), 1200);
      }
    } catch (err) {
      setPaymentError('Payment failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-accent-signature/30 border-t-accent-signature rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12">
        <AlertCircle size={48} className="mx-auto mb-4 text-red-400 opacity-50" />
        <h2 className="text-2xl font-bold text-ink-primary mb-2">Client Not Found</h2>
        <p className="text-sm text-gray-500 mb-6">This client record may have been deleted.</p>
        <button onClick={() => navigate(-1)} className="btn-signature px-8 h-11 !rounded-xl text-xs font-bold uppercase tracking-widest">
          Back to Clients
        </button>
      </div>
    );
  }

  const selectedTotal = clientInvoices
    .filter(i => selectedInvoiceIds.includes(i.id))
    .reduce((s, i) => s + i.grand_total, 0);

  const outstanding = client.outstanding_balance || 0;

  return (
    <div className="animate-fade-in pb-16">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 rounded-xl border border-black/10 bg-white flex items-center justify-center text-ink-primary hover:bg-canvas transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-4xl md:text-6xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight uppercase">
            Settle<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">
            Record payment for {client.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left panel */}
        <div className="lg:col-span-4 space-y-5">

          {/* Client card */}
          <div className="bg-white rounded-2xl border border-black/5 p-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-ink-primary flex items-center justify-center text-accent-signature text-lg font-black">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-base font-black text-ink-primary uppercase leading-tight">{client.name}</div>
                <div className="text-[10px] text-gray-400 font-semibold mt-0.5">{client.gstin || client.gst_no || 'Unregistered'}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                <div className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-1">Outstanding</div>
                <div className="text-xl font-black text-red-600 tabular-nums">{formatCurrency(outstanding)}</div>
              </div>
              <div className="bg-canvas rounded-xl p-3 border border-black/5">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Unpaid Invoices</div>
                <div className="text-xl font-black text-ink-primary tabular-nums">{clientInvoices.length}</div>
              </div>
            </div>

            <div className="space-y-2 text-xs font-semibold text-gray-600">
              {client.phone && <div>📞 {client.phone}</div>}
              {client.address && <div>📍 {client.address}</div>}
            </div>
          </div>

          {/* Payment form */}
          <div className="bg-white rounded-2xl border border-black/5 p-5">
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-5">Record Payment</h4>

            <form onSubmit={handleSubmit} className="space-y-4">
              {paymentError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-red-600">{paymentError}</p>
                </div>
              )}

              {success && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <p className="text-xs font-semibold text-emerald-700">Payment recorded!</p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Payment Date</label>
                <input
                  required type="date"
                  className="w-full bg-canvas border border-black/5 rounded-xl px-4 py-3 text-sm font-bold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
                  value={paymentData.date}
                  onChange={e => setPaymentData({ ...paymentData, date: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Amount Received</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-gray-400">
                    {businessProfile?.currencySymbol || '₹'}
                  </span>
                  <input
                    required type="number" step="0.01" placeholder="0.00"
                    className="w-full bg-canvas border border-black/5 rounded-xl pl-8 pr-4 py-3 text-xl font-black text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums"
                    value={paymentData.amount}
                    onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })}
                  />
                </div>
                {selectedTotal > 0 && (
                  <div className="text-[10px] text-accent-signature font-bold">
                    Selected invoices total: {formatCurrency(selectedTotal)}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Payment Method</label>
                <select
                  className="w-full bg-canvas border border-black/5 rounded-xl px-4 py-3 text-sm font-bold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
                  value={paymentData.paymentMethod}
                  onChange={e => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Notes (optional)</label>
                <textarea
                  className="w-full bg-canvas border border-black/5 rounded-xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 resize-none h-20 placeholder:text-gray-300"
                  placeholder="Cheque no, reference ID…"
                  value={paymentData.notes}
                  onChange={e => setPaymentData({ ...paymentData, notes: e.target.value })}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !hasPermission('clients', 'edit') || success}
                className="w-full btn-signature h-12 !rounded-xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                {isSubmitting ? 'Saving…' : 'Record Payment'}
              </button>
            </form>
          </div>
        </div>

        {/* Right panel — invoice list */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">

            {/* Toolbar */}
            <div className="p-4 border-b border-black/5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-xs">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search invoices…"
                  className="w-full bg-canvas rounded-xl py-2.5 pl-9 pr-4 border border-black/5 text-xs font-medium outline-none focus:ring-2 focus:ring-accent-signature/20"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-gray-500">
                  {selectedInvoiceIds.length} of {clientInvoices.length} selected
                </span>
                <button
                  onClick={toggleAll}
                  className="px-4 py-2 rounded-lg bg-ink-primary text-white text-[11px] font-bold hover:opacity-90 transition-opacity"
                >
                  {selectedInvoiceIds.length === clientInvoices.length && clientInvoices.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-canvas/50 border-b border-black/5">
                    <th className="py-3 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">#</th>
                    <th className="py-3 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Invoice</th>
                    <th className="py-3 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                    <th className="py-3 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount Due</th>
                    <th className="py-3 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Select</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {clientInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-20 text-center">
                        <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-400 opacity-40" />
                        <p className="text-sm font-bold text-gray-400">No outstanding invoices</p>
                        <p className="text-xs text-gray-400 mt-1">This client has no pending payments.</p>
                      </td>
                    </tr>
                  ) : clientInvoices.map((inv, idx) => {
                    const isSelected = selectedInvoiceIds.includes(inv.id);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => toggleInvoice(inv)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-accent-signature/5' : 'hover:bg-canvas/60'}`}
                      >
                        <td className="py-4 px-4 text-[11px] font-semibold text-gray-400">{idx + 1}</td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-ink-primary text-accent-signature' : 'bg-canvas border border-black/5 text-gray-400'}`}>
                              <Receipt size={15} />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-ink-primary">#{inv.invoice_number}</div>
                              <div className="text-[10px] text-gray-400 font-semibold mt-0.5">
                                {inv.payment_status === 'PARTIAL' ? 'Partial' : 'Unpaid'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-sm font-semibold text-ink-primary">{formatDate(inv.invoice_date || inv.created_at)}</div>
                          <div className="text-[10px] text-gray-400 font-medium mt-0.5 flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className={`text-sm font-black tabular-nums ${isSelected ? 'text-ink-primary' : 'text-gray-700'}`}>
                            {formatCurrency(inv.grand_total)}
                          </div>
                          {inv.paid_amount > 0 && (
                            <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                              Paid: {formatCurrency(inv.paid_amount)}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className={`w-6 h-6 mx-auto rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-accent-signature border-accent-signature' : 'border-black/10 bg-white'}`}>
                            {isSelected && <CheckCircle2 size={14} className="text-ink-primary" />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer summary */}
            {clientInvoices.length > 0 && (
              <div className="border-t border-black/5 bg-ink-primary px-6 py-4 flex items-center justify-between rounded-b-2xl">
                <div>
                  <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-0.5">Selected Total</div>
                  <div className="text-2xl font-black text-white tabular-nums">{formatCurrency(selectedTotal)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-0.5">Remaining After</div>
                  <div className="text-xl font-black text-accent-signature tabular-nums">
                    {formatCurrency(Math.max(0, outstanding - selectedTotal))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientSettlement;
