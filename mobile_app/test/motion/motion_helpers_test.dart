import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/widgets/motion/field_error.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';
import 'package:mobile_app/widgets/motion/save_button.dart';

void main() {
  group('changedDigitIndexes', () {
    test('only differing positions', () {
      expect(changedDigitIndexes('₹100.00', '₹105.00'), {3});
    });
    test('same text -> none', () {
      expect(changedDigitIndexes('₹100.00', '₹100.00'), isEmpty);
    });
    test('width change marks the changed prefix', () {
      expect(changedDigitIndexes('₹99.00', '₹100.00'), {0, 1, 2, 3});
    });
  });

  group('isFirstOpenToday', () {
    final now = DateTime(2026, 11, 21, 9);
    test('never seen -> play', () => expect(isFirstOpenToday(null, now), isTrue));
    test('yesterday -> play', () => expect(isFirstOpenToday('2026-11-20', now), isTrue));
    test('today -> instant', () => expect(isFirstOpenToday(firstOpenStamp(now), now), isFalse));
  });

  group('swipeShouldSnapOpen', () {
    test('past half opens', () => expect(swipeShouldSnapOpen(-90, 0, 160), isTrue));
    test('under half closes', () => expect(swipeShouldSnapOpen(-60, 0, 160), isFalse));
    test('fast left fling opens', () => expect(swipeShouldSnapOpen(-20, -0.2, 160), isTrue));
    test('fast right fling closes', () => expect(swipeShouldSnapOpen(-120, 0.2, 160), isFalse));
  });

  test('dampedOffset is linear inside, sqrt outside', () {
    expect(dampedOffset(-10, 0), -10);
    expect(dampedOffset(16, 0), 12);
  });

  test('toast stack steps back', () {
    expect(toastStackStep(0), (dy: 0.0, scale: 1.0));
    expect(toastStackStep(2).dy, -20);
    expect(toastStackStep(2).scale, closeTo(0.9, 1e-9));
  });

  test('shake starts and ends at rest', () {
    expect(shakeOffset(0), 0);
    expect(shakeOffset(1), 0);
    expect(shakeOffset(0.5).abs(), lessThanOrEqualTo(4));
  });

  testWidgets('SaveButton shows the real error text and ignores taps while saving', (t) async {
    var taps = 0;
    Widget build(SaveStatus s) => MaterialApp(
          home: Scaffold(
            body: SaveButton(
              status: s,
              errorText: 'Out of stock',
              idleLabel: 'Save',
              background: Colors.blue,
              foreground: Colors.white,
              onPressed: () => taps++,
            ),
          ),
        );
    await t.pumpWidget(build(SaveStatus.idle));
    await t.tap(find.text('Save'));
    expect(taps, 1);
    await t.pumpWidget(build(SaveStatus.saving));
    await t.pump(const Duration(milliseconds: 400));
    await t.tap(find.text('Saving'), warnIfMissed: false);
    expect(taps, 1);
    await t.pumpWidget(build(SaveStatus.error));
    await t.pump(const Duration(milliseconds: 400));
    expect(find.text('Out of stock'), findsOneWidget);
  });
}
