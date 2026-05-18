import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:mobile_app/core/utils/ref_generator.dart';

class ReturnsRepository {
  final SupabaseClient _client;
  ReturnsRepository(this._client);

  Future<void> processSalesReturn({
    required String tenantId,
    String? saleId,
    String? invoiceId,
    String? clientId,
    String? clientName,
    required List<Map<String, dynamic>> items,
    required double totalAmount,
    String? reason,
    required String date,
  }) async {
    await _client.rpc('process_sales_return', params: {
      'p_id': generateRef('CRN'),
      'p_tenant_id': tenantId,
      'p_sale_id': saleId,
      'p_invoice_id': invoiceId,
      'p_client_id': clientId,
      'p_client_name': clientName,
      'p_items': items,
      'p_total_amount': totalAmount,
      'p_reason': reason,
      'p_date': date,
    });
  }

  Future<void> processPurchaseReturn({
    required String tenantId,
    required String purchaseId,
    String? supplierId,
    String? supplierName,
    required String productId,
    String? productName,
    required double quantity,
    required double unitPrice,
    required double totalAmount,
    String? reason,
    required String date,
    String? locationId,
  }) async {
    await _client.rpc('process_purchase_return', params: {
      'p_id': generateRef('PRN'),
      'p_tenant_id': tenantId,
      'p_purchase_id': purchaseId,
      'p_supplier_id': supplierId,
      'p_supplier_name': supplierName,
      'p_product_id': productId,
      'p_product_name': productName,
      'p_quantity': quantity,
      'p_unit_price': unitPrice,
      'p_total_amount': totalAmount,
      'p_reason': reason,
      'p_date': date,
      'p_location_id': locationId,
    });
  }
}
