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

  static double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }

  static int _toInt(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString()) ?? 0;
  }

  factory RouteStop.fromJson(Map<String, dynamic> j) => RouteStop(
        id:            j['id'].toString(),
        routeId:       j['route_id'].toString(),
        invoiceId:     j['invoice_id']?.toString(),
        clientId:      j['client_id']?.toString(),
        clientName:    j['client_name']?.toString(),
        sequence:      _toInt(j['sequence']),
        status:        j['status']?.toString() ?? 'PENDING',
        cashCollected: _toDouble(j['cash_collected']),
        notes:         j['notes']?.toString(),
        visitedAt:     j['visited_at']?.toString(),
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
