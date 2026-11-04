import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart' show connectivityProvider;
import 'package:mobile_app/features/clients_suppliers/presentation/client_aging_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/receivable_aging_provider.dart';
import 'package:mobile_app/features/reports/presentation/ar_aging_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;

class _FakeSource extends AgingSource {
  final List<Map<String, dynamic>> sales;
  final List<Map<String, dynamic>> clientRows;
  final Object? salesError;
  final Object? clientsError;
  const _FakeSource({
    this.sales = const [],
    this.clientRows = const [],
    this.salesError,
    this.clientsError,
  });

  @override
  Future<List<Map<String, dynamic>>> unpaidSales(String tenantId) async {
    if (salesError != null) throw salesError!;
    return sales;
  }

  @override
  Future<List<Map<String, dynamic>>> clients(String tenantId) async {
    if (clientsError != null) throw clientsError!;
    return clientRows;
  }
}

const _ctx = TenantContext(
  userProfile: UserProfile(id: 'u', email: 'o@example.com', name: 'O', roles: ['OWNER'], tenantId: 't'),
  tenant: Tenant(id: 't', name: 'Demo', slug: 'demo', plan: 'GROWTH', status: 'ACTIVE'),
);

const _sale = {
  'sale_id': 'S1', 'client_id': 'c1', 'client_name': 'Ravi Stores', 'phone': '',
  'sale_date': '2026-01-01', 'total': 1000, 'paid': 250, 'unpaid': 750, 'invoice_id': null,
};
const _client = {'id': 'c1', 'name': 'Ravi Stores', 'outstanding_balance': 750};

Future<void> _pump(
  WidgetTester t,
  Widget screen,
  AgingSource source, {
  ConnectivityResult conn = ConnectivityResult.wifi,
  double width = 360,
  double height = 780,
}) async {
  t.view.physicalSize = Size(width, height);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
  await t.pumpWidget(ProviderScope(
    overrides: [
      connectivityProvider.overrideWith((ref) => Stream.value(conn)),
      tenantContextProvider.overrideWith((ref) async => _ctx),
      agingSourceProvider.overrideWithValue(source),
    ],
    child: MaterialApp(home: screen),
  ));
  await t.pump();
  await t.pump();
  await t.pump();
}

void main() {
  final screens = <String, Widget>{
    'Money to Collect': const ArAgingScreen(),
    'Customer Aging': const ClientAgingScreen(),
  };

  screens.forEach((name, screen) {
    group(name, () {
      testWidgets('shows what get_unpaid_sales returned, tied to balances', (t) async {
        // Tall enough that the list below the summary is built.
        await _pump(t, screen, const _FakeSource(sales: [_sale], clientRows: [_client]),
            height: 1500);
        expect(t.takeException(), isNull);
        expect(find.textContaining('Matches customer balances of ₹750.00'), findsOneWidget);
        expect(find.textContaining('Ravi Stores'), findsWidgets);
      });

      testWidgets('states the gap to client balances', (t) async {
        await _pump(t, screen, const _FakeSource(sales: [_sale], clientRows: [
          {'id': 'c1', 'name': 'Ravi Stores', 'outstanding_balance': 842},
        ]));
        expect(find.textContaining('₹92.00 more than these bills'), findsOneWidget);
      });

      testWidgets('offline says Needs internet, with no figure and no read', (t) async {
        await _pump(t, screen,
            const _FakeSource(salesError: 'must not be read'),
            conn: ConnectivityResult.none);
        expect(find.text('Needs internet'), findsOneWidget);
        expect(find.textContaining('₹'), findsNothing);
      });

      testWidgets('a dropped connection says Needs internet', (t) async {
        await _pump(t, screen, const _FakeSource(salesError: SocketException('down')));
        expect(find.text('Needs internet'), findsOneWidget);
        expect(find.textContaining('₹'), findsNothing);
      });

      testWidgets('a server refusal shows its reason, never a zero', (t) async {
        await _pump(t, screen,
            const _FakeSource(salesError: PostgrestException(message: 'Access denied')));
        expect(find.text('Could not load this report'), findsOneWidget);
        expect(find.text('Access denied'), findsOneWidget);
        expect(find.textContaining('₹'), findsNothing);
        expect(find.text('Nothing unpaid'), findsNothing);
      });

      testWidgets('failing to load balances fails the report', (t) async {
        await _pump(t, screen, const _FakeSource(
            sales: [_sale], clientsError: PostgrestException(message: 'clients failed')));
        expect(find.text('clients failed'), findsOneWidget);
        expect(find.textContaining('₹'), findsNothing);
      });

      testWidgets('nothing unpaid keeps the tie-out on screen', (t) async {
        await _pump(t, screen, const _FakeSource(clientRows: [_client]));
        expect(find.text('Nothing unpaid'), findsOneWidget);
        expect(find.textContaining('₹750.00 more than these bills'), findsOneWidget);
      });

      testWidgets('never says overdue, at any phone width', (t) async {
        for (final w in [320.0, 360.0, 412.0]) {
          await _pump(t, screen, const _FakeSource(sales: [_sale], clientRows: [_client]), width: w);
          expect(t.takeException(), isNull);
          expect(find.textContaining(RegExp('overdue', caseSensitive: false)), findsNothing);
        }
      });
    });
  });
}
