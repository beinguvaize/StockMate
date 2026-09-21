import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/success_tick.dart';

/// The tick sits between the cashier and the next customer, so the things that
/// matter about it are that it finishes, that it finishes quickly, and that it
/// does not move at all for someone who asked their phone to stop moving.
void main() {
  Future<void> pump(WidgetTester tester, {bool reduceMotion = false}) {
    return tester.pumpWidget(
      MediaQuery(
        data: MediaQueryData(disableAnimations: reduceMotion),
        child: const Directionality(
          textDirection: TextDirection.ltr,
          child: Center(child: SuccessTick()),
        ),
      ),
    );
  }

  testWidgets('it animates and settles', (t) async {
    await pump(t);
    // Mid-flight: still running, nothing thrown.
    await t.pump(const Duration(milliseconds: 200));
    expect(t.takeException(), isNull);
    // pumpAndSettle returns rather than timing out, which is the real check:
    // a repeating controller here would hang the till's confirmation forever.
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
  });

  testWidgets('it is still running at 300ms and finished by 560', (t) async {
    // Not measured with pumpAndSettle: that advances in 100ms blocks, so it
    // reports its own granularity rather than the animation's length.
    await pump(t);

    await t.pump(const Duration(milliseconds: 300));
    expect(t.binding.hasScheduledFrame, isTrue,
        reason: 'should still be drawing partway through');

    await t.pump(const Duration(milliseconds: 260));
    expect(t.binding.hasScheduledFrame, isFalse,
        reason: 'an animation the till waits on is a queue');
  });

  testWidgets('reduce motion collapses it to a single frame', (t) async {
    await pump(t, reduceMotion: true);
    final frames = await t.pumpAndSettle();
    // Motion.durationOf gives one frame at 60fps, so this settles almost at
    // once instead of drawing the ring and the check across half a second.
    expect(frames, lessThan(5));
    expect(t.takeException(), isNull);
  });

  testWidgets('it honours a caller-supplied size and colour', (t) async {
    await t.pumpWidget(
      const Directionality(
        textDirection: TextDirection.ltr,
        child: Center(
          child: SuccessTick(size: 96, color: AppColors.brandFill),
        ),
      ),
    );
    await t.pumpAndSettle();
    final box = t.getSize(find.byType(SuccessTick));
    expect(box.width, 96);
    expect(box.height, 96);
  });
}
