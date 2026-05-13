import 'package:flutter/material.dart';

class AppColors {
  // Lumina Finance / Business Management Suite — design system tokens
  static const Color primary = Color(0xFF446900);
  static const Color primaryContainer = Color(0xFFa3e635);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onPrimaryContainer = Color(0xFF416400);
  static const Color secondary = Color(0xFF48654d);
  static const Color secondaryContainer = Color(0xFFc9ebcc);
  static const Color background = Color(0xFFfcf9f8);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceContainer = Color(0xFFf0edec);
  static const Color onSurface = Color(0xFF1c1b1b);
  static const Color onSurfaceVariant = Color(0xFF424936);
  static const Color outline = Color(0xFF727a64);
  static const Color outlineVariant = Color(0xFFc2cab0);
  static const Color error = Color(0xFFba1a1a);
  static const Color errorContainer = Color(0xFFffdad6);
  static const Color success = Color(0xFF48654d);
  static const Color inkPrimary = Color(0xFF1c1b1b);
  static const Color inkSecondary = Color(0xFF424936);
  static const Color inkTertiary = Color(0xFF727a64);
  static const Color accentSignature = Color(0xFFa3e635);
  static const Color canvas = Color(0xFFfcf9f8);
  static const Color danger = Color(0xFFba1a1a);
  static const Color info = Color(0xFF446900);
  static const Color warning = Color(0xFFe6a817);

  static BoxShadow get cardShadow => BoxShadow(
        color: const Color(0xFF000000).withValues(alpha: 0.04),
        blurRadius: 30,
        offset: const Offset(0, 10),
        spreadRadius: 0,
      );
}
