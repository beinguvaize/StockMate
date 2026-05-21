class Vehicle {
  final String id;
  final String? name;
  final String? plate;
  final String? plateNumber; // DB has both plate + plateNumber
  final String? status;
  final String? type;        // vehicle type: VAN, TRUCK, etc.
  final String? driverName;  // assigned driver name (stored as driverName in DB)
  final String? fuelType;
  final String? color;
  final int? year;
  final double? capacity;
  final String? lastServiceDate;
  final String? nextServiceDate;

  Vehicle({
    required this.id,
    this.name,
    this.plate,
    this.plateNumber,
    this.status,
    this.type,
    this.driverName,
    this.fuelType,
    this.color,
    this.year,
    this.capacity,
    this.lastServiceDate,
    this.nextServiceDate,
  });

  /// Best available plate — prefer plateNumber, fallback to plate
  String get displayPlate => plateNumber?.isNotEmpty == true
      ? plateNumber!
      : plate?.isNotEmpty == true
          ? plate!
          : '—';

  factory Vehicle.fromJson(Map<String, dynamic> json) {
    return Vehicle(
      id:              json['id'] as String,
      name:            json['name']?.toString(),
      plate:           json['plate']?.toString(),
      plateNumber:     json['plateNumber']?.toString(),
      status:          json['status']?.toString(),
      type:            json['type']?.toString(),
      driverName:      json['driverName']?.toString(),
      fuelType:        json['fuelType']?.toString(),
      color:           json['color']?.toString(),
      year:            json['year'] == null ? null : int.tryParse(json['year'].toString()),
      capacity:        (json['capacity'] as num?)?.toDouble(),
      lastServiceDate: json['lastServiceDate']?.toString(),
      nextServiceDate: json['nextServiceDate']?.toString(),
    );
  }
}
