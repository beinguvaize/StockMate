import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/returns/data/models/sales_return.dart';
import 'package:mobile_app/features/returns/data/models/sales_return_item.dart';
import 'package:mobile_app/features/returns/presentation/providers/returns_provider.dart';
import 'package:mobile_app/features/returns/presentation/sales_returns_tab.dart';

/// The Returns tab on the phone's Sales screen. The list reads
/// sales_returns through salesReturnsProvider; these tests stand in for that
/// provider so no Supabase call is made.
void main() {
  SalesReturn ret({
    required String id,
    String? clientName,
    required String date,
    required double total,
    int items = 1,
  }) => SalesReturn(
    id: id,
    tenantId: 'T1',
    clientName: clientName,
    items: List.generate(items, (i) => {'name': 'Item $i'}),
    totalAmount: total,
    date: date,
    createdAt: DateTime.utc(2026, 7, 14),
  );

  Future<void> pumpTab(
    WidgetTester t, {
    required List<Override> overrides,
  }) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: const MaterialApp(
          home: Scaffold(body: SalesReturnsTab(tenantId: 'T1')),
        ),
      ),
    );
    await t.pumpAndSettle();
  }

  testWidgets(
    'the list renders one row per return with date, customer, items and total',
    (t) async {
      await pumpTab(
        t,
        overrides: [
          salesReturnsProvider.overrideWith(
            (ref, tenantId) async => [
              ret(
                id: 'CRN-2',
                clientName: 'Ravi Stores',
                date: '2026-07-14',
                total: 450,
                items: 2,
              ),
              ret(
                id: 'CRN-1',
                clientName: null,
                date: '2026-07-10',
                total: 120,
              ),
            ],
          ),
        ],
      );

      expect(t.takeException(), isNull);
      expect(find.byKey(const Key('sales-return-row-CRN-2')), findsOneWidget);
      expect(find.byKey(const Key('sales-return-row-CRN-1')), findsOneWidget);

      expect(find.text('Ravi Stores'), findsOneWidget);
      expect(find.text('14 Jul 2026 · 2 items'), findsOneWidget);
      expect(find.text(Money.inr(450)), findsOneWidget);

      // A return with no customer name is a walk-in sale, and one item is singular.
      expect(find.text('Walk-in'), findsOneWidget);
      expect(find.textContaining(' · 1 item'), findsOneWidget);
      expect(find.text(Money.inr(120)), findsOneWidget);
    },
  );

  testWidgets(
    'rows keep the provider order, which is newest first (created_at desc)',
    (t) async {
      await pumpTab(
        t,
        overrides: [
          salesReturnsProvider.overrideWith(
            (ref, tenantId) async => [
              ret(
                id: 'CRN-NEW',
                clientName: 'New',
                date: '2026-07-14',
                total: 1,
              ),
              ret(
                id: 'CRN-OLD',
                clientName: 'Old',
                date: '2026-07-01',
                total: 1,
              ),
            ],
          ),
        ],
      );
      final newY = t
          .getTopLeft(find.byKey(const Key('sales-return-row-CRN-NEW')))
          .dy;
      final oldY = t
          .getTopLeft(find.byKey(const Key('sales-return-row-CRN-OLD')))
          .dy;
      expect(newY, lessThan(oldY));
    },
  );

  testWidgets('an empty register shows the empty state, not a blank list', (
    t,
  ) async {
    await pumpTab(
      t,
      overrides: [
        salesReturnsProvider.overrideWith(
          (ref, tenantId) async => <SalesReturn>[],
        ),
      ],
    );

    expect(find.text('No returns yet'), findsOneWidget);
    expect(find.text('Processed sales returns appear here.'), findsOneWidget);
    expect(find.byType(ListView), findsNothing);
  });

  testWidgets(
    'offline with no cache shows the standard message, and does not crash',
    (t) async {
      await pumpTab(
        t,
        overrides: [
          salesReturnsProvider.overrideWith(
            (ref, tenantId) async =>
                throw Exception('SocketException: offline'),
          ),
        ],
      );

      expect(t.takeException(), isNull);
      expect(
        find.text('Could not load returns. Check your internet and try again.'),
        findsOneWidget,
      );
    },
  );

  testWidgets('tapping a row shows its lines from sales_return_items', (
    t,
  ) async {
    await pumpTab(
      t,
      overrides: [
        salesReturnsProvider.overrideWith(
          (ref, tenantId) async => [
            ret(id: 'CRN-1', clientName: 'Ravi', date: '2026-07-14', total: 90),
          ],
        ),
        salesReturnItemsProvider.overrideWith(
          (ref, returnId) async => [
            const SalesReturnItem(
              id: 'L1',
              lineNo: 1,
              productName: 'Basmati Rice 5kg',
              quantity: 2,
              rate: 45,
              taxRate: 0,
              lineTotal: 90,
            ),
          ],
        ),
      ],
    );

    expect(find.text('Basmati Rice 5kg'), findsNothing);
    await t.tap(find.byKey(const Key('sales-return-row-CRN-1')));
    await t.pumpAndSettle();

    expect(find.text('Basmati Rice 5kg'), findsOneWidget);
    expect(find.text('2 x ${Money.inr(45)}'), findsOneWidget);
    expect(find.text(Money.inr(90)), findsWidgets);
  });

  testWidgets(
    'the Returns tab shows the returns count, the Sales tab does not',
    (t) async {
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1.0;
      addTearDown(t.view.reset);
      var selected = 0;
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => SalesHistoryTabs(
                index: selected,
                returnsCount: 7,
                onChanged: (i) => setState(() => selected = i),
              ),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();

      expect(find.text('Sales'), findsOneWidget);
      expect(find.text('Returns'), findsOneWidget);
      expect(find.byKey(const Key('returns-count-1')), findsOneWidget);
      expect(find.text('7'), findsOneWidget);
      expect(find.byKey(const Key('returns-count-0')), findsNothing);

      await t.tap(find.text('Returns'));
      await t.pumpAndSettle();
      expect(selected, 1);
    },
  );

  testWidgets('the count is left off while it is not yet known', (t) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SalesHistoryTabs(
            index: 0,
            returnsCount: null,
            onChanged: (_) {},
          ),
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('Returns'), findsOneWidget);
    expect(find.byKey(const Key('returns-count-1')), findsNothing);
  });
}
