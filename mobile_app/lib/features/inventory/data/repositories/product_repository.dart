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

  /// Get products (local-first). Tenant-scoped so a session that pulled
  /// other tenants' rows in the past (e.g. global-admin switching
  /// workspaces) doesn't leak SKUs into the active tenant's inventory.
  Stream<List<Product>> watchProducts({String? tenantId}) {
    final q = db.select(db.products);
    if (tenantId != null) q.where((t) => t.tenantId.equals(tenantId));
    return q.watch();
  }

  Future<List<Product>> getCachedProducts({String? tenantId}) async {
    final q = db.select(db.products);
    if (tenantId != null) q.where((t) => t.tenantId.equals(tenantId));
    return await q.get();
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

  /// Update only the stock value of a product (manual adjustment).
  Future<void> updateStock(String productId, double newStock,
      {String reason = 'Manual adjustment'}) async {
    // Read the current row first so we know the delta + carry tenant_id/name.
    final row = await (db.select(db.products)
          ..where((t) => t.id.equals(productId)))
        .getSingleOrNull();
    final delta = newStock - (row?.stock ?? newStock);

    // 1. Local Update
    await (db.update(db.products)..where((t) => t.id.equals(productId)))
        .write(ProductsCompanion(stock: Value(newStock)));

    // 2. Sync products.stock (absolute → idempotent). tenant_id MUST be in the
    // payload or the upsert's INSERT path defaults it to a placeholder and the
    // RLS WITH CHECK rejects it, leaving the change stuck ("N to sync").
    await syncService.queueMutation(
      targetTable: 'products',
      action: 'upsert',
      payload: {
        'id': productId,
        'stock': newStock,
        if (row?.tenantId != null) 'tenant_id': row!.tenantId,
      },
    );

    // 3. Record the movement so Stock History shows manual adjustments (web +
    // mobile previously only logged sales). Stable id keeps the queued upsert
    // idempotent — no duplicate entry if the job retries.
    if (delta != 0 && row?.tenantId != null) {
      final logId =
          'LOG-${DateTime.now().millisecondsSinceEpoch}-${DateTime.now().microsecond}';
      await syncService.queueMutation(
        targetTable: 'movement_log',
        action: 'upsert',
        payload: {
          'id': logId,
          'tenant_id': row!.tenantId,
          'product_id': productId,
          'product_name': row.name,
          'type': delta >= 0 ? 'IN' : 'OUT',
          'quantity': delta.abs(),
          'reason': reason,
          'date': DateTime.now().toUtc().toIso8601String(),
        },
      );
    }
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
