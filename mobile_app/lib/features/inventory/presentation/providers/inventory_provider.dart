import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/sync_service.dart';
import 'package:mobile_app/features/inventory/data/repositories/product_repository.dart';
import 'package:mobile_app/main.dart';

final productRepositoryProvider = Provider<ProductRepository>((ref) {
  final db = ref.watch(databaseProvider);
  final syncService = ref.watch(syncServiceProvider);
  return ProductRepository(db: db, syncService: syncService);
});

// Fetches the products (from Supabase or local cache)
final productsProvider = FutureProvider<List<Product>>((ref) async {
  final repository = ref.watch(productRepositoryProvider);
  await repository.fetchAndCacheProducts();
  return repository.getCachedProducts();
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
      final matchName = p.name?.toLowerCase().contains(searchQuery) ?? false;
      final matchSku = p.sku?.toLowerCase().contains(searchQuery) ?? false;
      return matchName || matchSku;
    }).toList();
  });
});
