import 'package:flutter/material.dart';

const agingBuckets = ['CURRENT', '1-30', '31-60', '61-90', '91-120', '120+'];

int daysBetween(DateTime dueDate) => DateTime.now().difference(dueDate).inDays;

String getAgingBucket(int daysOverdue) {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  if (daysOverdue <= 120) return '91-120';
  return '120+';
}

Color agingBucketColor(String bucket) => switch (bucket) {
  'CURRENT'  => const Color(0xFF16A34A),
  '1-30'     => const Color(0xFFF59E0B),
  '31-60'    => const Color(0xFFEA580C),
  '61-90'    => const Color(0xFFDC2626),
  '91-120'   => const Color(0xFF991B1B),
  _          => const Color(0xFF450A0A), // 120+
};

double round2(num v) => (v * 100).roundToDouble() / 100;

/// Indian number format: ₹1,23,45,678
String formatINR(num v) {
  final n = v.abs().toStringAsFixed(2);
  final parts = n.split('.');
  var intPart = parts[0];
  final dec = parts[1];
  if (intPart.length <= 3) return '₹${v < 0 ? '-' : ''}$intPart.$dec';
  final last3 = intPart.substring(intPart.length - 3);
  intPart = intPart.substring(0, intPart.length - 3);
  final groups = <String>[];
  while (intPart.length > 2) {
    groups.insert(0, intPart.substring(intPart.length - 2));
    intPart = intPart.substring(0, intPart.length - 2);
  }
  if (intPart.isNotEmpty) groups.insert(0, intPart);
  return '₹${v < 0 ? '-' : ''}${groups.join(',')},$last3.$dec';
}

/// Compact: ₹1.2Cr / ₹45L / ₹1.2K
String compactINR(num v) {
  final abs = v.abs();
  if (abs >= 1e7) return '₹${(v/1e7).toStringAsFixed(1)}Cr';
  if (abs >= 1e5) return '₹${(v/1e5).toStringAsFixed(1)}L';
  if (abs >= 1e3) return '₹${(v/1e3).toStringAsFixed(1)}K';
  return '₹${v.toStringAsFixed(0)}';
}
