import 'dart:math' as math;
import 'package:flutter/widgets.dart';

/// Shared motion tokens + pure helpers (motion spec items 1-14).
class MotionCurves {
  static const Curve out = Cubic(0.23, 1, 0.32, 1);
  static const Curve onScreen = Cubic(0.77, 0, 0.175, 1);
  static const Curve drawer = Cubic(0.32, 0.72, 0, 1);
}

/// Duration that collapses to zero when the OS asks for reduced motion.
Duration motionDur(BuildContext context, int ms) =>
    MediaQuery.maybeDisableAnimationsOf(context) == true
        ? Duration.zero
        : Duration(milliseconds: ms);

/// Indexes (right-aligned) of characters that differ between [prev] and [next].
/// Only these digits animate in the rolling number.
Set<int> changedDigitIndexes(String prev, String next) {
  final out = <int>{};
  if (prev.length != next.length) {
    // Different width: everything left of the common suffix changed.
    var common = 0;
    while (common < prev.length &&
        common < next.length &&
        prev[prev.length - 1 - common] == next[next.length - 1 - common]) {
      common++;
    }
    for (var i = 0; i < next.length - common; i++) {
      out.add(i);
    }
    return out;
  }
  for (var i = 0; i < next.length; i++) {
    if (prev[i] != next[i]) out.add(i);
  }
  return out;
}

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// True when [lastSeen] (stored yyyy-MM-dd) is not today: play the entrance.
bool isFirstOpenToday(String? lastSeen, DateTime now) => lastSeen != _ymd(now);

String firstOpenStamp(DateTime now) => _ymd(now);

/// Swipe-row snap decision. [dx] is the current (negative = left) offset,
/// [velocity] px/ms (negative = leftwards), [openWidth] the revealed width.
bool swipeShouldSnapOpen(double dx, double velocity, double openWidth) {
  if (velocity < -0.11) return true;
  if (velocity > 0.11) return false;
  return -dx > openWidth / 2;
}

/// Friction beyond the bounds: linear inside, sqrt-damped outside.
double dampedOffset(double raw, double max) {
  if (raw <= max) return raw;
  return max + math.sqrt(raw - max) * 3;
}

/// Stack placement for the i-th toast (0 = newest).
({double dy, double scale}) toastStackStep(int i) =>
    (dy: -10.0 * i, scale: 1 - 0.05 * i);
