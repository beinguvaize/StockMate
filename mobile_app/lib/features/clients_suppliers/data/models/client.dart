class Client {
  final String id;
  final String? name;
  final String? contact;
  final String? phone;
  final String? email;
  final String? address;
  final double? balance;
  final double? outstandingBalance;
  final double? creditLimit;
  final String? gstNo;
  final String? gstin;
  final String? billingAddress;
  final String? shippingAddress;
  final String? state;
  final String? stateCode;
  final DateTime? createdAt;

  Client({
    required this.id,
    this.name,
    this.contact,
    this.phone,
    this.email,
    this.address,
    this.balance,
    this.outstandingBalance,
    this.creditLimit,
    this.gstNo,
    this.gstin,
    this.billingAddress,
    this.shippingAddress,
    this.state,
    this.stateCode,
    this.createdAt,
  });

  factory Client.fromJson(Map<String, dynamic> json) {
    return Client(
      id: json['id'] as String,
      name: json['name'] as String?,
      contact: json['contact'] as String?,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      address: json['address'] as String?,
      balance: (json['balance'] as num?)?.toDouble(),
      outstandingBalance: (json['outstanding_balance'] as num?)?.toDouble(),
      creditLimit: (json['credit_limit'] as num?)?.toDouble(),
      gstNo: json['gst_no'] as String?,
      gstin: json['gstin'] as String?,
      billingAddress: json['billing_address'] as String?,
      shippingAddress: json['shipping_address'] as String?,
      state: json['state'] as String?,
      stateCode: json['state_code'] as String?,
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at'] as String) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'contact': contact,
      'phone': phone,
      'email': email,
      'address': address,
      'balance': balance,
      'outstanding_balance': outstandingBalance,
      'credit_limit': creditLimit,
      'gst_no': gstNo,
      'gstin': gstin,
      'billing_address': billingAddress,
      'shipping_address': shippingAddress,
      'state': state,
      'state_code': stateCode,
    };
  }
}
