import 'dart:io';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

part 'database.g.dart';

// --- SYNC METADATA ---

class SyncMutations extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get targetTable => text()();
  TextColumn get action => text()(); // 'upsert' | 'delete' | 'rpc'
  TextColumn get payload => text()(); // JSON data
  TextColumn get rpcName => text().nullable()(); // when action='rpc'
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  // Legacy boolean kept for backwards-read; new code uses status.
  BoolColumn get isSynced => boolean().withDefault(const Constant(false))();
  // Per-item state machine — mirrors the e_invoice_irn server-side queue pattern.
  TextColumn get status => text().withDefault(const Constant('PENDING'))(); // PENDING|PROCESSING|SUCCESS|FAILED
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get nextAttemptAt => dateTime().withDefault(currentDateAndTime)();
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();
}

// --- CORE TABLES ---

class Tenants extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get slug => text()();
  TextColumn get plan => text()(); // STARTER, PRO, ENTERPRISE
  TextColumn get status => text()(); // ACTIVE, SUSPENDED
  DateTimeColumn get createdAt => dateTime()();
  
  @override
  Set<Column> get primaryKey => {id};
}

class Products extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get sku => text().nullable()();
  TextColumn get name => text()();
  TextColumn get category => text().nullable()();
  TextColumn get unit => text().nullable()();
  // Alternate sell unit (e.g. PACKET) + how many base units it holds
  // (conversionFactor, e.g. 0.25 KG per packet). Null when the product has none.
  TextColumn get secondaryUnit => text().nullable()();
  RealColumn get conversionFactor => real().nullable()();
  RealColumn get costPrice => real().withDefault(const Constant(0))();
  RealColumn get sellingPrice => real().withDefault(const Constant(0))();
  RealColumn get stock => real().withDefault(const Constant(0))();
  RealColumn get taxRate => real().withDefault(const Constant(0))();
  RealColumn get cessRate => real().withDefault(const Constant(0))();
  TextColumn get hsnCode => text().nullable()();
  TextColumn get image => text().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Clients extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get name => text()();
  TextColumn get email => text().nullable()();
  TextColumn get phone => text().nullable()();
  TextColumn get address => text().nullable()();
  RealColumn get balance => real().withDefault(const Constant(0))();
  RealColumn get outstandingBalance => real().withDefault(const Constant(0))();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Sales extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get clientId => text().nullable()();
  TextColumn get paymentMethod => text()(); // CASH, BANK, CREDIT
  TextColumn get paymentStatus => text()(); // PAID, PENDING, PARTIAL
  RealColumn get subtotal => real()();
  RealColumn get tax => real()();
  RealColumn get totalAmount => real()();
  RealColumn get paidAmount => real().withDefault(const Constant(0))();
  DateTimeColumn get date => dateTime()();
  TextColumn get itemsJson => text()(); // Store items as JSON to simplify V1 offline storage
  // Needed by the DayBook ledger: without created_at every offline row fell back
  // to DateTime.now() and the day's ordering scrambled.
  DateTimeColumn get createdAt => dateTime().nullable()();
  TextColumn get customerInfoJson => text().nullable()();
  
  @override
  Set<Column> get primaryKey => {id};
}

class Expenses extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get category => text()();
  RealColumn get amount => real()();
  TextColumn get note => text().nullable()();
  DateTimeColumn get date => dateTime()();
  DateTimeColumn get createdAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Suppliers extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get name => text()();
  TextColumn get contactPerson => text().nullable()();
  TextColumn get phone => text().nullable()();
  RealColumn get balance => real().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

class Purchases extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get supplierId => text().nullable()();
  TextColumn get productId => text().nullable()();
  RealColumn get quantity => real()();
  RealColumn get totalAmount => real()();
  DateTimeColumn get date => dateTime()();
  // The DayBook ledger reads payment_type and treats null as CASH. Caching a
  // purchase without it would report a credit purchase as cash leaving the
  // drawer, so it is not optional.
  TextColumn get paymentType => text().nullable()();
  DateTimeColumn get createdAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Invoices extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get invoiceNumber => text().nullable()();
  TextColumn get clientId => text().nullable()();
  TextColumn get clientName => text().nullable()();
  TextColumn get saleId => text().nullable()();
  TextColumn get invoiceDate => text().nullable()();
  TextColumn get dueDate => text().nullable()();
  RealColumn get taxableAmount => real().withDefault(const Constant(0))();
  RealColumn get grandTotal => real().withDefault(const Constant(0))();
  RealColumn get paidAmount => real().withDefault(const Constant(0))();
  TextColumn get paymentStatus => text().nullable()();
  TextColumn get irn => text().nullable()();
  TextColumn get irnStatus => text().nullable()();
  TextColumn get ackNo => text().nullable()();
  TextColumn get signedQr => text().nullable()();
  TextColumn get itemsJson => text().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class BusinessProfileLocal extends Table {
  TextColumn get tenantId => text()();
  TextColumn get name => text().nullable()();
  TextColumn get address => text().nullable()();
  TextColumn get phone => text().nullable()();
  TextColumn get email => text().nullable()();
  TextColumn get currency => text().nullable()();
  TextColumn get gstNo => text().nullable()();
  TextColumn get panNo => text().nullable()();
  TextColumn get upiId => text().nullable()();
  TextColumn get invoiceTerms => text().nullable()();
  TextColumn get footerMessage => text().nullable()();
  BoolColumn get autoIrnEnabled => boolean().withDefault(const Constant(false))();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {tenantId};
}

