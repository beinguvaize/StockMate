import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/features/finance/presentation/add_expense_screen.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart'
    show posStoresProvider;

/// The category grid used a fixed 0.78 aspect ratio, so at 360dp each cell
/// was ~76dp tall against ~83dp of icon and label, and Flutter painted its
/// overflow stripe on small Android phones. These pump the whole screen at
/// real phone widths and fail on any layout exception.
void main() {
  Future<void> pump(WidgetTester tester, double width,
      {List<String> custom = const []}) async {
    tester.view.physicalSize = Size(width, 780);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tenantContextProvider.overrideWith((ref) async => null),
        posStoresProvider.overrideWith((ref) async => const []),
        customExpenseCategoriesProvider.overrideWith((ref) async => custom),
      ],
      child: const MaterialApp(home: AddExpenseScreen()),
    ));
    await tester.pump();
  }

  testWidgets('category grid fits a 360x780 phone without overflow', (t) async {
    await pump(t, 360);
    expect(t.takeException(), isNull);
    expect(find.text('PETROL'), findsOneWidget);
    expect(find.text('ADD'), findsOneWidget);
  });

  for (final width in [320.0, 412.0]) {
    testWidgets('category grid fits ${width.toInt()}dp without overflow',
        (t) async {
      await pump(t, width, custom: const ['Packaging', 'Cleaning supplies']);
      expect(t.takeException(), isNull);
      expect(find.text('PACKAGING'), findsOneWidget);
    });
  }

  testWidgets('five tiles still share one row at 360dp', (t) async {
    await pump(t, 360);
    final food = t.getTopLeft(find.text('FOOD'));
    final utility = t.getTopLeft(find.text('UTILITY'));
    final purchase = t.getTopLeft(find.text('PURCHASE'));
    expect(utility.dy, food.dy);
    expect(purchase.dy, greaterThan(food.dy));
  });
}
