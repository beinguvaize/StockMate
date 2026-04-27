class RouteStop {
  final String id;
  final String routeId;
  final String? invoiceId;
  final String? clientId;
  final String? clientName;
  final int sequence;
  final String status; // PENDING | DELIVERED | PARTIAL | NO_SALE | CLOSED
  final double cashCollected;
  final String? notes;
  final String? visitedAt;

  const RouteStop({
    required this.id,
    required this.routeId,
    this.invoiceId,
    this.clientId,
    this.clientName,
    required this.sequence,
    required this.status,
    required this.cashCollected,
    this.notes,
    this.visitedAt,
  });

  factory RouteStop.fromJson(Map<String, dynamic> j) => RouteStop(
        id:            j['id'] as String,
        routeId:       j['route_id'] as String,
        invoiceId:     j['invoice_id'] as String?,
        clientId:      j['client_id'] as String?,
        clientName:    j['client_name'] as String?,
        sequence:      (j['sequence'] as num?)?.toInt() ?? 0,
        status:        j['status'] as String? ?? 'PENDING',
        cashCollected: (j['cash_collected'] as num?)?.toDouble() ?? 0,
        notes:         j['notes'] as String?,
        visitedAt:     j['visited_at'] as String?,
      );

  RouteStop copyWith({String? status, double? cashCollected, String? notes}) => RouteStop(
        id:            id,
        routeId:       routeId,
        invoiceId:     invoiceId,
        clientId:      clientId,
        clientName:    clientName,
        sequence:      sequence,
        status:        status ?? this.status,
        cashCollected: cashCollected ?? this.cashCollected,
        notes:         notes ?? this.notes,
        visitedAt:     visitedAt,
      );
}
