import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/features/finance/data/models/expense.dart';
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
      {List<String> custom = const [], TextScaler? scaler, Expense? expense}) async {
    tester.view.physicalSize = Size(width, 780);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tenantContextProvider.overrideWith((ref) async => null),
        posStoresProvider.overrideWith((ref) async => const []),
        customExpenseCategoriesProvider.overrideWith((ref) async => custom),
      ],
      child: MaterialApp(
        builder: scaler == null
            ? null
            : (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(textScaler: scaler),
                  child: child!,
                ),
        home: AddExpenseScreen(expense: expense),
      ),
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

  // 123456789.12 is the longest figure the field accepts; at 320dp it still
  // needs well under 28 to fit, so it reaches the floor.
  testWidgets('the figure never shrinks below 28 and scrolls past it',
      (t) async {
    await pump(t, 320);
    await t.enterText(find.byType(TextField).first, '123456789.12');
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

  // At 2x the test font's square glyphs overflow the CATEGORY header and the
  // Log Expense button too. Those rows predate the amount sizing and are
  // tracked apart, so the 2x cases let RenderFlex overflows through and
  // instead measure the amount row itself: its children must fit inside it.
  // Any other kind of error still fails.
  Future<List<String>> otherErrors(Future<void> Function() body) async {
    final errors = <String>[];
    final previous = FlutterError.onError;
    FlutterError.onError = (details) => errors.add(details.toString());
    try {
      await body();
    } finally {
      FlutterError.onError = previous;
    }
    return errors.where((e) => !e.contains('A RenderFlex overflowed')).toList();
  }

  void expectAmountRowFits(WidgetTester t) {
    final row = t.renderObject<RenderFlex>(find
        .ancestor(of: find.byType(TextField).first, matching: find.byType(Row))
        .first);
    var width = 0.0;
    var tallest = 0.0;
    row.visitChildren((child) {
      final size = (child as RenderBox).size;
      width += size.width;
      if (size.height > tallest) tallest = size.height;
    });
    expect(width, lessThanOrEqualTo(row.size.width + 0.01),
        reason: 'amount row overflows horizontally');
    expect(tallest, lessThanOrEqualTo(row.size.height + 0.01),
        reason: 'amount row overflows vertically');
  }

  testWidgets('under non-linear font scaling the figure still fits whole',
      (t) async {
    await pump(t, 320, scaler: const _AndroidNonLinearScaler());
    await t.enterText(find.byType(TextField).first, '12345.67');
    await t.pump();
    expect(t.takeException(), isNull);
    expect(amountScroll(t).maxScrollExtent, 0);
  });

  testWidgets('the floor is on the rendered size, not the nominal one',
      (t) async {
    t.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
    final errors = await otherErrors(() async {
      await pump(t, 320);
      await t.enterText(find.byType(TextField).first, '123456789.12');
      await t.pump();
    });
    expect(errors, isEmpty);
    expectAmountRowFits(t);
    expect(amountSize(t) * 2.0, closeTo(28, 0.1));
  });

  for (final scale in [1.0, 1.3, 2.0]) {
    testWidgets('the form does not climb while a long figure is typed '
        '(320dp, ${scale}x)', (t) async {
      t.platformDispatcher.textScaleFactorTestValue = scale;
      addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
      const figure = '1234567.89';
      final ys = <double>[];
      final errors = await otherErrors(() async {
        await pump(t, 320);
        for (var i = 1; i <= figure.length; i++) {
          await t.enterText(
              find.byType(TextField).first, figure.substring(0, i));
          await t.pump();
          ys.add(t.getTopLeft(find.text('DESCRIPTION')).dy);
          expectAmountRowFits(t);
        }
      });
      expect(errors, isEmpty);
      expect(ys.toSet(), hasLength(1), reason: 'DESCRIPTION moved: $ys');
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

  // The test font draws every glyph as a full square, wider than Public
  // Sans, so at 2x it overflows the CATEGORY header and the Log Expense
  // button where real glyphs do not. These look at one widget's geometry
  // and drop that unrelated noise.
  Future<void> pumpScaled(WidgetTester t, double width, double scale) async {
    await pump(t, width, scaler: TextScaler.linear(scale));
    t.takeException();
  }

  // A paragraph squeezed below what its text needs is cut off: narrower
  // than its one-line width (CASH drawn as CAS), or shorter than its lines
  // (the date's descenders lost at the baseline).
  void expectWhole(WidgetTester t, Finder text, {bool oneLine = false}) {
    final p = t.renderObject<RenderParagraph>(text);
    if (oneLine) {
      expect(
        p.size.width,
        greaterThanOrEqualTo(p.getMaxIntrinsicWidth(double.infinity) - 0.01),
        reason: 'label is narrower than its text',
      );
    }
    expect(
      p.size.height,
      greaterThanOrEqualTo(p.getMinIntrinsicHeight(p.size.width) - 0.01),
      reason: 'label is shorter than its lines',
    );
  }

  for (final scale in [1.3, 2.0]) {
    for (final width in [320.0, 360.0, 412.0]) {
      testWidgets('PAID VIA chips show whole labels at ${width.toInt()}dp, '
          '${scale}x', (t) async {
        await pumpScaled(t, width, scale);
        for (final m in ['CASH', 'UPI', 'BANK', 'CARD']) {
          expectWhole(t, find.text(m), oneLine: true);
          expect(t.getBottomRight(find.text(m)).dx, lessThanOrEqualTo(width));
        }
      });

      testWidgets(
        'date field holds its text at ${width.toInt()}dp, ${scale}x',
        (t) async {
          await pumpScaled(t, width, scale);
          expectWhole(t, find.textContaining('Today, '));
        },
      );
    }
  }

  testWidgets('PAID VIA stays one row of four at 1x', (t) async {
    await pump(t, 360);
    final cash = t.getTopLeft(find.text('CASH'));
    expect(t.getTopLeft(find.text('CARD')).dy, cash.dy);
    expectWhole(t, find.text('CASH'), oneLine: true);
  });

  group('amount field takes a well-formed figure only', () {
    Future<String> type(WidgetTester t, List<String> steps) async {
      await pump(t, 360);
      final field = find.byType(TextField).first;
      for (final s in steps) {
        await t.enterText(field, s);
        await t.pump();
      }
      return t.widget<TextField>(field).controller!.text;
    }

    testWidgets('a second dot is refused', (t) async {
      expect(await type(t, ['12.5', '12.5.']), '12.5');
    });

    testWidgets('a third decimal is refused', (t) async {
      expect(await type(t, ['12.34', '12.345']), '12.34');
    });

    testWidgets('a tenth rupee digit is refused', (t) async {
      expect(await type(t, ['123456789', '1234567890']), '123456789');
      await t.enterText(find.byType(TextField).first, '123456789.99');
      await t.pump();
      expect(find.text('123456789.99'), findsOneWidget);
    });

    testWidgets('pasted grouping commas are still stripped', (t) async {
      expect(await type(t, ['1,234.50']), '1234.50');
    });
  });

  testWidgets('edit mode opens on the stored amount, paise included', (
    t,
  ) async {
    await pump(
      t,
      360,
      expense: Expense(id: 'e1', category: 'Food', amount: 150.5),
    );
    expect(find.text('150.5'), findsOneWidget);
  });

  testWidgets('edit mode shows a whole amount without decimals', (t) async {
    await pump(
      t,
      360,
      expense: Expense(id: 'e1', category: 'Food', amount: 2000),
    );
    expect(find.text('2000'), findsOneWidget);
  });
}

/// A stand-in for Android 14's non-linear font scaling at its 1.3 setting:
/// small text grows by 1.3x, and the factor tapers to 1.0x at 100sp, so a
/// 56sp figure grows much less than its label. Flutter hands that platform
/// curve to the app through MediaQuery.textScaler.
class _AndroidNonLinearScaler extends TextScaler {
  const _AndroidNonLinearScaler();

  @override
  double scale(double fontSize) {
    if (fontSize <= 30) return fontSize * 1.3;
    if (fontSize >= 100) return fontSize;
    final factor = 1.3 - 0.3 * (fontSize - 30) / 70;
    return fontSize * factor;
  }

  @override
  // ignore: deprecated_member_use
  double get textScaleFactor => 1.3;
}
