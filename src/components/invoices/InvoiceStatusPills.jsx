import React from 'react';
import { Badge } from '../ui/badge';
import { STATUS_LABEL, STATUS_TONE, deliveryPill } from '../../lib/invoiceList';

/** An invoice's pills: payment status, then delivery, then e-Way bill. */
export default function InvoiceStatusPills({ inv, status, showEway = true, className = 'flex flex-wrap gap-1' }) {
  const dp = deliveryPill(inv);
  return (
    <span className={className}>
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      {dp && <Badge tone={dp.tone}>{dp.label}</Badge>}
      {showEway && inv.eway_no && <Badge tone="good" title={`e-Way bill ${inv.eway_no}`}>e-Way bill</Badge>}
    </span>
  );
}
