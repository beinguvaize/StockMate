import React from 'react';
import CashBillPrint from './CashBillPrint';
import GSTInvoicePrint from './GSTInvoicePrint';

// Picks layout by client. Walk-in (no client row or marker) → simple cash bill,
// no GST lines. Registered client → full tax invoice with CGST/SGST/IGST.
const isWalkIn = (sale, client) => {
  const cid = sale?.shopId ?? sale?.shop_id ?? sale?.clientId ?? null;
  if (!cid) return true;
  const markers = ['WALKIN', 'WALK-IN', 'WALK_IN', 'POS-WALKIN'];
  if (markers.includes(String(cid).toUpperCase())) return true;
  if (!client) return true;
  if (!client.name) return true;
  if (/walk[\s-]?in/i.test(client.name)) return true;
  return false;
};

const SalePrintDispatcher = ({ sale, client, business, onClose }) => {
  if (!sale) return null;
  if (isWalkIn(sale, client)) {
    return <CashBillPrint sale={sale} business={business || {}} onClose={onClose} />;
  }
  return <GSTInvoicePrint sale={sale} client={client || {}} business={business || {}} onClose={onClose} />;
};

export default SalePrintDispatcher;
