class BusinessProfile {
  final String id; // maps to tenant_id (PK)
  final String? name;
  final String? address;
  final String? phone;
  final String? email;
  final String? currency;
  final String? gstNo;
  final String? panNo;
  final String? upiId;
  final String? logoUrl;
  final String? invoiceTerms;
  final String? footerMessage;
  final bool? showGstin;
  final bool? showCustomerGstin;
  final bool? showTaxBreakdown;
  final String? taxMode;

  BusinessProfile({
    required this.id,
    this.name,
    this.address,
    this.phone,
    this.email,
    this.currency,
    this.gstNo,
    this.panNo,
    this.upiId,
    this.logoUrl,
    this.invoiceTerms,
    this.footerMessage,
    this.showGstin,
    this.showCustomerGstin,
    this.showTaxBreakdown,
    this.taxMode,
  });

  factory BusinessProfile.fromJson(Map<String, dynamic> json) {
    return BusinessProfile(
      id: (json['tenant_id'] ?? json['id'] ?? '') as String,
      name: json['name'] as String?,
      address: json['address'] as String?,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      currency: json['currency'] as String?,
      gstNo: json['gst_no'] as String?,
      panNo: json['pan_no'] as String?,
      upiId: json['upi_id'] as String?,
      logoUrl: json['logo_url'] as String?,
      invoiceTerms: json['invoice_terms'] as String?,
      footerMessage: json['footer_message'] as String?,
      showGstin: json['show_gstin'] as bool?,
      showCustomerGstin: json['show_customer_gstin'] as bool?,
      showTaxBreakdown: json['show_tax_breakdown'] as bool?,
      taxMode: json['tax_mode'] as String?,
    );
  }
}
