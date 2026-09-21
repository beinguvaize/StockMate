import 'package:flutter/material.dart';

/// Colour tokens for the app.
///
/// Every foreground/background pairing declared here is verified against WCAG
/// AA by `tool/check_contrast.mjs`. Run it after any change:
///
///     node tool/check_contrast.mjs
///
/// That gate exists because six of the original thirteen pairings failed —
/// including `onPrimary` on `primary`, the most-used pair in the app — and
/// every screen inherited the fault. Do not add a colour here without adding
/// its pairing to the gate.
///
/// Rules of thumb:
///  * Text on a surface needs 4.5:1.
///  * A border that carries meaning (input outline, focus ring) needs 3:1; a
///    decorative hairline does not, which is why `outlineVariant` is exempt
///    from the gate but `outline` is not.
///  * Never put text on `primary` other than `onPrimary`.
class AppColors {
  // ── Brand ────────────────────────────────────────────────────────────────
  // Deepened from #D97706, which measured 3.19:1 against white and put every
  // amber button in the app below the AA floor. #B45309 reads as the same
  // amber at a glance and reaches 5.02:1.
  static const Color primary = Color(0xFFB45309);
  static const Color primaryHover = Color(0xFF92400E);
  static const Color primaryContainer = Color(0xFFFDE68A);
  static const Color primaryMuted = Color(0xFFFCD34D);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onPrimaryContainer = Color(0xFF92400E);

  // ── Brand fill ───────────────────────────────────────────────────────────
  // The literal logo orange, sampled from mark.png and logo.png.
  //
  // It is a FILL, never text: #F09935 measures 2.25:1 on white, and white on
  // it measures the same. `primary` (#B45309, 5.02:1) stays the token for
  // brand-coloured TEXT, which 27 call sites rely on.
  //
  // Ink on this is the logo's own navy at 6.59:1 — the pairing the logo
  // itself already uses, and the reason white is not an option here.
  static const Color brandFill = Color(0xFFF09935);
  static const Color onBrandFill = Color(0xFF192937);

  // ── Inverse surface ──────────────────────────────────────────────────────
  // Money sits on dark. Totals, balances and net profit go on this rather
  // than on a saturated brand panel, which is what separates a ledger from a
  // promotion. White on it is 14.85:1; the logo orange on it is 6.59:1, so
  // the accent finally works as text here even though it cannot on white.
  static const Color surfaceInverse = Color(0xFF192937);
  static const Color surfaceInverseDeep = Color(0xFF0E1922);
  static const Color onSurfaceInverse = Color(0xFFFFFFFF);
  static const Color onSurfaceInverseMuted = Color(0xFF8D9AA8);

  /// Status colours for the dark card. The light-ground `success` and `error`
  /// are tuned for white behind them and go muddy on navy — #15803D measures
  /// 1.85:1 on surfaceInverse, which is unreadable. These are their dark-mode
  /// counterparts: 8.52:1 and 5.37:1.
  /// Hairline on the dark card — decorative, so exempt from the text gate.
  static const Color outlineInverse = Color(0xFF2B3A48);

  static const Color successOnInverse = Color(0xFF4ADE80);
  static const Color errorOnInverse = Color(0xFFF87171);

  // ── Neutrals ─────────────────────────────────────────────────────────────
  static const Color canvas = Color(0xFFFFFFFF);

  /// Warm off-white for full-page grounds. A pure-white page under a warm
  /// orange brand reads cold; this is the same white shifted toward it.
  static const Color canvasWarm = Color(0xFFFBFAF8);
  static const Color surfaceContainer = Color(0xFFF9F9F9);
  static const Color secondaryContainer = Color(0xFFF3F4F6);

  /// Meaningful boundary — input outlines, control borders. Was #D1D5DB at
  /// 1.47:1, effectively invisible.
  static const Color outline = Color(0xFF767F8C);

  /// Decorative hairline only. Deliberately below 3:1; never use it to convey
  /// the edge of a control.
  static const Color outlineVariant = Color(0xFFE8E2D9);

  // ── Ink ──────────────────────────────────────────────────────────────────
  /// The logo's wordmark navy, sampled from logo.png. Near-black inks read as
  /// generic; this one belongs to the brand and costs nothing in contrast —
  /// 14.85:1 on white against #111111's 18.9:1, both far past AA.
  static const Color onSurface = Color(0xFF192937);
  static const Color onSurfaceVariant = Color(0xFF44505E);
  static const Color inkTertiary = Color(0xFF6B7280);

  // ── Status ───────────────────────────────────────────────────────────────
  // success was #16A34A (3.30:1) and warning #F59E0B (2.15:1). Both are fine
  // as fills but were used as text throughout the app.
  static const Color success = Color(0xFF15803D);
  static const Color successContainer = Color(0xFFDCFCE7);
  static const Color onSuccessContainer = Color(0xFF14532D);

  static const Color error = Color(0xFFDC2626);
  static const Color errorContainer = Color(0xFFFEE2E2);
  static const Color onErrorContainer = Color(0xFF7F1D1D);

  static const Color warning = Color(0xFF9A5B0A);
  static const Color warningContainer = Color(0xFFFEF3C7);
  static const Color onWarningContainer = Color(0xFF78350F);

  // `info` used to alias `primary`, so "information" and "brand" were the same
  // amber. Blue is what the screens actually reach for — #2563EB appears
  // hardcoded 32 times.
  static const Color info = Color(0xFF2563EB);
  static const Color infoContainer = Color(0xFFDBEAFE);
  static const Color onInfoContainer = Color(0xFF1E3A8A);

  // ── Slate ramp ───────────────────────────────────────────────────────────
  // A slate scale was already in use — 39 hardcoded occurrences across reports
  // and menus, competing with the ink scale. Declared so those literals have
  // somewhere legitimate to land.
  static const Color slate900 = Color(0xFF0F172A);
  static const Color slate800 = Color(0xFF1E293B);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate500 = Color(0xFF5B6675);
  static const Color slate200 = Color(0xFFE2E8F0);

  // ── Categorical ──────────────────────────────────────────────────────────
  // Charts and category chips only — never body text, never status. Chart
  // fills are exempt from the text contrast rule.
  static const Color catBlue = Color(0xFF2563EB);
  static const Color catViolet = Color(0xFF7C3AED);
  static const Color catEmerald = Color(0xFF059669);
  static const Color catOrange = Color(0xFFEA580C);
  static const Color catCyan = Color(0xFF0891B2);
  static const Color catPink = Color(0xFFDB2777);

  static BoxShadow get cardShadow => BoxShadow(
        color: const Color(0xFF000000).withValues(alpha: 0.04),
        blurRadius: 30,
        offset: const Offset(0, 10),
        spreadRadius: 0,
      );

  // ── Deprecated aliases ───────────────────────────────────────────────────
  // ~2,500 call sites reference these. They forward to the tokens above so the
  // app keeps compiling; migrate opportunistically rather than breaking the
  // build to tidy names.
  static const Color background = canvas;
  static const Color surface = canvas;
  static const Color inkPrimary = onSurface;
  static const Color inkSecondary = onSurfaceVariant;
  static const Color secondary = onSurfaceVariant;
  static const Color danger = error;
  static const Color accentSignature = primary;
}
