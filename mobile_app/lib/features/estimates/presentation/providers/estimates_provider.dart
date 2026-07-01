import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';

class EstimateModel {
  final String id;
  final String? estimateNumber;
  final String? clientName;
  final String? docType; // ESTIMATE, QUOTATION, DELIVERY_CHALLAN, PROFORMA
  final double grandTotal;
  final String? status;
  final String? estimateDate;

  const EstimateModel({
    required this.id,
    this.estimateNumber,
    this.clientName,
    this.docType,
    required this.grandTotal,
    this.status,
    this.estimateDate,
  });

  factory EstimateModel.fromJson(Map<String, dynamic> m) => EstimateModel(
        id: m['id'] as String,
        estimateNumber: m['estimate_number'] as String?,
        clientName: m['client_name'] as String?,
        docType: m['doc_type'] as String?,
        grandTotal: (m['grand_total'] as num?)?.toDouble() ?? 0,
        status: m['status'] as String?,
        estimateDate: m['estimate_date'] as String?,
      );

  String get displayType {
    switch ((docType ?? 'ESTIMATE').toUpperCase()) {
      case 'QUOTATION': return 'Quotation';
      case 'DELIVERY_CHALLAN': return 'Challan';
      case 'PROFORMA': return 'Proforma';
      default: return 'Estimate';
    }
  }
}

final estimatesProvider = FutureProvider<List<EstimateModel>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    final rows = await supabase
        .from('estimates')
        .select('id, estimate_number, client_name, doc_type, grand_total, status, estimate_date')
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .order('created_at', ascending: false)
        .limit(200);
    return (rows as List).map((r) => EstimateModel.fromJson(r as Map<String, dynamic>)).toList();
  } catch (e) {
    debugPrint('[estimatesProvider] failed: $e');
    return [];
  }
});
