import 'package:flutter/material.dart';

// ─── Avatar colour cycling ────────────────────────────────────────────────────
Color avatarColor(String? name) {
  const palette = [
    Color(0xFFD97706),
    Color(0xFF92400E),
    Color(0xFF2563EB),
    Color(0xFF7C3AED),
    Color(0xFFB45309),
    Color(0xFF0891B2),
    Color(0xFF059669),
    Color(0xFFbe185d),
  ];
  if (name == null || name.isEmpty) return palette[0];
  return palette[name.codeUnitAt(0) % palette.length];
}

Color avatarBg(String? name) => avatarColor(name).withValues(alpha: 0.12);

String initials(String? name) {
  if (name == null || name.trim().isEmpty) return '?';
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  return parts[0][0].toUpperCase();
}

// ─── Compact amount formatter ─────────────────────────────────────────────────
String compactAmount(double v) {
  if (v >= 100000) return '₹${(v / 100000).toStringAsFixed(1)}L';
  if (v >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}K';
  return '₹${v.toStringAsFixed(0)}';
}
