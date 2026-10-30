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

  // The amount row is ₹, a gap and a field capped at 280dp, centred in what
  // is left of the phone after 24dp padding each side. Under a large system
  // font or a long figure the cap is wider than the room, so the field must
  // give way rather than push the row off the right edge.
  for (final width in [320.0, 360.0]) {
    testWidgets('amount row fits ${width.toInt()}dp under a 1.3x font',
        (t) async {
      t.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
      await pump(t, width);
      expect(t.takeException(), isNull);
    });

    testWidgets('a long amount fits ${width.toInt()}dp', (t) async {
      await pump(t, width);
      await t.enterText(find.byType(TextField).first, '1234567.89');
      await t.pump();
      expect(t.takeException(), isNull);
      expect(find.text('1234567.89'), findsOneWidget);
    });
  }

  // A long figure that scrolls hides its first digits with nothing to say
  // so: ₹12,34,567.89 reads as 2,34,567.89. The figure must shrink to stay
  // whole, down to a floor, and only scroll past it. The test font draws
  // every glyph as a square, wider than Public Sans, so the figures here are
  // shorter than the ones that bite on a real phone.
  Finder amountText() => find.descendant(
      of: find.byType(TextField).first, matching: find.byType(EditableText));
  double amountSize(WidgetTester t) =>
      t.widget<EditableText>(amountText()).style.fontSize!;
  ScrollPosition amountScroll(WidgetTester t) => t
      .state<ScrollableState>(find.descendant(
          of: find.byType(TextField).first, matching: find.byType(Scrollable)))
      .position;

  testWidgets('a long amount shrinks to stay whole at 320dp', (t) async {
    await pump(t, 320);
    await t.enterText(find.byType(TextField).first, '12345.67');
    await t.pump();
    expect(t.takeException(), isNull);
    expect(amountSize(t), lessThan(56));
    expect(amountSize(t), greaterThanOrEqualTo(28));
    expect(amountScroll(t).maxScrollExtent, 0,
        reason: 'the whole figure fits, so nothing is scrolled out of view');
  });

  testWidgets('the figure never shrinks below 28 and scrolls past it',
      (t) async {
    await pump(t, 320);
    await t.enterText(find.byType(TextField).first, '1234567890.12');
    await t.pump();
    expect(t.takeException(), isNull);
    expect(amountSize(t), 28);
  });

  testWidgets('an everyday amount keeps the full 56 size', (t) async {
    await pump(t, 360);
    await t.enterText(find.byType(TextField).first, '2500');
    await t.pump();
    expect(amountSize(t), 56);
  });

  testWidgets('five tiles still share one row at 360dp', (t) async {
    await pump(t, 360);
    final food = t.getTopLeft(find.text('FOOD'));
    final utility = t.getTopLeft(find.text('UTILITY'));
    final purchase = t.getTopLeft(find.text('PURCHASE'));
    expect(utility.dy, food.dy);
    expect(purchase.dy, greaterThan(food.dy));
  });
}
