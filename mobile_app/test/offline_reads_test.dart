// The offline fallbacks must hand back rows shaped exactly like Supabase's, or
// the existing fromMap/fromJson parsers break the moment the network drops —
// which is precisely when nobody is watching a debug console.
//
// Seeds the Drift cache directly, then asserts each helper's output both parses
// and carries the fields that change money.

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/offline_reads.dart';
import 'package:mobile_app/features/daybook/data/daybook_models.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart' as hr;
import 'package:mobile_app/features/logistics/data/models/vehicle.dart' as fleet;

const t = 'T1';

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase.connect(NativeDatabase.memory()));
  tearDown(() => db.close());

  test('day_book rows parse through DayBookRecord.fromMap', () async {
    await db.into(db.dayBookLocal).insert(DayBookLocalCompanion.insert(
          id: 'DB1', tenantId: t, date: '2026-07-29',
          openingBalance: const Value(1000),
          closingBalance: const Value(2500),
          isClosed: const Value(true),
          physicalCash: const Value(2450),
          variance: const Value(-50),
        ));

    final rows = await cachedDayBook(db, t);
    expect(rows, hasLength(1));

    final rec = DayBookRecord.fromMap(rows.first);
    expect(rec.date, '2026-07-29');
    expect(rec.openingBalance, 1000);
    expect(rec.isClosed, isTrue);
  });

  test('employees parse through Employee.fromJson', () async {
    await db.into(db.employees).insert(EmployeesCompanion.insert(
          id: 'E1', tenantId: t,
          name: const Value('Ramu'),
          payType: const Value('DAILY'),
          dailyRate: const Value(600),
        ));

    final emp = (await cachedEmployees(db, t)).map(hr.Employee.fromJson).toList();
    expect(emp, hasLength(1));
    expect(emp.first.name, 'Ramu');
  });

  test('vehicles keep their camelCase keys so Vehicle.fromJson works', () async {
    await db.into(db.vehicles).insert(VehiclesCompanion.insert(
          id: 'V1', tenantId: t,
          name: const Value('Tempo'),
          plateNumber: const Value('KL-01-AB-1234'),
        ));

    final rows = await cachedVehicles(db, t);
    // Guard the exact trap: vehicles is the one table with quoted mixed-case
    // columns server-side, so snake_case here would silently read as null.
    expect(rows.first.containsKey('plateNumber'), isTrue);
    expect(rows.first.containsKey('plate_number'), isFalse);
    expect(fleet.Vehicle.fromJson(rows.first).plateNumber, 'KL-01-AB-1234');
  });

  test('a credit purchase is not reported as cash', () async {
    // The ledger reads payment_type and treats null as CASH. If the cache drops
    // the column, a credit purchase shows up as money leaving the drawer.
    await db.into(db.purchases).insert(PurchasesCompanion.insert(
          id: 'PUR1', tenantId: t, quantity: 5, totalAmount: 500,
          date: DateTime.parse('2026-07-29T10:00:00Z'),
          paymentType: const Value('CREDIT'),
        ));

    final rows = await cachedPurchasesForDate(db, t, '2026-07-29');
    expect(rows, hasLength(1));
    expect(rows.first['payment_type'], 'CREDIT');
    expect(rows.first['total_amount'], 500);
  });

  test('date filtering keeps other days out of the ledger', () async {
    for (final d in ['2026-07-28', '2026-07-29', '2026-07-30']) {
      await db.into(db.expenses).insert(ExpensesCompanion.insert(
            id: 'EX-$d', tenantId: t, category: 'Fuel', amount: 100,
            date: DateTime.parse('${d}T09:00:00Z'),
          ));
    }
    final rows = await cachedExpensesForDate(db, t, '2026-07-29');
    expect(rows, hasLength(1));
    expect(rows.first['id'], 'EX-2026-07-29');
  });

  test('one tenant never sees another tenant cached on the same device', () async {
    await db.into(db.employees).insert(EmployeesCompanion.insert(
        id: 'E1', tenantId: t, name: const Value('Mine')));
    await db.into(db.employees).insert(EmployeesCompanion.insert(
        id: 'E2', tenantId: 'OTHER', name: const Value('Theirs')));

    final rows = await cachedEmployees(db, t);
    expect(rows, hasLength(1));
    expect(rows.first['name'], 'Mine');
  });

  test('client payments narrow to one client', () async {
    await db.into(db.clientPayments).insert(ClientPaymentsCompanion.insert(
        id: 'CP1', tenantId: t, clientId: const Value('C1'), amount: const Value(300)));
    await db.into(db.clientPayments).insert(ClientPaymentsCompanion.insert(
        id: 'CP2', tenantId: t, clientId: const Value('C2'), amount: const Value(700)));

    expect(await cachedClientPayments(db, t), hasLength(2));
    final one = await cachedClientPayments(db, t, clientId: 'C1');
    expect(one, hasLength(1));
    expect(one.first['amount'], 300);
  });

  test('route stops decode items_delivered back to a list', () async {
    await db.into(db.routeStops).insert(RouteStopsCompanion.insert(
          id: 'RS1', tenantId: t, routeId: 'R1',
          sequence: const Value(1),
          itemsDeliveredJson: const Value('[{"product_id":"P1","qty":3}]'),
        ));

    final rows = await cachedRouteStops(db, t, routeId: 'R1');
    expect(rows.first['items_delivered'], isA<List>());
    expect((rows.first['items_delivered'] as List).first['qty'], 3);
  });

  test('product batches carry origin and cost_basis', () async {
    await db.into(db.productBatches).insert(ProductBatchesCompanion.insert(
          id: 'B1', tenantId: t, productId: 'P1',
          unitCost: const Value(139.57),
          qtyRemaining: const Value(10),
          origin: const Value('OPENING'),
          costBasis: const Value('ESTIMATED'),
        ));

    final rows = await cachedProductBatches(db, t, productId: 'P1');
    expect(rows.first['origin'], 'OPENING');
    expect(rows.first['cost_basis'], 'ESTIMATED');
  });
}
