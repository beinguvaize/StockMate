class Expense {
  final String id;
  final String? category;
  final double? amount;
  final String? note;
  final String? date;
  final String? routeId;
  final String? splitType;
  final DateTime? createdAt;
  // GST input-tax-credit (ITC): tax backed out of an inclusive amount.
  // Only counts as claimable ITC when vendorGstin is present (matches web).
  final double? gstAmount;
  final String? vendorGstin;
  // Owner drawing / loan repayment / capital — excluded from P&L profit.
  final bool excludeFromPl;
  // CASH | UPI | BANK | CARD. Null on rows read from the offline cache, which
  // does not hold it.
  final String? paymentMethod;
  final double? gstRate;
  // Store or till the expense was paid from; null is business-wide.
  final String? locationId;

  Expense({
    required this.id,
    this.category,
    this.amount,
    this.note,
    this.date,
    this.routeId,
    this.splitType,
    this.createdAt,
    this.gstAmount,
    this.vendorGstin,
    this.excludeFromPl = false,
    this.paymentMethod,
    this.gstRate,
    this.locationId,
  });

  /// Claimable input tax credit for this row (0 unless a vendor GSTIN is set).
  double get claimableItc =>
      (vendorGstin != null && vendorGstin!.isNotEmpty) ? (gstAmount ?? 0) : 0;

  factory Expense.fromJson(Map<String, dynamic> json) {
    return Expense(
      id: json['id'] as String,
      category: json['category'] as String?,
      amount: (json['amount'] as num?)?.toDouble(),
      note: json['note'] as String?,
      date: json['date'] as String?,
      routeId: json['route_id'] as String?,
      splitType: json['split_type'] as String?,
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at'] as String) : null,
      gstAmount: (json['gst_amount'] as num?)?.toDouble(),
      vendorGstin: json['vendor_gstin'] as String?,
      excludeFromPl: json['exclude_from_pl'] == true,
      paymentMethod: json['payment_method'] as String?,
      gstRate: (json['gst_rate'] as num?)?.toDouble(),
      locationId: json['location_id'] as String?,
    );
  }
}
