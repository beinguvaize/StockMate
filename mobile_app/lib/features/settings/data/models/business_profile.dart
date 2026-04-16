class BusinessProfile {
  final String id;
  final String? name;
  final String? address;
  final String? phone;
  final String? email;
  final String? currency;

  BusinessProfile({
    required this.id,
    this.name,
    this.address,
    this.phone,
    this.email,
    this.currency,
  });

  factory BusinessProfile.fromJson(Map<String, dynamic> json) {
    return BusinessProfile(
      id: json['id'] as String,
      name: json['name'] as String?,
      address: json['address'] as String?,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      currency: json['currency'] as String?,
    );
  }
}
