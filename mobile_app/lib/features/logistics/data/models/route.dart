class LogisticRoute {
  final String id;
  final String? vehicleId;
  final String? driverId;
  final String? location;
  final String? status;
  final String? date;

  LogisticRoute({
    required this.id,
    this.vehicleId,
    this.driverId,
    this.location,
    this.status,
    this.date,
  });

  factory LogisticRoute.fromJson(Map<String, dynamic> json) {
    return LogisticRoute(
      id: json['id'] as String,
      vehicleId: json['vehicleId'] as String?,
      driverId: json['driverId'] as String?,
      location: json['location'] as String?,
      status: json['status'] as String?,
      date: json['date'] as String?,
    );
  }
}
