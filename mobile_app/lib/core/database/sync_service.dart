import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/supabase/client.dart';

enum SyncAction { upsert, delete }

class SyncService {
  final AppDatabase db;

  SyncService(this.db);

  /// Queue a mutation for offline playback
  Future<void> queueMutation({
    required String targetTable,
    required String action,
    required Map<String, dynamic> payload,
  }) async {
    await db.into(db.syncMutations).insert(
          SyncMutationsCompanion.insert(
            targetTable: targetTable,
            action: action,
            payload: jsonEncode(payload),
          ),
        );
    
    // Attempt immediate flush if online
    sync();
  }

  /// Process the sync queue
  Future<void> sync() async {
    final connectivityResult = await Connectivity().checkConnectivity();
    if (connectivityResult == ConnectivityResult.none) return;

    final pending = await (db.select(db.syncMutations)
          ..where((t) => t.isSynced.equals(false))
          ..orderBy([(t) => OrderingTerm(expression: t.createdAt)]))
        .get();

    for (final mutation in pending) {
      try {
        final payload = jsonDecode(mutation.payload) as Map<String, dynamic>;
        
        if (mutation.action == 'upsert') {
          await supabase.from(mutation.targetTable).upsert(payload);
        } else if (mutation.action == 'delete') {
          // Assuming 'id' is always the primary key for deletion
          await supabase.from(mutation.targetTable)
              .delete()
              .eq('id', payload['id']);
        }

        // Mark as synced
        await (db.update(db.syncMutations)
              ..where((t) => t.id.equals(mutation.id)))
            .write(const SyncMutationsCompanion(isSynced: Value(true)));
            
      } catch (e) {
        print('Sync failed for mutation ${mutation.id}: $e');
        // We'll retry on next sync interval or app launch
        break; 
      }
    }
  }

  /// Initial full sync from Supabase to local DB
  Future<void> pullSync() async {
    // 1. Fetch from Supabase
    final response = await supabase.from('products').select();
    final List<dynamic> data = response as List<dynamic>;

    // 2. Batch upsert into Drift
    await db.batch((batch) {
      for (final item in data) {
        batch.insert(
          db.products,
          ProductsCompanion.insert(
            id: item['id'],
            tenantId: item['tenant_id'],
            name: item['name'],
            sku: Value(item['sku']),
            category: Value(item['category']),
            unit: Value(item['unit']),
            costPrice: Value((item['costPrice'] ?? 0).toDouble()),
            sellingPrice: Value((item['sellingPrice'] ?? 0).toDouble()),
            stock: Value((item['stock'] ?? 0).toDouble()),
            taxRate: Value((item['taxRate'] ?? 0).toDouble()),
            image: Value(item['image']),
          ),
          mode: InsertMode.insertOrReplace,
        );
      }
    });
  }
}
