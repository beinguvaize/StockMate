import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/inventory/data/repositories/product_repository.dart';
import 'package:mobile_app/main.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final productRepositoryProvider = Provider<ProductRepository>((ref) {
  final db = ref.watch(databaseProvider);
  final syncService = ref.watch(syncServiceProvider);
  return ProductRepository(db: db, syncService: syncService);
});

// Fetches the products (from Supabase or local cache). Tenant-scoped so
// global-admin sessions or stale caches from older tenant memberships
// can't leak SKUs into the active workspace.
final productsProvider = FutureProvider<List<Product>>((ref) async {
  final repository = ref.watch(productRepositoryProvider);
  final tenantId = ref.watch(tenantContextProvider).valueOrNull?.tenantId;
  await repository.fetchAndCacheProducts();
  return repository.getCachedProducts(tenantId: tenantId);
});

// Realtime: any insert/update/delete on this tenant's products row
// invalidates productsProvider so the next watcher sees the fresh
// stock instantly (covers other devices' sales, web-side edits, etc.).
final _productsRealtimeProvider = Provider<void>((ref) {
  final tenantId = ref.watch(tenantContextProvider).valueOrNull?.tenantId;
  if (tenantId == null) return;
  final channel = supabase
      .channel('products-rt-$tenantId')
      .onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'products',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'tenant_id',
          value: tenantId,
        ),
        callback: (_) => ref.invalidate(productsProvider),
      )
      .subscribe();
  ref.onDispose(() {
    try { supabase.removeChannel(channel); } catch (_) {}
  });
});

/// Call from the inventory / sales screens (anywhere we want live stock)
/// so the channel is mounted while the screen is visible.
final productsRealtimeSubscriberProvider = Provider<void>((ref) {
  ref.watch(_productsRealtimeProvider);
});

// Holds the current search query
final searchQueryProvider = StateProvider<String>((ref) => '');

// Provides a filtered list of products based on the search query
final filteredProductsProvider = Provider<AsyncValue<List<Product>>>((ref) {
  final productsAsync = ref.watch(productsProvider);
  final searchQuery = ref.watch(searchQueryProvider).toLowerCase();

  return productsAsync.whenData((products) {
    if (searchQuery.isEmpty) return products;
    return products.where((p) {
      final matchName = p.name.toLowerCase().contains(searchQuery);
      final matchSku = p.sku?.toLowerCase().contains(searchQuery) ?? false;
      return matchName || matchSku;
    }).toList();
  });
});
