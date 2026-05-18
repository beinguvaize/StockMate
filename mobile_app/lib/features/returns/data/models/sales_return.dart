class SalesReturn {
  final String id;
  final String tenantId;
  final String? saleId;
  final String? invoiceId;
  final String? clientId;
  final String? clientName;
  final List<dynamic> items;
  final double totalAmount;
  final String? reason;
  final String date;
  final DateTime? createdAt;

  SalesReturn({
    required this.id, required this.tenantId, this.saleId, this.invoiceId,
    this.clientId, this.clientName, required this.items,
    required this.totalAmount, this.reason, required this.date, this.createdAt,
  });

  factory SalesReturn.fromMap(Map<String, dynamic> m) => SalesReturn(
    id: m['id'] as String,
    tenantId: (m['tenant_id'] ?? '') as String,
    saleId: m['sale_id'] as String?,
    invoiceId: m['invoice_id'] as String?,
    clientId: m['client_id'] as String?,
    clientName: m['client_name'] as String?,
    items: (m['items'] as List<dynamic>?) ?? [],
    totalAmount: (m['total_amount'] as num?)?.toDouble() ?? 0,
    reason: m['reason'] as String?,
    date: (m['date'] ?? '') as String,
    createdAt: m['created_at'] != null ? DateTime.tryParse(m['created_at'] as String) : null,
  );
}
