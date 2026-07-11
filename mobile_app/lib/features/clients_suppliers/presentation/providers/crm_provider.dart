import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart' show OrderingTerm;
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client_payment.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/supplier.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

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

final clientPaymentsProvider = FutureProvider<List<ClientPayment>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  final response = await supabase
      .from('client_payments')
      .select()
      .eq('tenant_id', ctx.tenantId)
      .isFilter('deleted_at', null)
      .order('created_at', ascending: false)
      .limit(500);
  return (response as List).map((d) => ClientPayment.fromJson(d as Map<String, dynamic>)).toList();
});

final clientPaymentsForClientProvider =
    FutureProvider.family<List<ClientPayment>, String>((ref, clientId) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  final response = await supabase
      .from('client_payments')
      .select()
      .eq('client_id', clientId)
      .eq('tenant_id', ctx.tenantId)
      .isFilter('deleted_at', null)
      .order('date', ascending: true);
  return (response as List).map((d) => ClientPayment.fromJson(d as Map<String, dynamic>)).toList();
});
