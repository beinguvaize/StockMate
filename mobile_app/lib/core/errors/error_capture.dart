// The one call a screen makes when a save fails: classify, stamp, log, send.
//
//   final report = await captureError(e, stack,
//       screen: 'Collect Payment', action: 'Record payment', ...);
//
// The full error is always printed to the debug log first: a card is not a
// reason to swallow it.

import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'package:mobile_app/core/errors/error_codes.dart';
import 'package:mobile_app/core/errors/error_report.dart';
import 'package:mobile_app/core/errors/error_reporter.dart';

Future<String>? _version;

/// "1.7.36 (154)", read once. "unknown" if the platform will not say.
Future<String> appVersionLabel() => _version ??= () async {
      try {
        final i = await PackageInfo.fromPlatform();
        return '${i.version} (${i.buildNumber})';
      } catch (_) {
        return 'unknown';
      }
    }();

String _platform() {
  try {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return Platform.operatingSystem;
  } catch (_) {
    return 'unknown';
  }
}

Future<ErrorReport> captureError(
  Object error,
  StackTrace? stack, {
  required String screen,
  required String action,
  required String? tenantId,
  String? userId,
  bool sent = true,
  bool earlierWriteSucceeded = false,
  bool printOrShare = false,
  ErrorResult? result,
  ErrorReporter? reporter,
}) async {
  final r = result ??
      classifyError(error,
          sent: sent,
          earlierWriteSucceeded: earlierWriteSucceeded,
          printOrShare: printOrShare);
  final report = ErrorReport(
    result: r,
    reference: newReference(),
    at: DateTime.now(),
    screen: screen,
    action: action,
    appVersion: await appVersionLabel(),
    platform: _platform(),
    tenantId: tenantId,
    userId: userId,
    raw: error.toString(),
  );
  debugPrint('[error ${r.chip} ${report.reference}] $screen / $action: '
      '$error${stack == null ? '' : '\n$stack'}');
  (reporter ?? ErrorReporter.instance).report(report);
  return report;
}
