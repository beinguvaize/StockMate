/// Auto-updater — polls GitHub Releases for newer APK, prompts user,
/// downloads + triggers Android installer.
///
/// Lifecycle:
///   1. checkForUpdate()  — fetch latest release, compare versions.
///   2. promptIfNewer()   — show dialog if newer found.
///   3. install()         — download via ota_update, OS installer fires.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:ota_update/ota_update.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// GitHub repo to poll. Releases must publish an asset whose name ends
/// in `.apk` (release.yml does this on tag push).
const _githubRepo = 'beinguvaize/StockMate';

class ReleaseInfo {
  final String version;       // e.g. "1.0.7"
  final String apkUrl;        // direct download URL of the .apk asset (empty = pending)
  final String releaseNotes;  // optional changelog body
  ReleaseInfo({required this.version, required this.apkUrl, required this.releaseNotes});
  factory ReleaseInfo.noAsset() => ReleaseInfo(version: '', apkUrl: '', releaseNotes: '');
}

/// Pick the newest mobile release out of GitHub's /releases response.
///
/// This used to split the raw body on the `},{` between release objects and
/// then regex the tag and the download URL out of each fragment. Assets are
/// NESTED objects, so that boundary also falls inside a release — the tag and
/// its APK could land in different fragments, and the URL would come back
/// empty. The code's own comment says an empty URL surfaces "being prepared"
/// forever, so the failure is a silent, permanent non-update rather than a
/// crash. It happened to hold for every release so far, which is the worst
/// property a parser can have.
///
/// dart:convert is in the SDK — the "cheaper than pulling in dart:convert"
/// note it replaces was weighing a dependency that costs nothing.
///
/// Returns null when the payload is not what we expect, so a bad response
/// leaves the app alone instead of throwing on startup.
@visibleForTesting
ReleaseInfo? parseMobileRelease(String body) {
  late final List<dynamic> releases;
  try {
    final decoded = jsonDecode(body);
    if (decoded is! List) return null;
    releases = decoded;
  } catch (_) {
    return null;   // truncated body, an error object, HTML from a proxy
  }

  for (final entry in releases) {
    if (entry is! Map) continue;
    final tag = entry['tag_name'];
    // Mobile only: desktop ships as `v*` and versions independently, so a
    // desktop tag would read as a downgrade against an installed 1.7.x.
    if (tag is! String || !tag.startsWith('mobile-')) continue;
    // A draft is not published — offering it would 404 on download.
    if (entry['draft'] == true) continue;
    // Prereleases are NOT skipped: every mobile release is one, deliberately,
    // so that /releases/latest keeps resolving to a desktop tag.

    final assets = entry['assets'];
    String apkUrl = '';
    if (assets is List) {
      for (final a in assets) {
        if (a is! Map) continue;
        final url = a['browser_download_url'];
        if (url is String && url.toLowerCase().endsWith('.apk')) { apkUrl = url; break; }
      }
    }

    return ReleaseInfo(
      version: tag.replaceFirst(RegExp(r'^mobile-'), '').replaceFirst(RegExp(r'^v'), ''),
      apkUrl: apkUrl,
      releaseNotes: entry['body'] is String ? entry['body'] as String : '',
    );
  }
  return null;
}

class AutoUpdater {
  static final AutoUpdater instance = AutoUpdater._();
  AutoUpdater._();

  bool _checking = false;

  /// Check GitHub for a newer mobile release. Pure read — safe to call on
  /// app start.
  ///
  /// We don't use /releases/latest because the repo publishes both desktop
  /// (`v*` — not `desktop-v*`, despite what this comment said until Aug 2026)
  /// and mobile (`mobile-v*`) releases. /latest returns
  /// whichever tag was pushed most recently, so a desktop drop would make
  /// the mobile auto-updater pick a release that has only a .dmg asset and
  /// surface "being prepared" forever. Instead we list recent releases and
  /// pick the newest one whose tag matches our platform prefix.
  ///
  /// The version is taken FROM THE TAG, which is why this cannot simply follow
  /// `v*`: desktop and mobile version independently, so a `v1.6.16` release
  /// would read as a downgrade against an installed 1.7.8.
  Future<ReleaseInfo?> _fetchLatest() async {
    final res = await http
        .get(Uri.parse('https://api.github.com/repos/$_githubRepo/releases?per_page=20'),
            headers: {'Accept': 'application/vnd.github+json'})
        .timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) return null;

