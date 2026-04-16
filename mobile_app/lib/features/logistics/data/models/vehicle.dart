class Vehicle {
  final String id;
  final String? name;
  final String? plate;
  final String? status;
  final String? type;

  Vehicle({
    required this.id,
    this.name,
    this.plate,
    this.status,
    this.type,
  });

  factory Vehicle.fromJson(Map<String, dynamic> json) {
    return Vehicle(
      id: json['id'] as String,
      name: json['name'] as String?,
      plate: json['plate'] as String?,
      status: json['status'] as String?,
      type: json['type'] as String?,
    );
  }
}
