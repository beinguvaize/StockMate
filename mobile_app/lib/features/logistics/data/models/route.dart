class LogisticRoute {
  final String id;
  final String? vehicleId;
  final String? driverId;
  final String? location;
  final String? status;
  final String? date;
  final double? targetAmount;
  final double? actualCash;
  final double? initialOdometer;
  final double? finalOdometer;
  final String? reconciledAt;

  const LogisticRoute({
    required this.id,
    this.vehicleId,
    this.driverId,
    this.location,
    this.status,
    this.date,
    this.targetAmount,
    this.actualCash,
    this.initialOdometer,
    this.finalOdometer,
    this.reconciledAt,
  });

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  factory LogisticRoute.fromJson(Map<String, dynamic> j) => LogisticRoute(
        id:              j['id'] as String,
        // DB may have camelCase (legacy) or snake_case — try both
        vehicleId:       (j['vehicleId'] ?? j['vehicle_id'])?.toString(),
        driverId:        (j['driverId']  ?? j['driver_id'])?.toString(),
        location:        j['location']?.toString(),
        status:          j['status']?.toString(),
        date:            j['date']?.toString(),
        targetAmount:    _toDouble(j['target_amount']),
        actualCash:      _toDouble(j['actual_cash']),
        initialOdometer: _toDouble(j['initialOdometer'] ?? j['initial_odometer']),
        finalOdometer:   _toDouble(j['final_odometer']),
        reconciledAt:    j['reconciled_at']?.toString(),
      );
}
