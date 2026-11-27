// One shown error, as support sees it: code, reference, time, action, app
// version, shop id and the raw error with tokens scrubbed out. The card's
// Details sheet and "Copy for support" read this; ErrorReporter sends it.
//
// Never carried here: shop name, client name, amounts, phone numbers or what
// was typed. The raw error is scrubbed before it is shown, copied or stored.

import 'dart:math';

import 'package:mobile_app/core/errors/error_codes.dart';

/// No 0/O/1/I, so a reference read aloud over the phone cannot be misheard.
const kReferenceAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

final Random _rng = _secureOrNot();
Random _secureOrNot() {
  try {
    return Random.secure();
  } catch (_) {
    return Random();
  }
}

/// A short reference made on the phone at the moment of failure, so it exists
/// offline. 8 characters from [kReferenceAlphabet]: 32^8 ≈ 10^12.
String newReference([Random? rng]) {
  final r = rng ?? _rng;
  return List.generate(
      8, (_) => kReferenceAlphabet[r.nextInt(kReferenceAlphabet.length)]).join();
}

final RegExp kReferencePattern = RegExp(r'^[2-9A-HJ-NP-Z]{8}$');

/// Strip anything secret or personal from a raw error before it is shown,
/// copied or stored: JWTs, API keys, Authorization / Bearer values, token
/// query parameters, long digit runs (phone numbers), rupee amounts and the
/// values Postgres echoes back in "Key (col)=(value)".
String scrubRaw(String raw, {int maxLength = 4000}) {
  var s = raw;
  s = s.replaceAll(
      RegExp(r'eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*'), '<jwt>');
  s = s.replaceAllMapped(
      RegExp(r'(authorization)(["\x27]?\s*[:=]\s*["\x27]?)(bearer\s+)?[^\s,"\x27)}]+',
          caseSensitive: false),
      (m) => '${m[1]}${m[2]}<redacted>');
  s = s.replaceAll(
      RegExp(r'bearer\s+[A-Za-z0-9._~+/=-]+', caseSensitive: false), 'Bearer <redacted>');
  s = s.replaceAllMapped(
      RegExp(r'(apikey|api_key|x-api-key|access_token|refresh_token|token|password|secret)(["\x27]?\s*[:=]\s*["\x27]?)[^\s&,"\x27)}]+',
          caseSensitive: false),
      (m) => '${m[1]}${m[2]}<redacted>');
  s = s.replaceAll(RegExp(r'sb_(secret|publishable)_[A-Za-z0-9_-]+'), '<key>');
  s = s.replaceAllMapped(
      RegExp(r'Key \(([^)]*)\)=\([^)]*\)'), (m) => 'Key (${m[1]})=(<value>)');
  s = s.replaceAll(RegExp(r'(₹|Rs\.?|INR)\s?[\d,]+(\.\d+)?', caseSensitive: false), '<amount>');
  // Phone numbers: +91 98765 43210, 9876543210. Not ids: a digit run glued to
  // a letter or hyphen (CP-1732700000000, a uuid) is left alone.
  s = s.replaceAll(RegExp(r'\+\d{1,3}[\s-]?\d{4,5}[\s-]?\d{5}'), '<number>');
  s = s.replaceAll(RegExp(r'(?<![\w-])\d{10,13}(?![\w-])'), '<number>');
  if (s.length > maxLength) s = '${s.substring(0, maxLength)}…';
  return s;
}

class ErrorReport {
  final ErrorResult result;
  final String reference;

  /// When it failed, in UTC.
  final DateTime at;

  /// Screen, then what was being done: "Collect Payment / Record payment".
  final String screen;
  final String action;

  /// "1.7.36 (154)"
  final String appVersion;

  /// "android" / "ios"
  final String platform;
  final String? tenantId;
  final String? userId;

  /// Already scrubbed.
  final String raw;

  ErrorReport({
    required this.result,
    required this.reference,
    required DateTime at,
    required this.screen,
    required this.action,
    required this.appVersion,
    required this.platform,
    required this.tenantId,
    required this.userId,
    required String raw,
  })  : at = at.toUtc(),
        raw = scrubRaw(raw);

  String get actionLabel => '$screen / $action';

  /// "3f9c2a71…8a15": on screen only; the copy has the full id.
  String get shortShopId {
    final t = tenantId;
    if (t == null || t.isEmpty) return 'Unknown';
    if (t.length <= 12) return t;
    return '${t.substring(0, 8)}…${t.substring(t.length - 4)}';
  }

  String get timeIst => formatIst(at);

  /// Exactly what "Copy for support" puts on the clipboard.
  String copyText() => [
        'bookledger error ${result.chip} · ${result.outcome.label}',
        'Reference: $reference',
        'Time: $timeIst',
        'Action: $actionLabel',
        'App: phone $appVersion',
        'Shop id: ${tenantId ?? 'unknown'}',
        'Raw: $raw',
      ].join('\n');

  /// The row for platform_error_logs (see the 20261127 migration).
  Map<String, dynamic> toRow() => {
        'tenant_id': tenantId,
        'user_id': userId,
        'module': screen,
        'action': action,
        'error_code': result.chip,
        'error_message': raw,
        'severity': result.outcome == ErrorOutcome.mayHaveSaved ? 'High' : 'Medium',
        'reference_id': reference,
        'outcome': result.outcome.wire,
        'platform': 'phone-$platform',
        'app_version': appVersion,
        'occurred_at': at.toIso8601String(),
      };
}

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// "27 Nov 2026, 3:42 pm IST", whatever the phone's own time zone is.
String formatIst(DateTime t) {
  final i = t.toUtc().add(const Duration(hours: 5, minutes: 30));
  final h = i.hour % 12 == 0 ? 12 : i.hour % 12;
  final mm = i.minute.toString().padLeft(2, '0');
  return '${i.day} ${_months[i.month - 1]} ${i.year}, $h:$mm ${i.hour < 12 ? 'am' : 'pm'} IST';
}
