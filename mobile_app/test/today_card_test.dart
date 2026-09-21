import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/dashboard/presentation/widgets/today_card.dart';

/// The Today card is the one screen element built from an artboard rather than
/// from an existing widget, and its bar chart lays twelve columns and four
/// labels across a 390pt phone. That is exactly the arithmetic that silently
/// overflows, so it is pinned here rather than eyeballed.
void main() {
  Future<void> pump(WidgetTester tester, Widget child, {double width = 390}) {
    tester.view.physicalSize = Size(width, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    return tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: child,
        ),
      ),
    ));
  }

  TodayCard card({
    double amount = 48210,
    int bills = 34,
    double average = 1418,
    double? delta = 12,
    List<double>? hourly,
  }) => TodayCard(
        amount: amount,
        billCount: bills,
        averageBill: average,
        deltaPct: delta,
        hourly: hourly ??
            const [16, 24, 30, 46, 38, 30, 44, 58, 66, 72, 60, 28],
        revenueVisible: true,
        onToggleVisible: () {},
        onTap: () {},
      );

  testWidgets('twelve bars and their labels fit a 390pt phone', (t) async {
    await pump(t, card());
    expect(t.takeException(), isNull);
    expect(find.text('9 am'), findsNothing); // column 1 is unlabelled
    expect(find.text('10 am'), findsOneWidget);
    expect(find.text('1 pm'), findsOneWidget);
    expect(find.text('4 pm'), findsOneWidget);
    expect(find.text('7 pm'), findsOneWidget);
  });

  testWidgets('the figure is grouped in lakhs, not run together', (t) async {
    await pump(t, card(amount: 148210));
    // Money.inr, so no paise: the artboard drew ₹48,210.00, but this app
    // reserves the paisa form for things that reconcile to it. A day's
    // takings is a summary, and the codebase rule outranks the mock.
    expect(find.text('₹1,48,210'), findsOneWidget);
  });

  testWidgets('one bill is a bill, not 1 bills', (t) async {
    await pump(t, card(bills: 1, average: 48210));
    expect(find.textContaining('1 bill ·'), findsOneWidget);
  });

  testWidgets('a day with no bills says so instead of dividing by zero',
      (t) async {
    await pump(t, card(amount: 0, bills: 0, average: 0, delta: null));
    expect(find.text('No bills yet today'), findsOneWidget);
  });

  testWidgets('no delta is drawn when there is no yesterday to compare',
      (t) async {
    await pump(t, card(delta: null));
    expect(find.textContaining('%'), findsNothing);
  });

  testWidgets('a day with no trade draws no chart at all', (t) async {
    // Twelve grey stubs plus one orange "now" bar reads as a broken chart
    // rather than an empty day. This was visible on a live ₹0 morning.
    await pump(t, card(amount: 0, bills: 0, delta: null,
        hourly: List<double>.filled(12, 0)));
    expect(t.takeException(), isNull);
    expect(find.text('10 am'), findsNothing);
  });

  testWidgets('it survives a narrow phone', (t) async {
    await pump(t, card(), width: 320);
    expect(t.takeException(), isNull);
  });
}
