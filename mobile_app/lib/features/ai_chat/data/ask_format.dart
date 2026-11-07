// Draws the values in an ai-ask card. No figure is worked out here: the server
// sends the numbers and the sentences, and this only formats them for a `kind`.
//
// Dart side of src/lib/askFormat.js, held to shared/fixtures/ai_chat/format.json.
// Digits stay Western in both languages.

/// A decimal string for [v], rounded half away from zero at [places], from the
/// number's shortest form ("999.995", not its binary neighbour), as JS
/// Intl.NumberFormat does.
String _round(num v, int places) {
  var s = v.abs().toString();
  if (s.contains('e') || s.contains('E')) s = v.abs().toStringAsFixed(20);
  final dot = s.indexOf('.');
  var whole = dot < 0 ? s : s.substring(0, dot);
  var frac = dot < 0 ? '' : s.substring(dot + 1);
  if (frac.length <= places) return '$whole.${frac.padRight(places, '0')}';
  final up = frac.codeUnitAt(places) >= 0x35; // '5'
  final digits = (whole + frac.substring(0, places)).split('').map(int.parse).toList();
  if (up) {
    var i = digits.length - 1;
    while (i >= 0) {
      if (digits[i] == 9) {
        digits[i] = 0;
        i--;
      } else {
        digits[i]++;
        break;
      }
    }
    if (i < 0) digits.insert(0, 1);
  }
  final all = digits.join();
  whole = all.substring(0, all.length - places);
  frac = all.substring(all.length - places);
  return places == 0 ? whole : '$whole.$frac';
}

/// 12,34,567: the last three digits, then pairs.
String _groupIndian(String whole) {
  if (whole.length <= 3) return whole;
  final last = whole.substring(whole.length - 3);
  var rest = whole.substring(0, whole.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  return '${groups.join(',')},$last';
}

num? _number(Object? v) {
  if (v is num) return v;
  return num.tryParse('${v ?? ''}');
}

String _fixed(num v, int places, {bool trim = false}) {
  var s = _round(v, places);
  final parts = s.split('.');
  var frac = parts.length > 1 ? parts[1] : '';
  if (trim) frac = frac.replaceFirst(RegExp(r'0+$'), '');
  final whole = _groupIndian(parts[0]);
  final isZero = !RegExp('[1-9]').hasMatch(whole + frac);
  final sign = v < 0 && !isZero ? '-' : '';
  return '$sign$whole${frac.isEmpty ? '' : '.$frac'}';
}

/// ₹12,34,567.50 and -₹4,200.00.
String askMoney(Object? n) {
  final v = _number(n) ?? 0;
  final body = _fixed(v.abs(), 2);
  return '${v < 0 && body != '0.00' ? '-' : ''}₹$body';
}

String askFill(String? template, Map<String, Object?> vars) =>
    (template ?? '').replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) => '${vars[m[1]] ?? ''}');

/// "18 Nov" or "18 नवंबर".
String askDayMonth(Object? iso, Map<String, dynamic> strings) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch('${iso ?? ''}');
  if (m == null) return '';
  final month = int.parse(m[2]!);
  if (month < 1 || month > 12) return '';
  return '${int.parse(m[3]!)} ${(strings['months_short'] as List)[month - 1]}';
}

String askFormatValue(Object? value, String? kind, Map<String, dynamic> strings) {
  if (value == null) return '—';
  switch (kind) {
    case 'money':
      return askMoney(value);
    case 'count':
    case 'qty':
    case 'days':
      final n = _number(value);
      return n == null ? '$value' : _fixed(n, 3, trim: true);
    case 'percent':
      final n = _number(value);
      return n == null ? '$value' : '${n.toStringAsFixed(1)}%';
    case 'date':
      return askDayMonth(value, strings);
    default:
      // An unknown kind draws as plain text.
      if (value is double && value == value.truncateToDouble()) return '${value.toInt()}';
      return '$value';
  }
}

/// The month a quota window covers (the one before it resets) and the reset day.
Map<String, Object?> askUsageVars(Map<String, dynamic>? usage, Map<String, dynamic> strings) {
  final m = RegExp(r'^\d{4}-(\d{2})').firstMatch('${usage?['resets_on'] ?? ''}');
  if (m == null) return {'used': usage?['used'], 'limit': usage?['limit'], 'month': '', 'reset': ''};
  final month = int.parse(m[1]!);
  return {
    'used': usage!['used'],
    'limit': usage['limit'],
    'month': (strings['months_long'] as List)[(month + 10) % 12],
    'reset': askDayMonth(usage['resets_on'], strings),
  };
}

/// Text split so money and percentages can be set in the number style.
List<({String part, bool number})> askSplitNumbers(String? text) {
  final out = <({String part, bool number})>[];
  final s = text ?? '';
  var at = 0;
  for (final m in RegExp(r'₹[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%').allMatches(s)) {
    out.add((part: s.substring(at, m.start), number: false));
    out.add((part: m[0]!, number: true));
    at = m.end;
  }
  out.add((part: s.substring(at), number: false));
  return out;
}
