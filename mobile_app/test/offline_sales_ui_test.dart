// What the cashier sees: offline, how many bills are waiting, and — the one
// that matters most — a bill the server refused, with the reason and the two
// things the owner can do about it. A refused sale that only lived in a debug
// log would be a sale the shop believes it made and the books never got.

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/offline_sales_ui.dart';
import 'package:mobile_app/core/database/sync_service.dart';
import 'package:mobile_app/main.dart' show databaseProvider, syncServiceProvider;

import 'support/fake_sync_transport.dart';

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  late AppDatabase db;
  late FakeSyncTransport net;
  late SyncService svc;

  setUp(() {
    db = AppDatabase.connect(NativeDatabase.memory());
    net = FakeSyncTransport(online: false);
    svc = SyncService(db, transport: net, autoStart: false);
  });
  // The in-memory database is not closed: its watch streams were opened
  // inside the widget tester's fake clock, and close() waits on cleanup that
  // clock never runs. It dies with the test isolate.
  tearDown(() => svc.dispose());

  // Drift's in-memory database answers in microtasks and batches stream
  // updates on zero-length timers, so stepping the fake clock is enough.
  // (No runAsync: that would also let google_fonts try the network.)
  Future<void> settle(WidgetTester t) async {
    for (var i = 0; i < 10; i++) {
      await t.pump(const Duration(milliseconds: 50));
    }
  }

  Future<void> pump(WidgetTester t) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(db),
        syncServiceProvider.overrideWithValue(svc),
        tenantContextProvider.overrideWith((ref) async => null),
      ],
      child: const MaterialApp(
        home: Scaffold(body: Padding(
          padding: EdgeInsets.all(16),
          child: OfflineSalesBanner(),
        )),
      ),
    ));
    await settle(t);
  }

  Future<void> teardown(WidgetTester t) async {
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 1));
  }

  testWidgets('online with nothing queued shows nothing', (t) async {
    net.online = true;
    await pump(t);
    expect(find.byKey(const Key('offline-sales-banner')), findsNothing);
    await teardown(t);
  });

  testWidgets('offline says so and counts the bills on the phone', (t) async {
    await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
    await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-2'));
    await pump(t);
    expect(find.text('Offline — 2 sales saved on this phone, not synced'), findsOneWidget);
    await teardown(t);
  });

  testWidgets('back online: Sync now sends them and the banner clears', (t) async {
    await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-1'));
    net.online = true;
    await pump(t);
    expect(find.text('1 sale not synced yet — tap to sync'), findsOneWidget);

    await t.tap(find.byKey(const Key('offline-sales-banner')));
    await settle(t);
    expect(find.text('Bill SAL-1'), findsOneWidget);

    await t.tap(find.byKey(const Key('sync-now')));
    await settle(t);
    expect(net.calls, ['process_sale:SAL-1']);
    expect(find.text('Nothing waiting.'), findsOneWidget);
    await teardown(t);
  });

  testWidgets('a refused bill is shown with its reason, and Discard keeps it on record',
      (t) async {
    await svc.rpcOnlineOrQueue('process_sale', saleParams('SAL-9', total: 340));
    net.online = true;
    net.refuse['SAL-9'] =
        'NEGATIVE_STOCK_BLOCKED: Salt has 0 in stock and this bill needs 1';
    await svc.sync();
    await pump(t);
    expect(find.text('1 refused by the server — tap to fix'), findsOneWidget);

    await t.tap(find.byKey(const Key('offline-sales-banner')));
    await settle(t);
    expect(find.text('Bill SAL-9'), findsOneWidget);
    expect(find.text('Not enough stock'), findsOneWidget);
    expect(find.text('Salt has 0 in stock and this bill needs 1'), findsOneWidget);
    // The support code: refused when sent, and why.
    expect(find.text('SYNC-03 / DB-03'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);

    await t.tap(find.text('Discard'));
    await settle(t);
    expect(find.textContaining('This sale will NOT be recorded'), findsOneWidget);
    await t.tap(find.byKey(const Key('confirm-discard')));
    await settle(t);

    final rows = await db.select(db.syncMutations).get();
    expect(rows.single.status, JobStatus.discarded, reason: 'kept, not deleted');
    expect(find.text('Bill SAL-9'), findsNothing);
    await teardown(t);
  });
}
