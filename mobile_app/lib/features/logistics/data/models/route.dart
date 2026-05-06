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

  factory LogisticRoute.fromJson(Map<String, dynamic> j) => LogisticRoute(
        id:              j['id'] as String,
        // DB may have camelCase (legacy) or snake_case — try both
        vehicleId:       (j['vehicleId'] ?? j['vehicle_id']) as String?,
        driverId:        (j['driverId']  ?? j['driver_id'])  as String?,
        location:        j['location']       as String?,
        status:          j['status']         as String?,
        date:            j['date']           as String?,
        targetAmount:    (j['target_amount'] as num?)?.toDouble(),
        actualCash:      (j['actual_cash']   as num?)?.toDouble(),
        initialOdometer: ((j['initialOdometer'] ?? j['initial_odometer']) as num?)?.toDouble(),
        finalOdometer:   (j['final_odometer'] as num?)?.toDouble(),
        reconciledAt:    j['reconciled_at']  as String?,
      );
}
