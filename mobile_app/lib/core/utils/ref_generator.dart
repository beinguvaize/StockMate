import 'dart:math';

/// Generates a short unique reference like 'CRN-A3X9R2'
String generateRef(String prefix) {
  final now = DateTime.now().millisecondsSinceEpoch;
  final timeStr = now.toRadixString(36).toUpperCase();
  final t = timeStr.substring(timeStr.length >= 4 ? timeStr.length - 4 : 0);
  final rand = (Random().nextInt(1295) + 1000).toRadixString(36).toUpperCase().padLeft(2, '0').substring(0, 2);
  return '$prefix-${t + rand}';
}
