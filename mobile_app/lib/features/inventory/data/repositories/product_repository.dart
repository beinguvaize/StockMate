import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/sync_service.dart';

class ProductRepository {
  final AppDatabase db;
  final SyncService syncService;

  ProductRepository({required this.db, required this.syncService});

  /// Fetch from cloud and cache locally. Uses the targeted
  /// pullProductsOnly so post-sale stock refreshes don't pay for a
  /// 22-table full pullSync round-trip.
  Future<void> fetchAndCacheProducts() async {
    try {
      await syncService.pullProductsOnly();
    } catch (e) {
      debugPrint('Pull products failed: $e');
    }
  }

  /// Optimistic local stock decrement — used right after a sale fires so
  /// the inventory tab reflects the new balance before the supabase
  /// round-trip lands. Server is the source of truth; the next
  /// fetchAndCacheProducts() overwrites with the authoritative value.
  Future<void> decrementLocalStock(List<({String productId, double qty})> items) async {
    for (final it in items) {
      try {
        final row = await (db.select(db.products)
              ..where((t) => t.id.equals(it.productId)))
            .getSingleOrNull();
        if (row == null) continue;
        final newStock = (row.stock - it.qty).clamp(0.0, double.infinity);
        await (db.update(db.products)..where((t) => t.id.equals(it.productId)))
            .write(ProductsCompanion(stock: Value(newStock)));
      } catch (_) {/* best-effort */}
    }
  }

  /// Get products (local-first)
  Stream<List<Product>> watchProducts() {
    return db.select(db.products).watch();
  }

  Future<List<Product>> getCachedProducts() async {
    return await db.select(db.products).get();
  }

  /// Add a product with offline support
  Future<void> addProduct(Product product) async {
    // 1. Local Insert
    await db.into(db.products).insert(
          ProductsCompanion.insert(
            id: product.id,
            tenantId: product.tenantId,
            name: product.name,
            sku: Value(product.sku),
            category: Value(product.category),
            unit: Value(product.unit),
            costPrice: Value(product.costPrice),
            sellingPrice: Value(product.sellingPrice),
            stock: Value(product.stock),
            taxRate: Value(product.taxRate),
            image: Value(product.image),
          ),
          mode: InsertMode.insertOrReplace,
        );

    // 2. Sync Queue
    await syncService.queueMutation(
      targetTable: 'products',
      action: 'upsert',
      payload: {
        'id': product.id,
        'tenant_id': product.tenantId,
        'name': product.name,
        'sku': product.sku,
        'category': product.category,
        'unit': product.unit,
        'costPrice': product.costPrice,
        'sellingPrice': product.sellingPrice,
        'stock': product.stock,
        'taxRate': product.taxRate,
        'image': product.image,
      },
    );
  }

  /// Delete a product with offline support
  Future<void> deleteProduct(String productId) async {
    // 1. Local Delete
    await (db.delete(db.products)..where((t) => t.id.equals(productId))).go();

    // 2. Sync Queue
    await syncService.queueMutation(
      targetTable: 'products',
      action: 'delete',
      payload: {'id': productId},
    );
  }

  /// Update only the stock value of a product
  Future<void> updateStock(String productId, double newStock) async {
    // 1. Local Update
    await (db.update(db.products)..where((t) => t.id.equals(productId)))
        .write(ProductsCompanion(stock: Value(newStock)));

    // 2. Sync Queue
    await syncService.queueMutation(
      targetTable: 'products',
      action: 'upsert',
      payload: {'id': productId, 'stock': newStock},
    );
  }

  /// Update a product with offline support
  Future<void> updateProduct(Product product) async {
    // 1. Local Update
    await (db.update(db.products)..where((t) => t.id.equals(product.id)))
        .write(ProductsCompanion(
      name: Value(product.name),
      sku: Value(product.sku),
      category: Value(product.category),
      unit: Value(product.unit),
      costPrice: Value(product.costPrice),
      sellingPrice: Value(product.sellingPrice),
      stock: Value(product.stock),
      taxRate: Value(product.taxRate),
      image: Value(product.image),
    ));

    // 2. Sync Queue
    await syncService.queueMutation(
      targetTable: 'products',
      action: 'upsert',
      payload: {
        'id': product.id,
        'tenant_id': product.tenantId,
        'name': product.name,
        'sku': product.sku,
        'category': product.category,
        'unit': product.unit,
        'costPrice': product.costPrice,
        'sellingPrice': product.sellingPrice,
        'stock': product.stock,
        'taxRate': product.taxRate,
        'image': product.image,
      },
    );
  }
}
