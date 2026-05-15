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
  final String? irnStatus; // null | PENDING | PROCESSING | SUCCESS | FAILED | CANCELLED | NOT_APPLICABLE

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
  });

  /// Amount still owed — matches web's outstandingOf(inv)
  double get outstanding => (grandTotal - paidAmount).clamp(0, double.infinity);

  /// Display invoice number — matches web fallback logic
  String get displayNumber =>
      invoiceNumber?.isNotEmpty == true ? invoiceNumber! : '#${id.substring(id.length - 6).toUpperCase()}';

  /// Customer display name
  String get displayClientName => clientName?.isNotEmpty == true ? clientName! : 'Unknown';

  /// Adapts a POS/van Sale record to Invoice for display in InvoiceDetailScreen.
  factory Invoice.fromSale(Sale s) {
    final total = s.totalAmount ?? 0.0;
    final taxAmt = s.tax ?? 0.0;
    final taxable = s.subtotal ?? (total - taxAmt);
    return Invoice(
      id:            s.id,
      invoiceNumber: null,
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
    );
  }
}