class Routes extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get vehicleId => text().nullable()();
  TextColumn get driverId => text().nullable()();
  TextColumn get status => text()(); // PLANNED, IN_TRANSIT, COMPLETED
  TextColumn get location => text().nullable()();
  RealColumn get initialOdometer => real().nullable()();
  RealColumn get finalOdometer => real().nullable()();
  RealColumn get actualCash => real().nullable()();
  TextColumn get assignedOrdersJson => text().nullable()();
  DateTimeColumn get date => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

// --- OFFLINE CACHE: tables the app reads but had no local copy of ---
//
// Web caches 21 tables in IndexedDB; this schema held 11, so screens that exist
// and work online — DayBook, client payments, HR, godown stock, logistics stops,
// staff — fell back to a network call and simply failed offline. These are the
// tables those screens actually query, mirrored from Postgres.
//
// Deliberately NOT added: product_categories, sale_batch_consumption and
// movement_log. No mobile screen reads them (checked, zero call sites), and a
// cached table nothing populates is worse than none — it looks like it works.
//
// Numerics land as `real` because Drift has no decimal type; these are read-only
// caches for display, and every money write still goes through the server RPCs,
// so no rounding decision is being made here.

class DayBookLocal extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get date => text()();
  TextColumn get locationId => text().nullable()();
  RealColumn get openingBalance => real().nullable()();
  RealColumn get closingBalance => real().nullable()();
  RealColumn get totalSales => real().nullable()();
  RealColumn get totalExpenses => real().nullable()();
  BoolColumn get isClosed => boolean().withDefault(const Constant(false))();
  DateTimeColumn get closedAt => dateTime().nullable()();
  TextColumn get closedBy => text().nullable()();
  RealColumn get physicalCash => real().nullable()();
  RealColumn get variance => real().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class ClientPayments extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get clientId => text().nullable()();
  RealColumn get amount => real().nullable()();
  TextColumn get date => text().nullable()();
  TextColumn get paymentMethod => text().nullable()();
  TextColumn get notes => text().nullable()();
  TextColumn get recordedBy => text().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Employees extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get name => text().nullable()();
  TextColumn get role => text().nullable()();
  TextColumn get position => text().nullable()();
  TextColumn get department => text().nullable()();
  TextColumn get status => text().nullable()();
  TextColumn get payType => text().nullable()();
  RealColumn get salary => real().nullable()();
  RealColumn get dailyRate => real().nullable()();
  RealColumn get daysWorked => real().nullable()();
  RealColumn get amountPaid => real().nullable()();
  TextColumn get phone => text().nullable()();
  TextColumn get email => text().nullable()();
  TextColumn get bankAccount => text().nullable()();
  TextColumn get employmentType => text().nullable()();
  TextColumn get joiningDate => text().nullable()();
  TextColumn get notes => text().nullable()();
  TextColumn get userId => text().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class InventoryLocations extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get name => text()();
  TextColumn get type => text()(); // WAREHOUSE | VEHICLE
  TextColumn get referenceId => text().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class InventoryBalances extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get productId => text()();
  TextColumn get locationId => text().nullable()();
  RealColumn get quantity => real().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class ProductBatches extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get productId => text()();
  TextColumn get purchaseId => text().nullable()();
  TextColumn get supplierId => text().nullable()();
  TextColumn get warehouseId => text().nullable()();
  TextColumn get receivedDate => text().nullable()();
  TextColumn get expiryDate => text().nullable()();
  RealColumn get unitCost => real().nullable()();
  RealColumn get qtyReceived => real().nullable()();
  RealColumn get qtyRemaining => real().nullable()();
  // Where the lot came from and how much its cost can be trusted — mirrors the
  // columns added server-side so mobile can show the same warning as web.
  TextColumn get origin => text().nullable()();
  TextColumn get costBasis => text().nullable()();
  TextColumn get note => text().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class Vehicles extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get name => text().nullable()();
  TextColumn get plateNumber => text().nullable()();
  TextColumn get type => text().nullable()();
  TextColumn get status => text().nullable()();
  RealColumn get capacity => real().nullable()();
  TextColumn get fuelType => text().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class RouteStops extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get routeId => text()();
  TextColumn get invoiceId => text().nullable()();
  TextColumn get clientId => text().nullable()();
  TextColumn get clientName => text().nullable()();
  IntColumn get sequence => integer().nullable()();
  TextColumn get status => text().nullable()();
  TextColumn get notes => text().nullable()();
  RealColumn get cashCollected => real().nullable()();
  TextColumn get itemsDeliveredJson => text().nullable()();
  DateTimeColumn get visitedAt => dateTime().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class PurchaseReturns extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get purchaseId => text().nullable()();
  TextColumn get supplierId => text().nullable()();
  TextColumn get supplierName => text().nullable()();
  TextColumn get productId => text().nullable()();
  TextColumn get productName => text().nullable()();
  RealColumn get quantity => real().nullable()();
  RealColumn get unitPrice => real().nullable()();
  RealColumn get totalAmount => real().nullable()();
  TextColumn get reason => text().nullable()();
  TextColumn get date => text().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class UsersLocal extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get name => text().nullable()();
  TextColumn get email => text().nullable()();
  TextColumn get status => text().nullable()();
  TextColumn get avatarUrl => text().nullable()();
  // roles is text[] and permissions is jsonb server-side; both are stored as
  // encoded JSON here and decoded at the read site.
  TextColumn get rolesJson => text().nullable()();
  TextColumn get permissionsJson => text().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

