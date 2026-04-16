import 'package:drift/drift.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/sync_service.dart';
import 'package:mobile_app/core/supabase/client.dart';

class ProductRepository {
  final AppDatabase db;
  final SyncService syncService;

  ProductRepository({required this.db, required this.syncService});

  /// Fetch from cloud and cache locally
  Future<void> fetchAndCacheProducts() async {
    try {
      await syncService.pullSync();
    } catch (e) {
      print('Pull sync failed: $e');
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
