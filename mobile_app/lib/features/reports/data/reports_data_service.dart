import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';

class ReportsDataService {
  Future<List<Map<String, dynamic>>> fetchSales({
    required String tenantId,
    required String from,
    required String to,
  }) async {
    final data = await supabase
        .from('sales')
        .select('id, date, totalAmount, totalCogs, customerInfo, items, paymentMethod, status, note').isFilter('deleted_at', null)
        .eq('tenant_id', tenantId)
        .gte('date', from)
        .lte('date', to);
    return List<Map<String, dynamic>>.from(data as List);
  }

  Future<List<Map<String, dynamic>>> fetchInvoices({
    required String tenantId,
    required String from,
    required String to,
  }) async {
    final data = await supabase
        .from('invoices')
        .select(
            'id, sale_id, client_id, client_name, invoice_number, invoice_date, date, due_date, grand_total, taxable_amount, cgst_amount, sgst_amount, igst_amount, is_interstate, items, payment_status').isFilter('deleted_at', null)
        .eq('tenant_id', tenantId)
        .gte('invoice_date', from)
        .lte('invoice_date', to);
    return List<Map<String, dynamic>>.from(data as List);
  }

  Future<List<Map<String, dynamic>>> fetchClients({
    required String tenantId,
  }) async {
    final data = await supabase
        .from('clients')
        .select().isFilter('deleted_at', null)
        .eq('tenant_id', tenantId);
    return List<Map<String, dynamic>>.from(data as List);
  }

  Future<List<Map<String, dynamic>>> fetchSuppliers({
    required String tenantId,
  }) async {
    final data = await supabase
        .from('suppliers')
        .select().isFilter('deleted_at', null)
        .eq('tenant_id', tenantId);
    return List<Map<String, dynamic>>.from(data as List);
  }

  Future<List<Map<String, dynamic>>> fetchPurchases({
    required String tenantId,
    required String from,
    required String to,
  }) async {
    final data = await supabase
        .from('purchases')
        .select('id, date, supplier_id, supplier_name, quantity, total_amount, payment_type, notes').isFilter('deleted_at', null)
        .eq('tenant_id', tenantId)
        .gte('date', from)
        .lte('date', to);
    return List<Map<String, dynamic>>.from(data as List);
  }

  Future<List<Map<String, dynamic>>> fetchExpenses({
    required String tenantId,
    required String from,
    required String to,
  }) async {
    final data = await supabase
        .from('expenses')
        .select('id, date, category, note, amount').isFilter('deleted_at', null)
        .eq('tenant_id', tenantId)
        .gte('date', from)
        .lte('date', to);
    return List<Map<String, dynamic>>.from(data as List);
  }

  Future<List<Map<String, dynamic>>> fetchProducts({
    required String tenantId,
  }) async {
    final data = await supabase
        .from('products')
        .select('id, sku, name, category, stock, costPrice, sellingPrice, lowStockThreshold, unit, created_at').isFilter('deleted_at', null)
        .eq('tenant_id', tenantId);
    return List<Map<String, dynamic>>.from(data as List);
  }
}

final reportsDataServiceProvider =
    Provider<ReportsDataService>((ref) => ReportsDataService());
