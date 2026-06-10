import 'package:flutter/material.dart';

class AppColors {
  // LedgrPro — amber design system, matched to web app (src/index.css tokens)
  // accent #D97706 / hover #B45309 · canvas #FFFFFF · ink #111/#444/#6B7280

  // Brand / accent
  static const Color primary = Color(0xFFD97706); // accent-signature
  static const Color primaryHover = Color(0xFFB45309); // accent-signature-hover
  static const Color primaryContainer = Color(0xFFFDE68A); // amber-200 (deeper, less washed)
  static const Color primaryMuted = Color(0xFFFCD34D); // amber-300
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onPrimaryContainer = Color(0xFF92400E); // amber-800
  static const Color accentSignature = Color(0xFFD97706);

  // Neutrals
  static const Color secondary = Color(0xFF444444);
  static const Color secondaryContainer = Color(0xFFF3F4F6);
  static const Color background = Color(0xFFFFFFFF); // canvas
  static const Color canvas = Color(0xFFFFFFFF);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceContainer = Color(0xFFF9F9F9); // surface
  static const Color outline = Color(0xFFD1D5DB);
  static const Color outlineVariant = Color(0xFFE5E7EB);

  // Ink
  static const Color onSurface = Color(0xFF111111);
  static const Color onSurfaceVariant = Color(0xFF444444);
  static const Color inkPrimary = Color(0xFF111111);
  static const Color inkSecondary = Color(0xFF444444);
  static const Color inkTertiary = Color(0xFF6B7280);

  // Status
  static const Color success = Color(0xFF16A34A);
  static const Color error = Color(0xFFDC2626);
  static const Color errorContainer = Color(0xFFFEE2E2);
  static const Color danger = Color(0xFFDC2626);
  static const Color info = Color(0xFFD97706);
  static const Color warning = Color(0xFFF59E0B);

  static BoxShadow get cardShadow => BoxShadow(
        color: const Color(0xFF000000).withValues(alpha: 0.04),
        blurRadius: 30,
        offset: const Offset(0, 10),
        spreadRadius: 0,
      );
}
