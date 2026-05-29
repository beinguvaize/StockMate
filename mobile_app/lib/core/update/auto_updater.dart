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
  final String apkUrl;        // direct download URL of the .apk asset (empty = pending)
  final String releaseNotes;  // optional changelog body
  _ReleaseInfo({required this.version, required this.apkUrl, required this.releaseNotes});
  factory _ReleaseInfo.noAsset() => _ReleaseInfo(version: '', apkUrl: '', releaseNotes: '');
}

class AutoUpdater {
  static final AutoUpdater instance = AutoUpdater._();
  AutoUpdater._();

  bool _checking = false;

  /// Check GitHub for a newer mobile release. Pure read — safe to call on
  /// app start.
  ///
  /// We don't use /releases/latest because the repo publishes both desktop
  /// (`desktop-v*`) and mobile (`mobile-v*`) releases. /latest returns
  /// whichever tag was pushed most recently, so a desktop drop would make
  /// the mobile auto-updater pick a release that has only a .dmg asset and
  /// surface "being prepared" forever. Instead we list recent releases and
  /// pick the newest one whose tag matches our platform prefix.
  Future<_ReleaseInfo?> _fetchLatest() async {
    final res = await http
        .get(Uri.parse('https://api.github.com/repos/$_githubRepo/releases?per_page=20'),
            headers: {'Accept': 'application/vnd.github+json'})
        .timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) return null;

    final body = res.body;
    // Split the array into individual release objects on the }, { boundary.
    // Cheaper than pulling in dart:convert + a JSON model.
    final releases = body.split(RegExp(r'\}\s*,\s*\{'));
    for (final raw in releases) {
      // Mobile releases only — keeps desktop tags (desktop-v*) out.
      final tagMatch = RegExp(r'"tag_name"\s*:\s*"(mobile-[^"]+)"').firstMatch(raw);
      if (tagMatch == null) continue;
      final notesMatch = RegExp(r'"body"\s*:\s*"((?:[^"\\]|\\.)*)"').firstMatch(raw);
      final apkMatch   = RegExp(r'"browser_download_url"\s*:\s*"([^"]+\.apk)"').firstMatch(raw);

      final version = tagMatch.group(1)!
          .replaceFirst(RegExp(r'^mobile-'), '')
          .replaceFirst(RegExp(r'^v'), '');
      final notes = (notesMatch?.group(1) ?? '')
          .replaceAll(r'\n', '\n').replaceAll(r'\"', '"');

      return _ReleaseInfo(
        version: version,
        apkUrl: apkMatch?.group(1) ?? '',
        releaseNotes: notes,
      );
    }
    return _ReleaseInfo.noAsset();
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

  /// Main entry. Called silently from app launch (verbose=false) and
  /// from the "Check for Updates" button in Settings (verbose=true).
  /// In verbose mode the user always sees a toast describing the result.
  Future<void> checkForUpdate(BuildContext context, {bool verbose = false}) async {
    if (_checking) return;
    if (!Platform.isAndroid) {
      if (verbose) _toast(context, 'Auto-update is Android-only for now.');
      return;
    }
    _checking = true;
    if (verbose) _toast(context, 'Checking for updates…');
    try {
      final info    = await PackageInfo.fromPlatform();
      final release = await _fetchLatest();
      if (release == null) {
        if (verbose && context.mounted) {
          _toast(context, 'Could not reach GitHub. Try again later.');
        }
        return;
      }
      if (release.apkUrl.isEmpty) {
        if (verbose && context.mounted) {
          _toast(context, release.version.isEmpty
              ? 'Could not reach GitHub. Try again later.'
              : 'Update v${release.version} is being prepared. Try again in a minute.');
        }
        return;
      }
      if (!_isNewer(info.version, release.version)) {
        if (verbose && context.mounted) {
          _toast(context, 'You’re on the latest version (v${info.version}).');
        }
        return;
      }
      if (!context.mounted) return;
      await _showDialog(context, current: info.version, release: release);
    } catch (e) {
      debugPrint('[autoUpdater] check failed: $e');
      if (verbose && context.mounted) {
        _toast(context, 'Update check failed: $e');
      }
    } finally {
      _checking = false;
    }
  }

  void _toast(BuildContext context, String msg) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
    );
  }

  // Strip github-flavored markdown (#, **, _, `) so the AlertDialog Text
  // widget shows readable copy instead of literal symbols. Cheap
  // alternative to pulling in flutter_markdown.
  String _plain(String s) => s
      .replaceAll(RegExp(r'^#+\s*', multiLine: true), '')
      .replaceAll(RegExp(r'\*\*([^*]+)\*\*'), r'$1')
      .replaceAll(RegExp(r'\*([^*]+)\*'), r'$1')
      .replaceAll(RegExp(r'`([^`]+)`'), r'$1')
      .replaceAll(RegExp(r'_([^_]+)_'), r'$1');

  // GitHub tag may include a product prefix (e.g. "mobile-v1.3.3").
  // Display the bare semver to the user.
  String _displayVersion(String raw) {
    final m = RegExp(r'(\d+\.\d+\.\d+)').firstMatch(raw);
    return m?.group(1) ?? raw;
  }

  Future<void> _showDialog(BuildContext context, {required String current, required _ReleaseInfo release}) async {
    final notes = _plain(release.releaseNotes).trim();
    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        title: const Text('Update available'),
        content: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(ctx).size.height * 0.5,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('New version ${_displayVersion(release.version)} is available\n(you have $current).'),
                if (notes.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(notes,
                      style: const TextStyle(fontSize: 12, color: Colors.black54)),
                ],
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade50,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'If install does not start, enable "Install unknown apps" for LedgrPro in Android Settings.',
                    style: TextStyle(fontSize: 11, color: Colors.black87),
                  ),
                ),
              ],
            ),
          ),
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