// --- DATABASE CLASS ---

@DriftDatabase(tables: [
  SyncMutations,
  Tenants,
  Products,
  Clients,
  Sales,
  Expenses,
  Suppliers,
  Purchases,
  Invoices,
  BusinessProfileLocal,
  Routes,
  DayBookLocal,
  ClientPayments,
  Employees,
  InventoryLocations,
  InventoryBalances,
  ProductBatches,
  Vehicles,
  RouteStops,
  PurchaseReturns,
  UsersLocal,
])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  /// Open against a supplied executor. Exists so migrations can be tested
  /// against a database that already holds an older schema — a fresh install
  /// exercises onCreate and proves nothing about upgrading a real device.
  AppDatabase.connect(QueryExecutor e) : super(e);

  @override
  int get schemaVersion => 6;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      await m.createAll();
    },
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        await m.addColumn(syncMutations, syncMutations.rpcName);
        await m.addColumn(syncMutations, syncMutations.status);
        await m.addColumn(syncMutations, syncMutations.attempts);
        await m.addColumn(syncMutations, syncMutations.lastError);
        await m.addColumn(syncMutations, syncMutations.nextAttemptAt);
        await m.addColumn(syncMutations, syncMutations.lastAttemptAt);
        await customStatement(
          "UPDATE sync_mutations SET status = CASE WHEN is_synced = 1 THEN 'SUCCESS' ELSE 'PENDING' END WHERE status IS NULL OR status = ''");
      }
      if (from < 3) {
        await m.createTable(invoices);
        await m.createTable(businessProfileLocal);
      }
      if (from < 4) {
        await m.addColumn(products, products.cessRate);
        await m.addColumn(products, products.hsnCode);
      }
      if (from < 5) {
        await m.addColumn(products, products.secondaryUnit);
        await m.addColumn(products, products.conversionFactor);
      }
      if (from < 6) {
        // Ten new cache tables. createTable emits CREATE TABLE IF NOT EXISTS,
        // so this is safe to re-run on a partially migrated install.
        await m.createTable(dayBookLocal);
        await m.createTable(clientPayments);
        await m.createTable(employees);
        await m.createTable(inventoryLocations);
        await m.createTable(inventoryBalances);
        await m.createTable(productBatches);
        await m.createTable(vehicles);
        await m.createTable(routeStops);
        await m.createTable(purchaseReturns);
        await m.createTable(usersLocal);
        // Columns the DayBook ledger needs to render an offline day faithfully.
        await m.addColumn(sales, sales.createdAt);
        await m.addColumn(sales, sales.customerInfoJson);
        await m.addColumn(expenses, expenses.createdAt);
        await m.addColumn(purchases, purchases.paymentType);
        await m.addColumn(purchases, purchases.createdAt);
      }
    },
  );
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'ledgr_local.sqlite'));
    return NativeDatabase(file);
  });
}
