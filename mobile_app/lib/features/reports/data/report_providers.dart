import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/features/reports/data/report_params.dart';
import 'package:mobile_app/features/reports/data/reports_data_service.dart';

// ---------------------------------------------------------------------------
// Date range state
// ---------------------------------------------------------------------------
final reportDateRangeProvider = StateProvider<DateTimeRange>(
  (ref) => DateTimeRange(
    start: DateTime.now().subtract(const Duration(days: 30)),
    end: DateTime.now(),
  ),
);

// ---------------------------------------------------------------------------
// Data providers — keyed by ReportParams
// ---------------------------------------------------------------------------
final reportSalesProvider =
    FutureProvider.family<List<Map<String, dynamic>>, ReportParams>(
  (ref, p) => ref.read(reportsDataServiceProvider).fetchSales(
        tenantId: p.tenantId,
        from: p.fromIso,
        to: p.toIso,
      ),
);

final reportInvoicesProvider =
    FutureProvider.family<List<Map<String, dynamic>>, ReportParams>(
  (ref, p) => ref.read(reportsDataServiceProvider).fetchInvoices(
        tenantId: p.tenantId,
        from: p.fromIso,
        to: p.toIso,
      ),
);

final reportPurchasesProvider =
    FutureProvider.family<List<Map<String, dynamic>>, ReportParams>(
  (ref, p) => ref.read(reportsDataServiceProvider).fetchPurchases(
        tenantId: p.tenantId,
        from: p.fromIso,
        to: p.toIso,
      ),
);

final reportExpensesProvider =
    FutureProvider.family<List<Map<String, dynamic>>, ReportParams>(
  (ref, p) => ref.read(reportsDataServiceProvider).fetchExpenses(
        tenantId: p.tenantId,
        from: p.fromIso,
        to: p.toIso,
      ),
);

// Products and clients/suppliers don't use date ranges — use fromIso/toIso
// but service ignores them; ReportParams still used as key for tenant.
final reportProductsProvider =
    FutureProvider.family<List<Map<String, dynamic>>, ReportParams>(
  (ref, p) => ref.read(reportsDataServiceProvider).fetchProducts(
        tenantId: p.tenantId,
      ),
);

final reportClientsProvider =
    FutureProvider.family<List<Map<String, dynamic>>, ReportParams>(
  (ref, p) => ref.read(reportsDataServiceProvider).fetchClients(
        tenantId: p.tenantId,
      ),
);

final reportSuppliersProvider =
    FutureProvider.family<List<Map<String, dynamic>>, ReportParams>(
  (ref, p) => ref.read(reportsDataServiceProvider).fetchSuppliers(
        tenantId: p.tenantId,
      ),
);
