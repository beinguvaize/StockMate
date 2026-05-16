import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart' show OrderingTerm;
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/supplier.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

// Cache-first clients provider.
// Tries Supabase first; on any network / server failure falls back to the
// local Drift cache (populated by SyncService.pullSync()). UI stays usable
// offline as long as a previous online session warmed the cache.
final clientsProvider = FutureProvider<List<Client>>((ref) async {
  try {
    final response = await supabase
        .from('clients')
        .select()
        .order('name', ascending: true);
    return (response as List).map((data) => Client.fromJson(data)).toList();
  } catch (e) {
    debugPrint('[clientsProvider] online failed, using Drift cache: $e');
    final db = ref.read(databaseProvider);
    final rows = await (db.select(db.clients)
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
  try {
    final response = await supabase
        .from('suppliers')
        .select()
        .order('name', ascending: true);
    return (response as List).map((data) => Supplier.fromJson(data)).toList();
  } catch (e) {
    debugPrint('[suppliersProvider] online failed, using Drift cache: $e');
    final db = ref.read(databaseProvider);
    final rows = await (db.select(db.suppliers)
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
