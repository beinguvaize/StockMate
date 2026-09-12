import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/update/auto_updater.dart';

String api(List<Map<String, dynamic>> releases) => jsonEncode(releases);

Map<String, dynamic> rel({
  required String tag,
  List<String> assets = const [],
  String body = '',
  bool draft = false,
  bool prerelease = true,
}) => {
      'tag_name': tag,
      'draft': draft,
      'prerelease': prerelease,
      'body': body,
      'assets': [
        for (final a in assets)
          {'name': a.split('/').last, 'browser_download_url': a},
      ],
    };

void main() {
  const apk = 'https://github.com/x/y/releases/download/mobile-v1.7.9/StockMate-mobile-v1.7.9.apk';

  group('parseMobileRelease', () {
    test('finds the mobile release and its apk', () {
      final r = parseMobileRelease(api([rel(tag: 'mobile-v1.7.9', assets: [apk])]))!;
      expect(r.version, '1.7.9');
      expect(r.apkUrl, apk);
    });

    test('keeps the tag and its asset together across nested objects', () {
      // The bug this replaces: the old parser split the raw body on the `},{`
      // between release objects, but assets are nested objects containing that
      // same boundary. The tag and its download URL could land in different
      // fragments, leaving apkUrl empty — which the UI shows as "being
      // prepared" forever. Several assets before the apk is the shape that
      // provokes it.
      final many = rel(tag: 'mobile-v1.7.9', assets: [
        'https://x/y/releases/download/mobile-v1.7.9/mapping.txt',
        'https://x/y/releases/download/mobile-v1.7.9/notes.md',
        apk,
      ]);
      final r = parseMobileRelease(api([many]))!;
      expect(r.apkUrl, apk, reason: 'the apk must still be tied to its release');
    });

    test('ignores desktop releases even when they are newer', () {
      // Desktop ships as `v*` and versions independently: v1.6.18 against an
      // installed 1.7.8 would read as a downgrade.
      final r = parseMobileRelease(api([
        rel(tag: 'v1.6.18', assets: ['https://x/y/StockMate.dmg']),
        rel(tag: 'mobile-v1.7.9', assets: [apk]),
      ]))!;
      expect(r.version, '1.7.9');
    });

    test('takes the highest version, NOT the first one listed', () {
      // GitHub's order cannot be trusted. With both published it returns
      // mobile-v1.7.9 BEFORE mobile-v1.7.10 — twelve minutes older. Taking
      // the first match meant a phone on 1.7.9 was shown 1.7.9, decided it
      // was up to date, and never saw 1.7.10 at all.
      final r = parseMobileRelease(api([
        rel(tag: 'mobile-v1.7.9',  assets: ['https://x/y/nine.apk']),
        rel(tag: 'mobile-v1.7.10', assets: [apk]),
      ]))!;
      expect(r.version, '1.7.10');
      expect(r.apkUrl, apk, reason: 'and its own apk, not the other release\'s');
    });

    test('compares numerically across every part of the version', () {
      expect(parseMobileRelease(api([
        rel(tag: 'mobile-v1.9.0',  assets: [apk]),
        rel(tag: 'mobile-v1.10.0', assets: [apk]),
      ]))!.version, '1.10.0');
      expect(parseMobileRelease(api([
        rel(tag: 'mobile-v2.0.0', assets: [apk]),
        rel(tag: 'mobile-v1.9.9', assets: [apk]),
      ]))!.version, '2.0.0');
      // A build suffix must not change the ordering.
      expect(parseMobileRelease(api([
        rel(tag: 'mobile-v1.7.9',      assets: [apk]),
        rel(tag: 'mobile-v1.7.10+128', assets: [apk]),
      ]))!.version, '1.7.10+128');
    });

    test('a draft with a higher version does not win', () {
      final r = parseMobileRelease(api([
        rel(tag: 'mobile-v9.9.9', assets: [apk], draft: true),
        rel(tag: 'mobile-v1.7.10', assets: [apk]),
      ]))!;
      expect(r.version, '1.7.10');
    });

    test('skips a draft — downloading it would 404', () {
      final r = parseMobileRelease(api([
        rel(tag: 'mobile-v1.8.0', assets: [apk], draft: true),
        rel(tag: 'mobile-v1.7.9', assets: [apk]),
      ]))!;
      expect(r.version, '1.7.9');
    });

    test('does NOT skip prereleases — every mobile release is one', () {
      // They are marked prerelease so /releases/latest keeps resolving to a
      // desktop tag. Skipping them would offer no updates at all, ever.
      final r = parseMobileRelease(api([rel(tag: 'mobile-v1.7.9', assets: [apk], prerelease: true)]))!;
      expect(r.version, '1.7.9');
    });

    test('reports a release whose apk is not uploaded yet, with an empty url', () {
      final r = parseMobileRelease(api([rel(tag: 'mobile-v1.7.9')]))!;
      expect(r.version, '1.7.9');
      expect(r.apkUrl, isEmpty);
    });

    test('ignores a non-apk asset', () {
      final r = parseMobileRelease(api([
        rel(tag: 'mobile-v1.7.9', assets: ['https://x/y/StockMate.dmg']),
      ]))!;
      expect(r.apkUrl, isEmpty);
    });

    test('carries the release notes through', () {
      final r = parseMobileRelease(api([
        rel(tag: 'mobile-v1.7.9', assets: [apk], body: 'Line one\nLine two'),
      ]))!;
      expect(r.releaseNotes, 'Line one\nLine two');
    });

    test('returns null rather than throwing on a payload that is not a release list', () {
      // A proxy's HTML, a rate-limit object, a truncated body. This runs on app
      // start, so throwing here would break launch, not just the update check.
      for (final bad in ['', 'not json', '{"message":"API rate limit exceeded"}', '[', 'null']) {
        expect(parseMobileRelease(bad), isNull, reason: bad);
      }
    });

    test('returns null when there is no mobile release at all', () {
      expect(parseMobileRelease(api([rel(tag: 'v1.6.18')])), isNull);
    });

    test('survives entries that are missing the fields it reads', () {
      final r = parseMobileRelease('[{"tag_name":"mobile-v2.0.0"}]')!;
      expect(r.version, '2.0.0');
      expect(r.apkUrl, isEmpty);
      expect(r.releaseNotes, isEmpty);
    });
  });
}
