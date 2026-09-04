// Does the v6 migration actually run on a device that already has v5?
//
// A fresh install exercises onCreate and proves nothing — it creates every table
// from scratch whether or not the onUpgrade branch is correct. The v5 migration
// was shipped without this check, so it was never known whether an existing
// install upgraded or crashed on first open. This closes that.
//
// Builds a real SQLite file holding the v5 schema (user_version = 5), opens
// AppDatabase over it, and asserts the ten v6 tables now exist and that the v5
// data survived.

import 'dart:io';

import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:sqlite3/sqlite3.dart';

const _v6Tables = [
  'day_book_local', 'client_payments', 'employees',
  'inventory_locations', 'inventory_balances', 'product_batches',
  'vehicles', 'route_stops', 'purchase_returns', 'users_local',
];

void main() {
  test('v5 install upgrades to v6, keeps its data, gains the ten tables', () async {
    final file = File('${Directory.systemTemp.path}/ledgr_v5_${DateTime.now().microsecondsSinceEpoch}.sqlite');
    addTearDown(() { if (file.existsSync()) file.deleteSync(); });

    // --- Stand up a v5 database the way a real device would have it. sales,
    // expenses and purchases must be present: the v6 upgrade adds columns to all
    // three, so a fixture without them would pass while a real device threw.
    final raw = sqlite3.open(file.path);
    raw.execute('''
      CREATE TABLE products (
        id TEXT NOT NULL PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sku TEXT, category TEXT, unit TEXT,
        secondary_unit TEXT, conversion_factor REAL,
        cost_price REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        stock REAL NOT NULL DEFAULT 0,
        tax_rate REAL NOT NULL DEFAULT 0,
        cess_rate REAL NOT NULL DEFAULT 0,
        hsn_code TEXT, image TEXT
      );
    ''');
    raw.execute('''
      CREATE TABLE sales (
        id TEXT NOT NULL PRIMARY KEY, tenant_id TEXT NOT NULL, client_id TEXT,
        payment_method TEXT NOT NULL, payment_status TEXT NOT NULL,
        subtotal REAL NOT NULL, tax REAL NOT NULL, total_amount REAL NOT NULL,
        paid_amount REAL NOT NULL DEFAULT 0, date INTEGER NOT NULL, items_json TEXT NOT NULL
      );
    ''');
    raw.execute('''
      CREATE TABLE expenses (
        id TEXT NOT NULL PRIMARY KEY, tenant_id TEXT NOT NULL, category TEXT NOT NULL,
        amount REAL NOT NULL, note TEXT, date INTEGER NOT NULL
      );
    ''');
    raw.execute('''
      CREATE TABLE purchases (
        id TEXT NOT NULL PRIMARY KEY, tenant_id TEXT NOT NULL, supplier_id TEXT,
        product_id TEXT, quantity REAL NOT NULL, total_amount REAL NOT NULL,
        date INTEGER NOT NULL
      );
    ''');
    raw.execute(
      "INSERT INTO products (id, tenant_id, name, stock) VALUES ('P1', 'T1', 'Pre-existing item', 42)",
    );
    raw.execute(
      "INSERT INTO purchases (id, tenant_id, quantity, total_amount, date) VALUES ('PUR1', 'T1', 5, 500, 0)",
    );
    raw.execute('PRAGMA user_version = 5');
    raw.dispose();

    // --- Open with the current schema. This is the moment that either migrates
    // or throws on a real upgrade.
    final db = AppDatabase.connect(NativeDatabase(file));
    addTearDown(db.close);

    // Force the migration to run (Drift is lazy until the first query).
    final version = await db.customSelect('PRAGMA user_version').getSingle();
    expect(version.data['user_version'], 6, reason: 'schema should now report v6');

    final names = (await db
            .customSelect("SELECT name FROM sqlite_master WHERE type = 'table'")
            .get())
        .map((r) => r.data['name'] as String)
        .toSet();

    for (final t in _v6Tables) {
      expect(names, contains(t), reason: '$t should have been created by the v6 upgrade');
    }

    // The five columns the DayBook ledger needs must have been added to the
    // pre-existing tables, not just created on fresh ones.
    Future<Set<String>> cols(String table) async => (await db
            .customSelect('PRAGMA table_info($table)')
            .get())
        .map((r) => r.data['name'] as String)
        .toSet();
    expect(await cols('sales'), containsAll(['created_at', 'customer_info_json']));
    expect(await cols('expenses'), contains('created_at'));
    expect(await cols('purchases'), containsAll(['payment_type', 'created_at']));

    // A row that existed before the upgrade must read back through the new
    // nullable column rather than erroring.
    final pur = await db.customSelect(
        "SELECT payment_type FROM purchases WHERE id = 'PUR1'").getSingle();
    expect(pur.data['payment_type'], isNull);

    // The upgrade must not have dropped or recreated what was already there.
    final kept = await db.customSelect('SELECT name, stock FROM products WHERE id = ?',
        variables: [Variable.withString('P1')]).getSingle();
    expect(kept.data['name'], 'Pre-existing item');
    expect(kept.data['stock'], 42);

    // And the new tables must be writable, not just present.
    await db.customStatement(
      "INSERT INTO day_book_local (id, tenant_id, date, is_closed) VALUES ('D1', 'T1', '2026-07-29', 0)",
    );
    final row = await db.customSelect('SELECT COUNT(*) AS c FROM day_book_local').getSingle();
    expect(row.data['c'], 1);
  });

  test('fresh install creates every table without running onUpgrade', () async {
    final db = AppDatabase.connect(NativeDatabase.memory());
    addTearDown(db.close);

    final names = (await db
            .customSelect("SELECT name FROM sqlite_master WHERE type = 'table'")
            .get())
        .map((r) => r.data['name'] as String)
        .toSet();

    for (final t in _v6Tables) {
      expect(names, contains(t));
    }
    expect(names, contains('products'));
  });
}
