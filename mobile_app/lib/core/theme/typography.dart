import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'colors.dart';

/// The type scale. One place, six roles, one typeface.
///
/// WHY THIS EXISTS. The app carried 1,200+ inline `fontSize:` literals across
/// twenty distinct sizes, and `GoogleFonts.*` was called directly in roughly a
/// hundred files -- so the ThemeData textTheme in main.dart described a scale
/// that almost nothing actually used. Two consequences, both visible:
///
///  * 131 pieces of text were set at 7-10px. Below about 12px a label stops
///    being read and starts being a texture; on a phone held at arm's length
///    in a shop, a 9px quantity is not information. Nothing here goes below
///    [caption] at 13.
///  * Twenty sizes cannot express a hierarchy, because no two of them are
///    different enough to signal anything. Six can. The jumps are deliberate:
///    32 / 22 / 17 / 15 / 13, each roughly a fifth larger than the last.
///
/// A second family (JetBrains Mono) was used for small uppercase letter-spaced
/// labels. That is a decorative tic, not information design -- it made the KPI
/// captions harder to read than the plain text around them. Monospace remains
/// right for one thing only: columns of digits that must align, which is what
/// [moneyLarge]/[money] use tabular figures for instead of a second family.
class AppText {
  AppText._();

  /// Screen-level heading. The "Where?" of the reference -- one per screen,
  /// stated once, large enough that nothing else competes with it.
  static TextStyle get display => GoogleFonts.manrope(
    fontSize: 32,
    fontWeight: FontWeight.w800,
    height: 1.15,
    letterSpacing: -0.8,
    color: AppColors.onSurface,
  );

  /// Section heading inside a screen.
  static TextStyle get title => GoogleFonts.manrope(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    height: 1.2,
    letterSpacing: -0.4,
    color: AppColors.onSurface,
  );

  /// A row's own name -- the "Pocono Mountains, PA" line.
  static TextStyle get heading => GoogleFonts.manrope(
    fontSize: 17,
    fontWeight: FontWeight.w700,
    height: 1.3,
    letterSpacing: -0.2,
    color: AppColors.onSurface,
  );

  /// Default reading size. Not 13: body text is the thing a user reads most,
  /// and it was the thing set smallest.
  static TextStyle get body => GoogleFonts.manrope(
    fontSize: 15,
    fontWeight: FontWeight.w400,
    height: 1.45,
    color: AppColors.onSurface,
  );

  static TextStyle get bodyStrong => body.copyWith(fontWeight: FontWeight.w600);

  /// Supporting line under a heading -- "Popular lake destination". Muted by
  /// colour, not by shrinking it into illegibility.
  static TextStyle get caption => GoogleFonts.manrope(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    height: 1.4,
    color: AppColors.inkTertiary,
  );

  /// Buttons, tabs, chips. The floor of the scale.
  static TextStyle get label => GoogleFonts.manrope(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    height: 1.2,
    letterSpacing: 0,
    color: AppColors.onSurface,
  );

  // ── Money ────────────────────────────────────────────────────────────────
  // Tabular figures, so a column of amounts aligns on the decimal without a
  // monospace family. Every digit is the same width; nothing else changes.

  /// The one big number on a screen. w700 rather than the w900 it replaces:
  /// at 32px, black weight with -1.2 tracking closes the counters and reads as
  /// a logo rather than a figure.
  static TextStyle get moneyLarge => GoogleFonts.manrope(
    fontSize: 32,
    fontWeight: FontWeight.w700,
    height: 1.1,
    letterSpacing: -0.8,
    color: AppColors.onSurface,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// Amounts in lists and cards.
  static TextStyle get money => GoogleFonts.manrope(
    fontSize: 17,
    fontWeight: FontWeight.w700,
    height: 1.2,
    letterSpacing: -0.2,
    color: AppColors.onSurface,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// Amounts in dense table rows.
  static TextStyle get moneySmall => GoogleFonts.manrope(
    fontSize: 15,
    fontWeight: FontWeight.w600,
    height: 1.2,
    color: AppColors.onSurface,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// The running total at the till. Bigger than every other role on purpose:
  /// a cashier reads this across a counter, and the customer often reads it
  /// upside down from the other side. `moneyLarge` at 32 is a reporting
  /// figure; this is a point-of-sale one.
  ///
  /// Added rather than reused because the scale had no role this large and
  /// the header above says to add a token when none fits. Forcing the till
  /// total down to 32 would have shrunk it by 40%.
  static TextStyle get moneyHero => GoogleFonts.manrope(
    fontSize: 52,
    fontWeight: FontWeight.w800,
    height: 1,
    letterSpacing: -1,
    color: AppColors.onSurface,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// The headline figure ON the dark Today card. Between moneyLarge at 32
  /// and moneyHero at 52, because it is neither: it is read at arm's length
  /// like a report, but it is the one number the screen exists to show, so
  /// it outranks every reporting figure on it.
  ///
  /// The colour is deliberately absent -- this style is only ever drawn on
  /// the inverse surface, and the caller supplies onSurfaceInverse.
  static TextStyle get moneyCard => GoogleFonts.manrope(
    fontSize: 36,
    fontWeight: FontWeight.w800,
    height: 1.05,
    letterSpacing: -1.2,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// A large numeric entry field — the quantity keypad. Sized for thumb
  /// entry rather than for reading, which is why it is its own role and not
  /// a money one: it is an input, and it is not currency.
  static TextStyle get numericEntry => GoogleFonts.manrope(
    fontSize: 48,
    fontWeight: FontWeight.w700,
    height: 1,
    color: AppColors.onSurface,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// Section label — uppercase, tracked, above a group of rows.
  ///
  /// The approved screens set this at 12px. It is 13 here, deliberately: the
  /// header of this file states that nothing goes below caption at 13,
  /// because "on a phone held at arm's length in a shop, a 9px quantity is
  /// not information". Uppercase, w700 and the tracking already separate it
  /// from body text; shrinking it as well would buy nothing and cost the
  /// floor. The mockups were corrected to match this, not the other way
  /// round.
  static TextStyle get eyebrow => GoogleFonts.manrope(
    fontSize: 13,
    fontWeight: FontWeight.w700,
    height: 1.2,
    letterSpacing: 0.6,
    color: AppColors.inkTertiary,
  );

  /// Builds the Material text theme from the scale above, so a widget that
  /// reaches for `Theme.of(context).textTheme` lands on the same six roles
  /// rather than on Material's defaults.
  static TextTheme get textTheme => TextTheme(
    displayLarge: display,
    displayMedium: display.copyWith(fontSize: 28, letterSpacing: -0.6),
    displaySmall: title,
    headlineLarge: title,
    headlineMedium: title.copyWith(fontSize: 20),
    headlineSmall: heading.copyWith(fontSize: 18),
    titleLarge: heading,
    titleMedium: bodyStrong,
    titleSmall: label,
    bodyLarge: body,
    bodyMedium: body.copyWith(fontSize: 14),
    bodySmall: caption,
    labelLarge: label,
    labelMedium: label.copyWith(
      fontWeight: FontWeight.w500,
      color: AppColors.inkTertiary,
    ),
    labelSmall: label.copyWith(
      fontSize: 13,
      fontWeight: FontWeight.w500,
      color: AppColors.inkTertiary,
    ),
  );
}
