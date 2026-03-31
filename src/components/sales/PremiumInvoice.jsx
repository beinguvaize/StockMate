import React, { useState, useEffect} from 'react';
import { 
 Printer, X, Edit3, Check, Calendar, 
 CreditCard, Building2, MapPin, Phone, 
 Mail, Globe, ShieldCheck, Download
} from 'lucide-react';

const PremiumInvoice = ({ order, business, onClose}) => {
 const [isEditMode, setIsEditMode] = useState(false);
 const [editedOrder, setEditedOrder] = useState({
 invoiceNo: order.id ? String(order.id).split('-').pop() : 'NEW',
 date: order.date ? new Date(order.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
 dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN'),
 remarks: order.salesmanNote || 'Thanks for your business!',
 paymentMethod: order.paymentMethod || 'CASH'
});

 const [client, setClient] = useState(order.customerInfo || {
 name: 'Walk-in Customer',
 phone: '',
 address: '',
 gstin: ''
});

 // UPI QR Generation URL (Google Charts API)
 // upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&cu=INR
 const upiLink = business.upi_id 
 ? `upi://pay?pa=${business.upi_id}&pn=${encodeURIComponent(business.name)}&am=${order.totalAmount}&cu=INR`
 : null;
 const qrCodeUrl = upiLink 
 ? `https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${encodeURIComponent(upiLink)}&choe=UTF-8`
 : null;

 const handlePrint = () => {
 window.print();
};

 return (
 <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto no-scrollbar print:p-0 print:block print:bg-white print:static">
 
 {/* Toolbar - Hidden on Print */}
 <div className="fixed top-6 right-6 flex gap-3 z-[110] print:hidden">
 <button 
 onClick={() => setIsEditMode(!isEditMode)}
 className={`flex items-center gap-3 px-6 py-3 rounded-pill font-bold text-sm transition-all ${
 isEditMode ? 'bg-[#C8F135] text-black shadow-lg' : 'bg-surface text-ink-primary border border-black/5 hover:bg-black/5'
}`}
 >
 {isEditMode ? <Check size={16} /> : <Edit3 size={16} />}
 {isEditMode ? 'SAVE CHANGES' : 'EDIT INVOICE'}
 </button>
 <button 
 onClick={handlePrint}
 className="flex items-center gap-3 px-6 py-3 rounded-pill bg-ink-primary text-surface font-bold text-sm hover:shadow-2xl transition-all"
 >
 <Printer size={16} />
 PRINT
 </button>
 <button 
 onClick={onClose}
 className="w-12 h-12 rounded-full bg-surface border border-black/5 flex items-center justify-center text-ink-primary hover:bg-red-50 hover:text-red-500 transition-all shadow-lg"
 >
 <X size={20} />
 </button>
 </div>

 {/* Invoice Container */}
 <div className="bg-white w-full max-w-[850px] min-h-[1100px] shadow-2xl relative overflow-hidden print:shadow-none print:max-w-none print:w-full">
 
 {/* Header Decoration */}
 <div className="absolute top-0 right-0 w-32 h-32 bg-[#C8F135] opacity-10 rounded-bl-[100px] print:hidden"></div>
 <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent-signature via-[#C8F135] to-accent-signature"></div>

 {/* Main Body */}
 <div className="p-6 md:p-16 flex flex-col h-full space-y-12">
 
 {/* Header: Brand & Meta */}
 <div className="flex flex-col md:flex-row justify-between items-start gap-5 border-b-2 border-black/5 pb-10">
 <div className="space-y-4">
 <h1 className="text-4xl md:text-5xl font-black font-sora text-ink-primary leading-tight tracking-tight mb-2 uppercase">{business.name || 'BUSINESS NAME'}<span className="text-accent-signature">.</span></h1>
 <div className="space-y-2">
 <div className="flex items-center gap-3 text-sm font-semibold text-gray-700 opacity-80">
 <MapPin size={16} className="text-accent-signature" />
 {business.address || 'Business Address Not Set'}
 </div>
 <div className="flex items-center gap-4">
 <div className="flex items-center gap-3 text-sm font-semibold text-gray-700 opacity-80">
 <Phone size={16} className="text-accent-signature" />
 {business.phone || '+91 00000 00000'}
 </div>
 <div className="flex items-center gap-3 text-sm font-semibold text-gray-700 opacity-80">
 <Mail size={16} className="text-accent-signature" />
 {business.email || 'business@mail.com'}
 </div>
 </div>
 <div className="pt-2 flex gap-4">
 {business.gst_no && (
 <div className="text-sm font-bold text-ink-primary flex items-center gap-2">
 <span className="opacity-60">GSTIN:</span> {business.gst_no}
 </div>
 )}
 {business.pan_no && (
 <div className="text-sm font-bold text-ink-primary flex items-center gap-2">
 <span className="opacity-60">PAN:</span> {business.pan_no}
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="text-right space-y-4">
 <h2 className="text-5xl md:text-6xl font-semibold text-black/10 select-none">
 INVOICE
 </h2>
 <div className="space-y-2 font-semibold text-right">
 <div className="flex justify-end items-center gap-4">
 <span className="text-sm opacity-60">Invoice No:</span>
 <span className="text-lg font-bold text-ink-primary"># {editedOrder.invoiceNo}</span>
 </div>
 <div className="flex justify-end items-center gap-4">
 <span className="text-sm opacity-60">Date:</span>
 {isEditMode ? (
 <input 
 type="text" 
 className="text-right text-base border-b border-black/20 outline-none focus:border-accent-signature"
 value={editedOrder.date}
 onChange={e => setEditedOrder({...editedOrder, date: e.target.value})}
 />
 ) : (
 <span className="text-base text-ink-primary">{editedOrder.date}</span>
 )}
 </div>
 <div className="flex justify-end items-center gap-4">
 <span className="text-sm opacity-60">Due Date:</span>
 {isEditMode ? (
 <input 
 type="text" 
 className="text-right text-base border-b border-black/20 outline-none focus:border-accent-signature"
 value={editedOrder.dueDate}
 onChange={e => setEditedOrder({...editedOrder, dueDate: e.target.value})}
 />
 ) : (
 <span className="text-base text-ink-primary">{editedOrder.dueDate}</span>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* Billing Info */}
 <div className="bg-canvas border border-black/5 rounded-lg p-5 flex flex-col md:flex-row justify-between gap-5">
 <div className="space-y-3">
 <div className="text-sm font-bold text-accent-signature">Bill To:</div>
 <div className="space-y-2">
 {isEditMode ? (
 <input 
 className="text-2xl font-bold text-ink-primary w-full bg-white border border-black/10 rounded px-2 outline-none"
 value={client.name}
 onChange={e => setClient({...client, name: e.target.value})}
 />
 ) : (
 <h3 className="text-2xl font-bold text-ink-primary leading-none">{client.name}</h3>
 )}
 <div className="text-sm text-gray-700 mt-2">
 {isEditMode ? (
 <textarea 
 className="w-full bg-white border border-black/10 rounded px-2 outline-none resize-none"
 value={client.address}
 onChange={e => setClient({...client, address: e.target.value})}
 rows="2"
 />
 ) : (
 client.address || 'Address Not Provided'
 )}
 </div>
 <div className="flex gap-4 mt-2">
 <div className="text-sm font-semibold text-ink-primary flex items-center gap-2">
 <span className="opacity-60">PH:</span> {client.phone || 'N/A'}
 </div>
 <div className="text-sm font-semibold text-ink-primary flex items-center gap-2">
 <span className="opacity-60">GSTIN:</span> {client.gstin || 'N/A'}
 </div>
 </div>
 </div>
 </div>

 <div className="text-right space-y-3">
 <div className="text-sm font-bold text-accent-signature">Payment Details:</div>
 <div className="space-y-2">
 <div className="text-xl font-bold text-ink-primary">
 {editedOrder.paymentMethod}
 </div>
 <div className="bg-green-50 text-green-700 px-4 py-1.5 rounded-full inline-flex items-center gap-2 text-xs font-bold border border-green-200">
 STATUS: {order.paymentStatus || 'PAID'}
 </div>
 </div>
 </div>
 </div>

 {/* Order Table */}
 <div className="flex-1">
 <table className="w-full border-separate border-spacing-0">
 <thead>
 <tr>
 <th className="px-4 py-2 text-left border-y-2 border-black/10 text-xs font-bold text-gray-700">S.No</th>
 <th className="px-4 py-2 text-left border-y-2 border-black/10 text-xs font-bold text-gray-700">Item Description</th>
 <th className="px-4 py-2 text-right border-y-2 border-black/10 text-xs font-bold text-gray-700">QTY</th>
 <th className="px-4 py-2 text-right border-y-2 border-black/10 text-xs font-bold text-gray-700">Rate</th>
 <th className="px-4 py-2 text-right border-y-2 border-black/10 text-xs font-bold text-gray-700">Amount</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-black/5">
 {order.items && order.items.map((item, idx) => (
 <tr key={idx} className="group hover:bg-black/[0.02] transition-colors">
 <td className="px-4 py-5 text-sm text-ink-primary opacity-60 font-medium">{String(idx + 1).padStart(2, '0')}</td>
 <td className="px-4 py-5 font-medium">
 <div className="text-base text-ink-primary mb-1">{item.name || item.productName || 'Unknown Product'}</div>
 <div className="text-xs text-gray-700 opacity-80">SKU: {item.sku || 'N/A'}</div>
 </td>
 <td className="px-4 py-5 text-right text-base font-semibold text-ink-primary">{item.quantity} <span className="text-sm font-normal opacity-70 border-l border-black/10 pl-2 ml-1">{item.unit || 'PCS'}</span></td>
 <td className="px-4 py-5 text-right text-base text-gray-700">₹{(item.price || item.sellingPrice || 0).toLocaleString()}</td>
 <td className="px-4 py-5 text-right text-base font-bold text-ink-primary">₹{((item.price || item.sellingPrice || 0) * item.quantity).toLocaleString()}</td>
 </tr>
 ))}
 {/* Fill empty rows */}
 {[...Array(Math.max(0, 3 - (order.items?.length || 0)))].map((_, i) => (
 <tr key={`empty-${i}`} className="opacity-20 leading-loose">
 <td colSpan="5" className="px-4 py-5 border-b border-black/[0.02]">&nbsp;</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Summary & Footer */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-8">
 {/* Bank Details & QR */}
 <div className="flex gap-5 items-start">
 {qrCodeUrl && (
 <div className="bg-canvas p-3 rounded-lg border border-black/10 shrink-0">
 <img src={qrCodeUrl} alt="UPI QR" className="w-28 h-28" />
 </div>
 )}
 <div className="space-y-3 pt-2">
 <div className="text-sm font-bold text-accent-signature">Bank Details:</div>
 <div className="space-y-1.5 text-sm">
 <div className="flex gap-2 text-ink-primary"><span className="opacity-60 font-medium w-16">Bank:</span> <span className="font-semibold">{business.bank_name || 'N/A'}</span></div>
 <div className="flex gap-2 text-ink-primary"><span className="opacity-60 font-medium w-16">A/C No:</span> <span className="font-semibold">{business.account_no || 'N/A'}</span></div>
 <div className="flex gap-2 text-ink-primary"><span className="opacity-60 font-medium w-16">IFSC:</span> <span className="font-semibold">{business.ifsc_code || 'N/A'}</span></div>
 <div className="flex gap-2 text-ink-primary"><span className="opacity-60 font-medium w-16">UPI:</span> <span className="font-semibold">{business.upi_id || 'N/A'}</span></div>
 </div>
 </div>
 </div>

 {/* Grand Totals */}
 <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 shadow-sm">
 <div className="space-y-4">
 <div className="flex justify-between items-center text-sm font-medium text-gray-700">
 <span>Subtotal</span>
 <span>₹{order.subtotal?.toLocaleString() || '0'}</span>
 </div>
 <div className="flex justify-between items-center text-sm font-medium text-gray-700 pb-4 border-b border-black/10">
 <span>Discount / Tax</span>
 <span>₹{((order.tax || 0) - (order.discount || 0)).toLocaleString() || '0'}</span>
 </div>
 <div className="flex justify-between items-end pt-2">
 <span className="text-base font-bold text-ink-primary">Grand Total</span>
 <div className="text-right">
 <div className="text-4xl font-semibold text-ink-primary">
 ₹{order.totalAmount?.toLocaleString() || '0'}
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Final Declaration */}
 <div className="flex flex-col md:flex-row justify-between items-end gap-4 pt-8">
 <div className="flex-1 space-y-4 max-w-[450px]">
 <div className="space-y-2">
 <div className="text-sm font-bold text-ink-primary">Terms & Conditions:</div>
 {isEditMode ? (
 <textarea 
 className="w-full bg-white border border-black/20 rounded p-2 text-sm text-gray-700 outline-none resize-none"
 value={editedOrder.remarks}
 onChange={e => setEditedOrder({...editedOrder, remarks: e.target.value})}
 rows="3"
 />
 ) : (
 <p className="text-sm text-gray-700 leading-relaxed">
 {editedOrder.remarks}
 </p>
 )}
 </div>
 </div>

 <div className="text-center md:text-right space-y-16">
 <div className="space-y-2 pt-8">
 <div className="h-[1px] w-full md:w-56 bg-black/30 ml-auto"></div>
 <div className="text-sm font-bold text-ink-primary">
 Authorized Signatory
 <div className="text-xs text-gray-700 font-normal mt-1">For {business.name || 'SK Trading'}</div>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Print Only Footer Information */}
 <div className="hidden print:block absolute bottom-8 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-700 opacity-70">
 Document generated by Ledgr ERP System
 </div>
 </div>
 
 {/* Global Print Styles */}
 <style dangerouslySetInnerHTML={{ __html: `
 @media print {
 @page { margin: 0; size: A4;}
 body { margin: 0; background: white;}
 .animate-fade-in { animation: none !important; transform: none !important;}
}
 `}} />
 </div>
 );
};

export default PremiumInvoice;
