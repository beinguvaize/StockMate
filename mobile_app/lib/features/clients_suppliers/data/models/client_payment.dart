class ClientPayment {
  final String id;
  final String clientId;
  final String tenantId;
  final String date;           // YYYY-MM-DD
  final double amount;
  final String paymentMethod;  // CASH | CARD | UPI | BANK | CHEQUE
  final String? notes;
  final DateTime? createdAt;
  final List<dynamic>? appliedInvoiceIds;

  ClientPayment({
    required this.id, required this.clientId, required this.tenantId,
    required this.date, required this.amount, required this.paymentMethod,
    this.notes, this.createdAt, this.appliedInvoiceIds,
  });

  factory ClientPayment.fromJson(Map<String, dynamic> j) => ClientPayment(
    id: j['id'] as String,
    clientId: (j['client_id'] ?? '') as String,
    tenantId: (j['tenant_id'] ?? '') as String,
    date: (j['date'] ?? '') as String,
    amount: (j['amount'] as num?)?.toDouble() ?? 0,
    paymentMethod: (j['payment_method'] as String?) ?? 'CASH',
    notes: j['notes'] as String?,
    createdAt: j['created_at'] != null ? DateTime.tryParse(j['created_at'] as String) : null,
    appliedInvoiceIds: j['applied_invoice_ids'] as List<dynamic>?,
  );
}
