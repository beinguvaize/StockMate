class Supplier {
  final String id;
  final String? name;
  final String? contactPerson;
  final String? phone;
  final String? email;
  final String? address;
  final double? balance;
  final String? notes;
  final DateTime? createdAt;

  Supplier({
    required this.id,
    this.name,
    this.contactPerson,
    this.phone,
    this.email,
    this.address,
    this.balance,
    this.notes,
    this.createdAt,
  });

  factory Supplier.fromJson(Map<String, dynamic> json) {
    return Supplier(
      id: json['id'] as String,
      name: json['name'] as String?,
      contactPerson: json['contact_person'] as String?,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      address: json['address'] as String?,
      balance: (json['balance'] as num?)?.toDouble(),
      notes: json['notes'] as String?,
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at'] as String) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'contact_person': contactPerson,
      'phone': phone,
      'email': email,
      'address': address,
      'balance': balance,
      'notes': notes,
    };
  }
}