    return parseMobileRelease(res.body);
  }

  // ── "Later" snooze ─────────────────────────────────────────────────────────
  // Tapping Later used to be forgotten instantly, so the launch check
  // re-prompted on every single app open — the dialog felt like it "always"
  // showed. Remember the declined version for a day. A NEWER version still
  // prompts immediately, and the manual Settings check (verbose) always shows.
  static const _snoozeVerKey   = 'update_snooze_version';
  static const _snoozeUntilKey = 'update_snooze_until';
  static const _snoozeFor      = Duration(hours: 24);
  static const _store = FlutterSecureStorage();

  Future<void> _snooze(String version) async {
    try {
      await _store.write(key: _snoozeVerKey, value: version);
      await _store.write(
          key: _snoozeUntilKey,
          value: DateTime.now().add(_snoozeFor).toIso8601String());
    } catch (e) {
      debugPrint('[autoUpdater] snooze write failed: $e');
    }
  }

  Future<bool> _isSnoozed(String version) async {
    try {
      if (await _store.read(key: _snoozeVerKey) != version) return false;
      final until = DateTime.tryParse(
          await _store.read(key: _snoozeUntilKey) ?? '');
      return until != null && DateTime.now().isBefore(until);
    } catch (e) {
      debugPrint('[autoUpdater] snooze read failed: $e');
      return false; // never block the prompt on a storage error
    }
  }

  /// True iff `latest` is strictly greater than `current` (semver, naive).
  ///
  /// Numeric on purpose. A string compare would read "1.7.10" as OLDER than
  /// "1.7.9" — the first release to go double-digit would stop offering
  /// itself, on every phone, silently.
  @visibleForTesting
  bool isNewer(String current, String latest) => _isNewer(current, latest);

  bool _isNewer(String current, String latest) {
    int parse(String s) {
      final parts = s.split('.').map((p) => int.tryParse(p.replaceAll(RegExp(r'\D'), '')) ?? 0).toList();
      while (parts.length < 3) {
        parts.add(0);
      }
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
      // Respect a recent "Later" on this same version for the silent launch
      // check. A manual check (verbose) always shows the dialog.
      if (!verbose && await _isSnoozed(release.version)) {
        debugPrint('[autoUpdater] v${release.version} snoozed — not prompting');
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
  // NOTE: replaceAll does NOT expand `$1` — it inserts the literal text, so
  // every **bold** heading rendered as "$1" in the update dialog. Group
  // backreferences need replaceAllMapped.
  String _plain(String s) => s
      .replaceAll(RegExp(r'^#+\s*', multiLine: true), '')
      .replaceAllMapped(RegExp(r'\*\*([^*]+)\*\*'), (m) => m[1]!)
      .replaceAllMapped(RegExp(r'\*([^*]+)\*'), (m) => m[1]!)
      .replaceAllMapped(RegExp(r'`([^`]+)`'), (m) => m[1]!)
      .replaceAllMapped(RegExp(r'_([^_]+)_'), (m) => m[1]!)
      // Drop the trailing "🤖 Generated with [Claude Code](url)" footer and
      // collapse any leftover markdown links to their label.
      .replaceAll(RegExp(r'\n*🤖 Generated with .*$', dotAll: true), '')
      .replaceAllMapped(RegExp(r'\[([^\]]+)\]\([^)]*\)'), (m) => m[1]!)
      .trim();

  // GitHub tag may include a product prefix (e.g. "mobile-v1.3.3").
  // Display the bare semver to the user.
  String _displayVersion(String raw) {
    final m = RegExp(r'(\d+\.\d+\.\d+)').firstMatch(raw);
    return m?.group(1) ?? raw;
  }

  Future<void> _showDialog(BuildContext context, {required String current, required ReleaseInfo release}) async {
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
          TextButton(
            onPressed: () {
              _snooze(release.version); // don't re-nag on every launch
              Navigator.pop(ctx);
            },
            child: const Text('Later'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              // Link to the specific mobile release tag — /releases/latest
              // returns whichever tag was pushed last (desktop releases
              // hijack it), which would dump the user on the wrong
              // download page.
              final url = 'https://github.com/$_githubRepo/releases/tag/mobile-v${release.version}';
              await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
            },
            child: const Text('Open in Browser'),
          ),
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
  /// If ota_update fails (permission, checksum, Android 12+ install
  /// restrictions), shows a fallback "Open in Browser" button that
  /// hands the user off to Chrome → GitHub Release → Android's own
  /// download + install flow. That path works on every Android version
  /// because the OS owns the install intent end-to-end.
  void _install(BuildContext context, String apkUrl) {
    final progress  = ValueNotifier<double>(0);
    final stateMsg  = ValueNotifier<String>('Starting download…');
    final hasFailed = ValueNotifier<bool>(false);

    // Extract semver from the apk asset URL (filename pattern
    // StockMate-mobile-vX.Y.Z.apk) so the fallback lands on the
    // matching mobile-v* release page, not /latest (which can return
    // a desktop release if pushed later).
    final verMatch = RegExp(r'v(\d+\.\d+\.\d+)').firstMatch(apkUrl);
    final githubReleaseUrl = verMatch != null
        ? 'https://github.com/$_githubRepo/releases/tag/mobile-v${verMatch.group(1)}'
        : 'https://github.com/$_githubRepo/releases?q=mobile-';

    Future<void> openBrowserFallback() async {
      Navigator.of(context, rootNavigator: true).pop();
      final ok = await launchUrl(
        Uri.parse(githubReleaseUrl),
        mode: LaunchMode.externalApplication,
      );
      if (!ok && context.mounted) _toast(context, 'Could not open browser.');
    }

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
              builder: (_, v, _) => LinearProgressIndicator(value: v == 0 ? null : v),
            ),
            const SizedBox(height: 12),
            ValueListenableBuilder(
              valueListenable: stateMsg,
              builder: (_, m, _) => Text(m, style: const TextStyle(fontSize: 12)),
            ),
            const SizedBox(height: 8),
            ValueListenableBuilder(
              valueListenable: hasFailed,
              builder: (_, failed, _) => failed
                  ? Container(
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade50,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'In-app install blocked. Open the release page in Chrome to download and install manually.',
                        style: TextStyle(fontSize: 11, color: Colors.black87),
                      ),
                    )
                  : const SizedBox.shrink(),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
          ValueListenableBuilder(
            valueListenable: hasFailed,
            builder: (_, failed, _) => FilledButton.icon(
              onPressed: openBrowserFallback,
              icon: const Icon(Icons.open_in_browser, size: 16),
              label: Text(failed ? 'Open in Browser' : 'Use Browser Instead'),
            ),
          ),
        ],
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
              hasFailed.value = true;
              break;
            case OtaStatus.PERMISSION_NOT_GRANTED_ERROR:
              stateMsg.value = 'Install permission blocked. Use Browser fallback below.';
              hasFailed.value = true;
              break;
            case OtaStatus.INTERNAL_ERROR:
            case OtaStatus.DOWNLOAD_ERROR:
            case OtaStatus.CHECKSUM_ERROR:
            case OtaStatus.INSTALLATION_ERROR:
              stateMsg.value = 'Update failed: ${event.value ?? 'unknown error'}';
              hasFailed.value = true;
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
