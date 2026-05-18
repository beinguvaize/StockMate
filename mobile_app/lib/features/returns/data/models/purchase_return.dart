class PurchaseReturn {
  final String id;
  final String tenantId;
  final String purchaseId;
  final String? supplierId;
  final String? supplierName;
  final String productId;
  final String? productName;
  final double quantity;
  final double unitPrice;
  final double totalAmount;
  final String? reason;
  final String date;
  final String? locationId;
  final DateTime? createdAt;

  PurchaseReturn({
    required this.id, required this.tenantId, required this.purchaseId,
    this.supplierId, this.supplierName, required this.productId,
    this.productName, required this.quantity, required this.unitPrice,
    required this.totalAmount, this.reason, required this.date,
    this.locationId, this.createdAt,
  });

  factory PurchaseReturn.fromMap(Map<String, dynamic> m) => PurchaseReturn(
    id: m['id'] as String,
    tenantId: (m['tenant_id'] ?? '') as String,
    purchaseId: (m['purchase_id'] ?? '') as String,
    supplierId: m['supplier_id'] as String?,
    supplierName: m['supplier_name'] as String?,
    productId: (m['product_id'] ?? '') as String,
    productName: m['product_name'] as String?,
    quantity: (m['quantity'] as num?)?.toDouble() ?? 0,
    unitPrice: (m['unit_price'] as num?)?.toDouble() ?? 0,
    totalAmount: (m['total_amount'] as num?)?.toDouble() ?? 0,
    reason: m['reason'] as String?,
    date: (m['date'] ?? '') as String,
    locationId: m['location_id'] as String?,
    createdAt: m['created_at'] != null ? DateTime.tryParse(m['created_at'] as String) : null,
  );
}
