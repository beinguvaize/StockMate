import 'package:mobile_app/features/sales/data/models/sale.dart';

/// Maps to the `invoices` table — same table web Invoices.jsx reads.
/// Fields match the web's normalizeRow(row, NUMERIC_INVOICE_COLS) output.
class Invoice {
  final String id;
  final String? invoiceNumber;
  final String? clientId;
  final String? clientName;
  final String? invoiceDate;  // YYYY-MM-DD
  final String? dueDate;      // YYYY-MM-DD — used for overdue detection
  final double grandTotal;    // total including tax
  final double paidAmount;    // amount already paid (partial or full)
  final String paymentStatus; // 'PAID' | 'PARTIAL' | 'UNPAID'
  final double? taxableAmount;
  final double? cgstAmount;
  final double? sgstAmount;
  final double? igstAmount;
  final double? roundOff;
  final String? paymentMethod;
  final String? notes;
  final DateTime? createdAt;
  final List<dynamic>? items; // JSON items array stored in DB

  // E-invoice IRN fields
  final String? irn;
  final String? ackNo;
  final String? ackDate;
  final String? signedQr;
  final String? irnStatus;

  // GST client fields (set on Sale → Invoice conversion)
  final String? clientGstin;
  final String? clientAddress;
  final String? clientPhone;
  final String? placeOfSupply;
  final String? saleId; // back-link to originating POS sale
  // When this Invoice instance is a view-adapter built from a Sale that has
  // already been converted to a real invoice, this carries the linked
  // invoice id so the UI can flip the action button to 'View GST Invoice'.
  final String? linkedInvoiceIdFromSale;

  Invoice({
    required this.id,
    this.invoiceNumber,
    this.clientId,
    this.clientName,
    this.invoiceDate,
    this.dueDate,
    this.grandTotal = 0,
    this.paidAmount = 0,
    this.paymentStatus = 'UNPAID',
    this.taxableAmount,
    this.cgstAmount,
    this.sgstAmount,
    this.igstAmount,
    this.roundOff,
    this.paymentMethod,
    this.notes,
    this.createdAt,
    this.items,
    this.irn,
    this.ackNo,
    this.ackDate,
    this.signedQr,
    this.irnStatus,
    this.clientGstin,
    this.clientAddress,
    this.clientPhone,
    this.placeOfSupply,
    this.saleId,
    this.linkedInvoiceIdFromSale,
  });

  /// Amount still owed — matches web's outstandingOf(inv)
  double get outstanding => (grandTotal - paidAmount).clamp(0, double.infinity);

  /// True when this view-adapter represents a POS sale, not a real GST invoice.
  bool get isSaleSource => id.startsWith('SAL-');

  /// Display number.
  /// - Real GST invoice: 'INV/2026-27/0001' (server-issued invoice_number).
  /// - Sale: 'SAL-XXXXXX' (last 6 of id, uppercased). Never bare '#XXXXXX'
  ///   so it's never mistaken for a tax-invoice number.
  String get displayNumber {
    if (invoiceNumber != null && invoiceNumber!.isNotEmpty) return invoiceNumber!;
    final tail = id.substring(id.length - 6).toUpperCase();
    return isSaleSource ? 'SAL-$tail' : '#$tail';
  }

  /// Human-friendly document type label for headers / cards.
  String get docKind => isSaleSource ? 'Sale Receipt' : 'Invoice';

  /// Customer display name
  String get displayClientName => clientName?.isNotEmpty == true ? clientName! : 'Unknown';

  /// Walk-in detection — no client id linked to the underlying sale.
  bool get isWalkIn =>
      (clientId == null || clientId!.isEmpty) &&
      (clientGstin == null || clientGstin!.isEmpty);

  /// Adapts a POS/van Sale record to Invoice for display in InvoiceDetailScreen.
  factory Invoice.fromSale(Sale s) {
    final total = s.totalAmount ?? 0.0;
    final taxAmt = s.tax ?? 0.0;
    final taxable = s.subtotal ?? (total - taxAmt);
    return Invoice(
      id:            s.id,
      invoiceNumber: null,
      clientId:      s.shopId,
      clientName:    s.displayCustomerName,
      invoiceDate:   s.date,
      dueDate:       s.date,
      grandTotal:    total,
      paidAmount:    (s.paymentStatus?.toUpperCase() == 'PAID') ? total : 0.0,
      paymentStatus: s.paymentStatus?.toUpperCase() ?? 'UNPAID',
      taxableAmount: taxable,
      igstAmount:    taxAmt > 0 ? taxAmt : null,
      paymentMethod: s.paymentMethod,
      items:         s.items,
      // Carry the back-link so the UI can flip the Convert button to
      // 'View GST Invoice' when the sale has already been promoted.
      linkedInvoiceIdFromSale: s.invoiceId,
    );
  }

  factory Invoice.fromJson(Map<String, dynamic> j) {
    double toNum(dynamic v) =>
        v == null ? 0.0 : double.tryParse(v.toString()) ?? 0.0;

    return Invoice(
      id:            j['id'] as String,
      invoiceNumber: j['invoice_number'] as String?,
      clientId:      j['client_id'] as String?,
      clientName:    (j['client_name'] ?? j['clientName']) as String?,
      invoiceDate:   j['invoice_date'] as String?,
      dueDate:       j['due_date'] as String?,
      grandTotal:    toNum(j['grand_total']),
      paidAmount:    toNum(j['paid_amount']),
      paymentStatus: (j['payment_status'] as String? ?? 'UNPAID').toUpperCase(),
      taxableAmount: j['taxable_amount'] != null ? toNum(j['taxable_amount']) : null,
      cgstAmount:    j['cgst_amount']    != null ? toNum(j['cgst_amount'])    : null,
      sgstAmount:    j['sgst_amount']    != null ? toNum(j['sgst_amount'])    : null,
      igstAmount:    j['igst_amount']    != null ? toNum(j['igst_amount'])    : null,
      roundOff:      j['round_off']      != null ? toNum(j['round_off'])      : null,
      paymentMethod: j['payment_method'] as String?,
      notes:         j['notes'] as String?,
      createdAt:     j['created_at'] != null
          ? DateTime.tryParse(j['created_at'] as String)
          : null,
      items:         j['items'] as List<dynamic>?,
      irn:           j['irn'] as String?,
      ackNo:         j['ack_no'] as String?,
      ackDate:       j['ack_date'] as String?,
      signedQr:      j['signed_qr'] as String?,
      irnStatus:     (j['irn_status'] as String?)?.toUpperCase(),
      clientGstin:   j['client_gstin']    as String?,
      clientAddress: j['client_address']  as String?,
      clientPhone:   j['client_phone']    as String?,
      placeOfSupply: j['place_of_supply'] as String?,
      saleId:        j['sale_id']         as String?,
    );
  }
}
