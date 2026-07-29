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

import 'package:drift/drift.dart';
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

    // --- Stand up a v5 database the way a real device would have it. Only the
    // tables the test touches are needed; the migration must not depend on the
    // others being present.
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
    raw.execute(
      "INSERT INTO products (id, tenant_id, name, stock) VALUES ('P1', 'T1', 'Pre-existing item', 42)",
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
