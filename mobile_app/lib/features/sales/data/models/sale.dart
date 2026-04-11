class Sale {
  final String id;
  final String? shopId;
  final Map<String, dynamic>? customerInfo;
  final String? paymentMethod;
  final String? paymentStatus;
  final String? routeId;
  final List<dynamic>? items;
  final double? subtotal;
  final double? discount;
  final double? tax;
  final double? totalAmount;
  final String? date;
  final String? status;
  final DateTime? createdAt;

  Sale({
    required this.id,
    this.shopId,
    this.customerInfo,
    this.paymentMethod,
    this.paymentStatus,
    this.routeId,
    this.items,
    this.subtotal,
    this.discount,
    this.tax,
    this.totalAmount,
    this.date,
    this.status,
    this.createdAt,
  });

  factory Sale.fromJson(Map<String, dynamic> json) {
    return Sale(
      id: json['id'] as String,
      shopId: json['shopId'] as String?,
      customerInfo: json['customerInfo'] as Map<String, dynamic>?,
      paymentMethod: json['paymentMethod'] as String?,
      paymentStatus: json['paymentStatus'] as String?,
      routeId: json['routeId'] as String?,
      items: json['items'] as List<dynamic>?,
      subtotal: (json['subtotal'] as num?)?.toDouble(),
      discount: (json['discount'] as num?)?.toDouble(),
      tax: (json['tax'] as num?)?.toDouble(),
      totalAmount: (json['totalAmount'] as num?)?.toDouble(),
      date: json['date'] as String?,
      status: json['status'] as String?,
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at'] as String) : null,
    );
  }
}
