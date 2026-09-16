import 'package:flutter/material.dart';

/// Spacing, radius and motion tokens.
///
/// Before this existed the app carried 833 `EdgeInsets` using 17 distinct
/// `.all()` values (including 3, 5, 7 and 9 — no grid), 556
/// `BorderRadius.circular` calls across 20 distinct radii, and nine different
/// durations for what is the same interaction. Reach for these instead of a
/// literal; add a token if none fits rather than inventing a one-off.

/// 4pt spacing grid.
class Gap {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;

  // Ready-made boxes, so a gap never needs a magic number inline.
  static const Widget h4 = SizedBox(height: xs);
  static const Widget h8 = SizedBox(height: sm);
  static const Widget h12 = SizedBox(height: md);
  static const Widget h16 = SizedBox(height: lg);
  static const Widget h24 = SizedBox(height: xl);
  static const Widget w4 = SizedBox(width: xs);
  static const Widget w8 = SizedBox(width: sm);
  static const Widget w12 = SizedBox(width: md);
  static const Widget w16 = SizedBox(width: lg);
}

/// Corner radii. Twenty values collapse to five, plus one pill.
///
/// The app previously expressed "fully rounded" three different ways — 99, 100
/// and `StadiumBorder`. Use [pill] and nothing else.
class Radii {
  static const double xs = 6;
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 20;
  static const double xl = 28;
  static const double pill = 999;

  static const BorderRadius rXs = BorderRadius.all(Radius.circular(xs));
  static const BorderRadius rSm = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius rMd = BorderRadius.all(Radius.circular(md));
  static const BorderRadius rLg = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius rXl = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius rPill = BorderRadius.all(Radius.circular(pill));
}

/// Durations and curves.
///
/// `Curves.easeOut` appeared exactly once in the whole app; everything else
/// fell through to `Curves.linear`, which is why existing transitions feel
/// mechanical. Default to [standard] — linear motion reads as cheap.
class Motion {
  /// Press feedback, ripples — must feel instant.
  static const Duration fast = Duration(milliseconds: 120);

  /// The default. Selection changes, expansion, most state transitions.
  static const Duration base = Duration(milliseconds: 200);

  /// Sheets, page-level transitions.
  static const Duration slow = Duration(milliseconds: 320);

  /// Decelerating — the right default for anything entering or settling.
  static const Curve standard = Curves.easeOutCubic;

  /// For something leaving the screen.
  static const Curve exit = Curves.easeInCubic;

  /// Slight overshoot. Use sparingly, for confirmation moments.
  static const Curve emphasis = Curves.easeOutBack;

  /// Durations that respect the OS "reduce motion" setting.
  ///
  /// Nothing in this app checked `MediaQuery.disableAnimations`, so a user who
  /// has asked their phone to stop moving things still got all 31 animated
  /// widgets. On iOS that switch is often on for vestibular reasons -- motion
  /// that is pleasant for most people makes some people ill.
  ///
  /// Reduced motion means FEWER and GENTLER, not none. Returning zero would
  /// make state changes snap so hard they read as glitches, so this collapses
  /// to a single frame at 60fps: the change is still perceptible as a change,
  /// but nothing travels across the screen.
  static Duration durationOf(BuildContext context, Duration preferred) =>
      MediaQuery.maybeDisableAnimationsOf(context) == true
          ? const Duration(milliseconds: 16)
          : preferred;

  /// The curve to use when motion is reduced -- linear, because an easing
  /// curve over 16ms is indistinguishable from linear and costs a lookup.
  static Curve curveOf(BuildContext context, Curve preferred) =>
      MediaQuery.maybeDisableAnimationsOf(context) == true
          ? Curves.linear
          : preferred;
}
