class Sale {
  final String id;
  final String? shopId;
  final String? customerName;           // top-level field in DB
  final Map<String, dynamic>? customerInfo;
  final String? paymentMethod;
  final String? paymentStatus;
  final String? routeId;
  final List<dynamic>? items;
  final double? subtotal;
  final double? discount;
  final double? tax;
  final double? totalAmount;
  final double? paidAmount;
  /// Actual cash handed over. May exceed the bill (change given, or the
  /// excess applied to older dues); paidAmount is capped at the bill.
  final double? amountReceived;
  final String? date;
  final String? status;
  final DateTime? createdAt;
  final String? invoiceId; // back-link if this sale has been converted to a GST invoice

  Sale({
    required this.id,
    this.shopId,
    this.customerName,
    this.customerInfo,
    this.paymentMethod,
    this.paymentStatus,
    this.routeId,
    this.items,
    this.subtotal,
    this.discount,
    this.tax,
    this.totalAmount,
    this.paidAmount,
    this.amountReceived,
    this.date,
    this.status,
    this.createdAt,
    this.invoiceId,
  });

  /// Resolved display name — checks customerName, then customerInfo.name, then fallback.
  String get displayCustomerName =>
      customerName?.isNotEmpty == true
          ? customerName!
          : (customerInfo?['name'] as String?)?.isNotEmpty == true
              ? customerInfo!['name'] as String
              : 'Walk-in Customer';

  factory Sale.fromJson(Map<String, dynamic> json) {
    return Sale(
      id: json['id'] as String,
      shopId: json['shopId'] as String?,
      customerName: json['customerName'] as String?,
      customerInfo: json['customerInfo'] as Map<String, dynamic>?,
      paymentMethod: json['paymentMethod'] as String?,
      paymentStatus: json['paymentStatus'] as String?,
      routeId: json['routeId'] as String?,
      items: json['items'] as List<dynamic>?,
      subtotal: (json['subtotal'] as num?)?.toDouble(),
      discount: (json['discount'] as num?)?.toDouble(),
      tax: (json['tax'] as num?)?.toDouble(),
      totalAmount: (json['totalAmount'] as num?)?.toDouble(),
      paidAmount: (json['paidAmount'] as num?)?.toDouble(),
      amountReceived: (json['amount_received'] as num?)?.toDouble(),
      date: json['date'] as String?,
      status: json['status'] as String?,
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at'] as String) : null,
      invoiceId: json['invoice_id'] as String?,
    );
  }
}
