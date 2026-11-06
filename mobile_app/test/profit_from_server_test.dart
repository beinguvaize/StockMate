import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart' show connectivityProvider;
import 'package:mobile_app/features/reports/data/profit_loss.dart';
import 'package:mobile_app/features/reports/data/profit_loss_provider.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
import 'package:mobile_app/features/reports/presentation/sales_summary_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;

class _Fake extends PlSource {
  final List<dynamic> rows;
  final Object? error;
  final calls = <Map<String, dynamic>>[];
  _Fake({this.rows = const [], this.error});

  @override
  Future<List<dynamic>> call(Map<String, dynamic> params) async {
    calls.add(params);
    if (error != null) throw error!;
    return rows;
  }
}

const _ctx = TenantContext(
  userProfile: UserProfile(id: 'u', email: 'o@example.com', name: 'O', roles: ['OWNER'], tenantId: 't'),
  tenant: Tenant(id: 't', name: 'Demo', slug: 'demo', plan: 'GROWTH', status: 'ACTIVE'),
);

void main() {
  // flutter test runs with the package root (mobile_app/) as cwd.
  final fx = jsonDecode(File('../shared/fixtures/pl_ranged.json').readAsStringSync())
      as Map<String, dynamic>;
  final row = fx['row'] as Map<String, dynamic>;

  group('the same call as the web', () {
    test('asks the shared RPC with the shared params', () {
      expect(plRangedRpc, fx['rpc']);
      final q = plQuery('t', DateTimeRange(start: DateTime(2026, 1, 1), end: DateTime(2026, 11, 4)));
      final params = plParams(q);
      expect(params.keys.toList(), fx['params']);
      expect(params['p_from'], (fx['period'] as Map)['from']);
      expect(params['p_to'], (fx['period'] as Map)['to']);
    });

    test('reads every figure from the row, changing none', () {
      final pl = ProfitLoss.fromRow(row);
      expect(pl.netSales, row['revenue_net']);
      expect(pl.cogs, row['cogs']);
      expect(pl.grossProfit, row['gross_profit']);
      expect(pl.expenses, row['expenses']);
      expect(pl.netProfit, row['net_profit']);
      expect(pl.outputGst, row['output_gst']);
      expect(pl.grossMarginPct!.toStringAsFixed(1), '16.0');
    });

    test('a missing figure fails instead of reading as zero', () {
      expect(() => ProfitLoss.fromRow({...row}..remove('net_profit')), throwsFormatException);
      expect(() => ProfitLoss.fromRow({...row, 'cogs': null}), throwsFormatException);
    });

    test('no sales has no margin, not a 0% margin', () {
      expect(ProfitLoss.fromRow({...row, 'revenue_net': 0}).grossMarginPct, isNull);
    });
  });

  group('the period in IST', () {
    test('the day on the picker is the day that is sent', () {
      // Local midnight, as showDateRangePicker returns. No conversion to UTC,
      // which in India would send the day before.
      expect(plDay(DateTime(2026, 11, 1)), '2026-11-01');
      expect(plDay(DateTime(2026, 11, 1, 23, 59)), '2026-11-01');
    });

    test('the default period ends today in IST, not on the phone', () {
      // 20:00 UTC on the 3rd is already 01:30 on the 4th in India.
      final r = defaultPlRange(DateTime.utc(2026, 11, 3, 20));
      expect(plDay(r.end), '2026-11-04');
      expect(plDay(r.start), '2026-10-05');
      expect(plDay(defaultPlRange(DateTime.utc(2026, 11, 3, 18, 29)).end), '2026-11-03');
    });

    test('a month end and a year end stay on their dates', () {
      expect(plDay(defaultPlRange(DateTime.utc(2026, 1, 15, 6)).start), '2025-12-16');
    });
  });

  group('no second definition of profit', () {
    final dart = Directory('lib/features/reports')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'));

    test('no report reads totalCogs or sums a profit', () {
      expect(dart, isNotEmpty);
      final formula = RegExp(r'[-+]\s*(total)?(Cogs|Expenses)\b|\bprofit\s*=', caseSensitive: false);
      for (final f in dart) {
        final code = f.readAsLinesSync().where((l) => !l.trimLeft().startsWith('//')).join('\n');
        expect(code.contains('totalCogs'), isFalse, reason: f.path);
        expect(formula.hasMatch(code), isFalse, reason: f.path);
      }
    });

    test('the only arithmetic on a figure is the margin the web also shows', () {
      final code = File('lib/features/reports/data/profit_loss.dart').readAsStringSync();
      expect(RegExp(r'grossProfit / netSales \* 100').allMatches(code).length, 1);
      expect(RegExp(r'\b(netSales|cogs|grossProfit|expenses)\s*[-+]\s').hasMatch(code), isFalse);
    });
  });

  Future<void> pump(WidgetTester t, Widget screen, PlSource source, {
    ConnectivityResult conn = ConnectivityResult.wifi,
    List<Map<String, dynamic>> sales = const [
      {'id': 'S1', 'date': '2026-11-01', 'totalAmount': 1180, 'items': []},
    ],
  }) async {
    t.view.physicalSize = const Size(390, 1400);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(ProviderScope(
      overrides: [
        connectivityProvider.overrideWith((ref) => Stream.value(conn)),
        tenantContextProvider.overrideWith((ref) async => _ctx),
        plSourceProvider.overrideWithValue(source),
        reportSalesProvider.overrideWith((ref, p) async => sales),
      ],
      child: MaterialApp(home: screen),
    ));
    await t.pump();
    await t.pump();
    await t.pump();
    await t.pump();
  }

  group('Reports hub', () {
    testWidgets('shows the server figure, sent once with the period', (t) async {
      final s = _Fake(rows: [row]);
      await pump(t, const ReportsScreen(), s);
      expect(find.textContaining('-₹32,929'), findsOneWidget);
      expect(find.text('NET PROFIT / LOSS'), findsOneWidget);
      expect(find.text('Gross profit'), findsOneWidget);
      expect(s.calls.length, 1);
      expect(s.calls.single['p_tenant_id'], 't');
      expect(s.calls.single['p_to'], plDay(defaultPlRange().end));
    });

    testWidgets('offline says Needs internet, makes no call and keeps the reports', (t) async {
      final s = _Fake(rows: [row]);
      await pump(t, const ReportsScreen(), s, conn: ConnectivityResult.none);
      expect(find.text('Needs internet'), findsOneWidget);
      expect(find.textContaining('₹'), findsNothing);
      expect(s.calls, isEmpty);
      expect(find.text('Sales Summary'), findsOneWidget);
    });

    testWidgets('a dropped connection says Needs internet', (t) async {
      await pump(t, const ReportsScreen(), _Fake(error: const SocketException('down')));
      expect(find.text('Needs internet'), findsOneWidget);
    });

    testWidgets('a refusal shows its reason and no figure', (t) async {
      await pump(t, const ReportsScreen(),
          _Fake(error: const PostgrestException(message: 'Access denied')));
      expect(find.text('Profit could not load'), findsOneWidget);
      expect(find.text('Access denied'), findsOneWidget);
      expect(find.textContaining('₹'), findsNothing);
    });

    testWidgets('no row back is a failure, not a zero', (t) async {
      await pump(t, const ReportsScreen(), _Fake());
      expect(find.text('Profit could not load'), findsOneWidget);
      expect(find.textContaining('₹'), findsNothing);
    });
  });

  group('Sales Summary', () {
    testWidgets('margin and net sales are the server figures', (t) async {
      await pump(t, const SalesSummaryScreen(), _Fake(rows: [row]));
      expect(find.text('16.0%'), findsOneWidget);
      expect(find.text('GROSS MARGIN'), findsOneWidget);
      expect(find.text('NET SALES'), findsOneWidget);
    });

    testWidgets('without the server, the tiles show no figure', (t) async {
      await pump(t, const SalesSummaryScreen(), _Fake(error: const SocketException('down')));
      expect(find.text('—'), findsNWidgets(2));
      expect(find.text('Needs internet'), findsNWidgets(2));
      expect(find.textContaining('%'), findsNothing);
    });
  });
}
