import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart' show OrderingTerm;
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/offline_reads.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client_payment.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/supplier.dart';
import 'package:mobile_app/main.dart' show databaseProvider;
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';

// Cache-first clients provider.
// Tries Supabase first; on any network / server failure falls back to the
// local Drift cache (populated by SyncService.pullSync()). UI stays usable
// offline as long as a previous online session warmed the cache.
final clientsProvider = FutureProvider<List<Client>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];

  try {
    final response = await supabase
        .from('clients')
        .select().isFilter('deleted_at', null)
        .eq('tenant_id', ctx.tenantId)
        .order('name', ascending: true);
    return (response as List).map((data) => Client.fromJson(data)).toList();
  } catch (e) {
    debugPrint('[clientsProvider] online failed, using Drift cache: $e');
    final db = ref.read(databaseProvider);
    final rows = await (db.select(db.clients)
          ..where((t) => t.tenantId.equals(ctx.tenantId))
          ..orderBy([(t) => OrderingTerm(expression: t.name)]))
        .get();
    return rows
        .map((r) => Client.fromJson({
              'id': r.id,
              'tenant_id': r.tenantId,
              'name': r.name,
              'email': r.email,
              'phone': r.phone,
              'address': r.address,
              'balance': r.balance,
              'outstanding_balance': r.outstandingBalance,
            }))
        .toList();
  }
});

final suppliersProvider = FutureProvider<List<Supplier>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];

  try {
    final response = await supabase
        .from('suppliers')
        .select().isFilter('deleted_at', null)
        .eq('tenant_id', ctx.tenantId)
        .order('name', ascending: true);
    return (response as List).map((data) => Supplier.fromJson(data)).toList();
  } catch (e) {
    debugPrint('[suppliersProvider] online failed, using Drift cache: $e');
    final db = ref.read(databaseProvider);
    final rows = await (db.select(db.suppliers)
          ..where((t) => t.tenantId.equals(ctx.tenantId))
          ..orderBy([(t) => OrderingTerm(expression: t.name)]))
        .get();
    return rows
        .map((r) => Supplier.fromJson({
              'id': r.id,
              'tenant_id': r.tenantId,
              'name': r.name,
              'contact_person': r.contactPerson,
              'phone': r.phone,
              'balance': r.balance,
            }))
        .toList();
  }
});

/// What each supplier is still owed, derived from the bills.
///
/// `suppliers.balance` is a cached aggregate and it has drifted from the
/// transactions before: HASSAN KOUSER read Rs 36,400 against Rs 34,010 of
/// actual open bills, because a payment larger than the amount owed was clamped
/// at zero and the surplus thrown away. The web app has always derived this
/// figure from the bills; mobile reading the column is why the two surfaces
/// showed different numbers for the same supplier.
///
///   outstanding = SUM(max(total - paid, 0)) - money paid but not yet on a bill
///
/// which is the same invariant the database now maintains.
///
/// Returns null when it cannot be computed (offline, or the query failed).
/// Callers fall back to the stored column in that case -- it is the best thing
/// available without a network, and `supplier_payments` is not cached locally
/// so advances cannot be subtracted offline.
final supplierOutstandingProvider =
    FutureProvider<Map<String, double>?>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return null;

  try {
    final out = <String, double>{};

    final bills = await supabase
        .from('purchases')
        .select('supplier_id, total_amount, paid_amount')
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .limit(10000);
    for (final row in (bills as List)) {
      final sid = row['supplier_id'] as String?;
      if (sid == null) continue;
      final due = ((row['total_amount'] as num?)?.toDouble() ?? 0) -
                  ((row['paid_amount'] as num?)?.toDouble() ?? 0);
      if (due > 0) out[sid] = (out[sid] ?? 0) + due;
    }

    // Money already paid that is not tied to a bill reduces what is owed.
    final advances = await supabase
        .from('supplier_payments')
        .select('supplier_id, amount')
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .isFilter('purchase_id', null)
        .limit(10000);
    for (final row in (advances as List)) {
      final sid = row['supplier_id'] as String?;
      if (sid == null) continue;
      out[sid] = (out[sid] ?? 0) - ((row['amount'] as num?)?.toDouble() ?? 0);
    }

    return out;
  } catch (e) {
    debugPrint('[supplierOutstanding] falling back to suppliers.balance: $e');
    return null;
  }
});

/// Outstanding for one supplier. Derived when available; the stored column only
/// as the offline fallback. A supplier absent from a loaded map genuinely owes
/// nothing -- do not read the column in that case, that is the stale path.
double supplierOutstanding(Supplier s, Map<String, double>? derived) =>
    derived == null ? (s.balance ?? 0) : (derived[s.id] ?? 0);

final clientPaymentsProvider = FutureProvider<List<ClientPayment>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    final response = await supabase
        .from('client_payments')
        .select()
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .order('created_at', ascending: false)
        .limit(500);
    return (response as List).map((d) => ClientPayment.fromJson(d as Map<String, dynamic>)).toList();
  } catch (e) {
    debugPrint('[clientPaymentsProvider] online failed, using Drift cache: $e');
    final rows = await cachedClientPayments(ref.read(databaseProvider), ctx.tenantId);
    return rows.map(ClientPayment.fromJson).toList();
  }
});

final clientPaymentsForClientProvider =
    FutureProvider.family<List<ClientPayment>, String>((ref, clientId) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  try {
    final response = await supabase
        .from('client_payments')
        .select()
        .eq('client_id', clientId)
        .eq('tenant_id', ctx.tenantId)
        .isFilter('deleted_at', null)
        .order('date', ascending: true);
    return (response as List).map((d) => ClientPayment.fromJson(d as Map<String, dynamic>)).toList();
  } catch (e) {
    debugPrint('[clientPaymentsForClient] online failed, using Drift cache: $e');
    final rows = await cachedClientPayments(
        ref.read(databaseProvider), ctx.tenantId, clientId: clientId);
    return rows.map(ClientPayment.fromJson).toList();
  }
});

/// Sale ledger rows for one client's sales — one per payment event, each
/// carrying the date the money actually arrived.
///
/// The statement used to credit a sale's whole paidAmount on the BILL's date.
/// That is wrong the moment part of it was collected later: a 10 Aug bill
/// showed the full 4,960 on the 10th, though 1,185 of it was not handed over
/// until the 31st. post_sale_to_ledger writes one row per payment event, so
/// these rows decide the dates. Web does the same (ClientSettlement.jsx).
///
/// Queried by sale id because account_transactions references the SALE and has
/// no client column. Returns [] on any failure so the statement falls back to
/// the single credit on the sale's date rather than rendering empty — still
/// correct whenever nothing was collected late, which is the ordinary case.
final saleReceiptsForClientProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>((ref, clientId) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  final sales = await ref.watch(recentSalesProvider.future);
  final saleIds = sales
      .where((s) => s.shopId == clientId)
      .map((s) => s.id)
      .toList();
  if (saleIds.isEmpty) return [];
  try {
    final res = await supabase
        .from('account_transactions')
        .select('id, date, amount, mode, ref_type, ref_id, note')
        .eq('tenant_id', ctx.tenantId)
        .eq('ref_type', 'SALE')
        .inFilter('ref_id', saleIds);
    return (res as List).cast<Map<String, dynamic>>();
  } catch (e) {
    debugPrint('[saleReceiptsForClient] failed, statement falls back to sale dates: $e');
    return [];
  }
});
