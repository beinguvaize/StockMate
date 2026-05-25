/// Auto-updater — polls GitHub Releases for newer APK, prompts user,
/// downloads + triggers Android installer.
///
/// Lifecycle:
///   1. checkForUpdate()  — fetch latest release, compare versions.
///   2. promptIfNewer()   — show dialog if newer found.
///   3. install()         — download via ota_update, OS installer fires.
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:ota_update/ota_update.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// GitHub repo to poll. Releases must publish an asset whose name ends
/// in `.apk` (release.yml does this on tag push).
const _githubRepo = 'beinguvaize/StockMate';

class _ReleaseInfo {
  final String version;       // e.g. "1.0.7"
  final String apkUrl;        // direct download URL of the .apk asset
  final String releaseNotes;  // optional changelog body
  _ReleaseInfo({required this.version, required this.apkUrl, required this.releaseNotes});
}

class AutoUpdater {
  static final AutoUpdater instance = AutoUpdater._();
  AutoUpdater._();

  bool _checking = false;

  /// Check GitHub for a newer release. Pure read — safe to call on app start.
  Future<_ReleaseInfo?> _fetchLatest() async {
    final res = await http
        .get(Uri.parse('https://api.github.com/repos/$_githubRepo/releases/latest'),
            headers: {'Accept': 'application/vnd.github+json'})
        .timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) return null;

    // Parse without dart:convert dependency on the caller — release JSON is
    // small + we only need a few fields.
    final body = res.body;
    final tagMatch  = RegExp(r'"tag_name"\s*:\s*"([^"]+)"').firstMatch(body);
    if (tagMatch == null) return null;
    final notesMatch = RegExp(r'"body"\s*:\s*"((?:[^"\\]|\\.)*)"').firstMatch(body);

    // First .apk asset in the assets array
    final apkMatch = RegExp(r'"browser_download_url"\s*:\s*"([^"]+\.apk)"').firstMatch(body);
    if (apkMatch == null) return null;

    return _ReleaseInfo(
      version: tagMatch.group(1)!.replaceFirst(RegExp(r'^v'), ''),
      apkUrl: apkMatch.group(1)!,
      releaseNotes: (notesMatch?.group(1) ?? '').replaceAll(r'\n', '\n').replaceAll(r'\"', '"'),
    );
  }

  /// True iff `latest` is strictly greater than `current` (semver, naive).
  bool _isNewer(String current, String latest) {
    int parse(String s) {
      final parts = s.split('.').map((p) => int.tryParse(p.replaceAll(RegExp(r'\D'), '')) ?? 0).toList();
      while (parts.length < 3) parts.add(0);
      return parts[0] * 1000000 + parts[1] * 1000 + parts[2];
    }
    return parse(latest) > parse(current);
  }

  /// Main entry — called from app start.
  /// Shows a dialog if a newer release is available.
  Future<void> checkForUpdate(BuildContext context) async {
    if (_checking || !Platform.isAndroid) return;
    _checking = true;
    try {
      final info    = await PackageInfo.fromPlatform();
      final release = await _fetchLatest();
      if (release == null) return;
      if (!_isNewer(info.version, release.version)) return;
      if (!context.mounted) return;
      await _showDialog(context, current: info.version, release: release);
    } catch (e) {
      debugPrint('[autoUpdater] check failed: $e');
    } finally {
      _checking = false;
    }
  }

  Future<void> _showDialog(BuildContext context, {required String current, required _ReleaseInfo release}) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        title: const Text('Update available'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('New version ${release.version} is available\n(you have $current).'),
            if (release.releaseNotes.trim().isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(release.releaseNotes.trim(),
                  style: const TextStyle(fontSize: 12, color: Colors.black54)),
            ],
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Later')),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              _install(context, release.apkUrl);
            },
            child: const Text('Update now'),
          ),
        ],
      ),
    );
  }

  /// Stream download + trigger Android installer.
  void _install(BuildContext context, String apkUrl) {
    final progress = ValueNotifier<double>(0);
    final stateMsg = ValueNotifier<String>('Starting download…');

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Downloading update'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ValueListenableBuilder(
              valueListenable: progress,
              builder: (_, v, __) => LinearProgressIndicator(value: v == 0 ? null : v),
            ),
            const SizedBox(height: 12),
            ValueListenableBuilder(
              valueListenable: stateMsg,
              builder: (_, m, __) => Text(m, style: const TextStyle(fontSize: 12)),
            ),
          ],
        ),
      ),
    );

    try {
      OtaUpdate().execute(apkUrl, destinationFilename: 'StockMate-update.apk').listen(
        (event) {
          switch (event.status) {
            case OtaStatus.DOWNLOADING:
              final pct = double.tryParse(event.value ?? '0') ?? 0;
              progress.value = pct / 100;
              stateMsg.value = 'Downloading ${pct.toStringAsFixed(0)}%';
              break;
            case OtaStatus.INSTALLING:
              stateMsg.value = 'Launching installer…';
              break;
            case OtaStatus.ALREADY_RUNNING_ERROR:
              stateMsg.value = 'Update already in progress.';
              break;
            case OtaStatus.PERMISSION_NOT_GRANTED_ERROR:
              stateMsg.value = 'Permission denied. Enable "Install unknown apps" in Settings.';
              break;
            case OtaStatus.INTERNAL_ERROR:
            case OtaStatus.DOWNLOAD_ERROR:
            case OtaStatus.CHECKSUM_ERROR:
            case OtaStatus.INSTALLATION_ERROR:
              stateMsg.value = 'Update failed: ${event.value ?? 'unknown error'}';
              break;
            case OtaStatus.INSTALLATION_DONE:
              stateMsg.value = 'Install complete.';
              break;
            default:
              stateMsg.value = 'Update cancelled.';
              break;
          }
        },
        onError: (e) => stateMsg.value = 'Update failed: $e',
      );
    } catch (e) {
      stateMsg.value = 'Update failed: $e';
    }
  }
}
