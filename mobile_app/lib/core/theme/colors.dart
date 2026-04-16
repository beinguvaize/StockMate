import 'package:flutter/material.dart';

class AppColors {
  // Brand Palette
  static const Color canvas = Color(0xFFF5F5F0);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color inkPrimary = Color(0xFF111111);
  static const Color inkSecondary = Color(0xFF4A4A4A);
  static const Color inkTertiary = Color(0xFF6B7280);
  
  // Signature Accent
  static const Color accentSignature = Color(0xFFC8F135);
  static const Color accentSignatureHover = Color(0xFFB8E224);
  
  // Semantic
  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
  static const Color info = Color(0xFF3B82F6);
  
  // Glassmorphism
  static const Color glassBackground = Color(0xB3FFFFFF); // 70% white
  static const Color glassBorder = Color(0x4DFFFFFF); // 30% white
  
  // Gradients
  static const LinearGradient premiumGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Color(0xFFF5F5F0),
      Color(0xFFEBEBE6),
    ],
  );
  
  static const LinearGradient signatureGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [
      accentSignature,
      accentSignatureHover,
    ],
  );
}
