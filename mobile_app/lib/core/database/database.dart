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
  TextColumn get action => text()(); // UPSERT, DELETE
  TextColumn get payload => text()(); // JSON data
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  BoolColumn get isSynced => boolean().withDefault(const Constant(false))();
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
  RealColumn get costPrice => real().withDefault(const Constant(0))();
  RealColumn get sellingPrice => real().withDefault(const Constant(0))();
  RealColumn get stock => real().withDefault(const Constant(0))();
  RealColumn get taxRate => real().withDefault(const Constant(0))();
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

  @override
  Set<Column> get primaryKey => {id};
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
  Routes
])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  @override
  int get schemaVersion => 1;
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'ledgr_local.sqlite'));
    return NativeDatabase(file);
  });
}
