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
            cessRate: Value(product.cessRate),
            hsnCode: Value(product.hsnCode),
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
        'cess_rate': product.cessRate,
        'hsn_code': product.hsnCode,
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

  /// Update the stock value of a product (manual adjustment).
  ///
  /// IMPORTANT: goes through inventory_balances, never products.stock directly.
  /// inventory_balances is the source of truth — a DB trigger
  /// (sync_product_stock_sum) keeps products.stock = SUM(balances). Writing
  /// products.stock directly bypasses that trigger and drifts the two stores
  /// apart (the list showed one number, the detail another). The atomic RPC
  /// also records the movement so Stock History reflects the adjustment.
  Future<void> updateStock(String productId, double newStock,
      {String reason = 'Manual adjustment'}) async {
    final row = await (db.select(db.products)
          ..where((t) => t.id.equals(productId)))
        .getSingleOrNull();
    final delta = newStock - (row?.stock ?? newStock);

    // Local update for instant UI; the server value reconciles on next pull.
    await (db.update(db.products)..where((t) => t.id.equals(productId)))
        .write(ProductsCompanion(stock: Value(newStock)));

    if (delta == 0 || row?.tenantId == null) return;

    // Apply the delta to the warehouse balance (p_location_id null → the
    // tenant's WAREHOUSE). delta = newStock − current total, so the total
    // lands on newStock even across multiple locations. Offline-queued.
    await syncService.rpcOnlineOrQueue('adjust_inventory_atomic', {
      'p_product_id': productId,
      'p_location_id': null,
      'p_amount': delta,
      'p_reason': reason,
      'p_tenant_id': row!.tenantId,
    });
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
      cessRate: Value(product.cessRate),
      hsnCode: Value(product.hsnCode),
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
        'cess_rate': product.cessRate,
        'hsn_code': product.hsnCode,
        'image': product.image,
      },
    );
  }
}
