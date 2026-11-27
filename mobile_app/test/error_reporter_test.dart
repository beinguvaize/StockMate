// Reference ids, scrubbing, the copy text, and the error-log queue: capped,
// flushed oldest first, and never able to throw into the screen.

import 'dart:convert';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/errors/error_codes.dart';
import 'package:mobile_app/core/errors/error_report.dart';
import 'package:mobile_app/core/errors/error_reporter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const tenant = '00000000-1111-4222-8333-444444444444';

ErrorReport report(String ref, {String raw = 'boom'}) => ErrorReport(
      result: classifyError(TimeoutExceptionLike()),
      reference: ref,
      at: DateTime.utc(2026, 11, 27, 10, 12),
      screen: 'Collect Payment',
      action: 'Record payment',
      appVersion: '1.7.36 (154)',
      platform: 'android',
      tenantId: tenant,
      userId: 'u-1',
      raw: raw,
    );

class TimeoutExceptionLike implements Exception {
  @override
  String toString() => 'TimeoutException after 0:00:06.000000: Future not completed';
}

void main() {
  group('reference', () {
    test('8 characters, no 0/O/1/I', () {
      for (var i = 0; i < 500; i++) {
        final r = newReference();
        expect(r, matches(kReferencePattern));
        expect(r, isNot(matches(RegExp('[01OI]'))));
      }
    });

    test('unique per error event', () {
      final seen = {for (var i = 0; i < 2000; i++) newReference()};
      expect(seen.length, 2000);
    });

    test('deterministic with a seeded generator', () {
      expect(newReference(Random(1)), newReference(Random(1)));
    });
  });

  group('scrubbing', () {
    test('removes JWTs, keys, Authorization and token parameters', () {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123_-';
      final s = scrubRaw('Authorization: Bearer $jwt apikey=sb_publishable_abc123 '
          'url?access_token=xyz789&refresh_token=r3fr3sh '
          '{"apikey": "secretvalue"} sb_secret_ABCdef');
      expect(s, isNot(contains(jwt)));
      expect(s, isNot(contains('eyJ')));
      expect(s, isNot(contains('xyz789')));
      expect(s, isNot(contains('r3fr3sh')));
      expect(s, isNot(contains('secretvalue')));
      expect(s, isNot(contains('sb_secret_ABCdef')));
      expect(s, isNot(contains('abc123')));
    });

    test('keeps the parts support needs', () {
      const raw = "AuthRetryableFetchException(message: ClientException with "
          "SocketException: Failed host lookup: 'example.supabase.co' (OS Error: "
          "No address associated with hostname, errno = 7), uri=https://"
          "example.supabase.co/auth/v1/token?grant_type=refresh_token, statusCode: null)";
      expect(scrubRaw(raw), raw);
    });

    test('removes phone numbers, amounts and echoed key values', () {
      final s = scrubRaw('Key (phone)=(9876543210) already exists; call +91 98765 43210; '
          'limit ₹5,000.50 Rs. 1200; id CP-1732700000000');
      expect(s, isNot(contains('9876543210')));
      expect(s, isNot(contains('98765 43210')));
      expect(s, isNot(contains('5,000')));
      expect(s, isNot(contains('1200')));
      expect(s, contains('Key (phone)=(<value>)'));
      expect(s, contains('CP-1732700000000'), reason: 'ids are kept');
    });

    test('the report scrubs on the way in', () {
      final r = report('ABCDEFGH',
          raw: 'failed with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig');
      expect(r.raw, isNot(contains('eyJ')));
      expect(r.copyText(), isNot(contains('eyJ')));
      expect(r.toRow()['error_message'], isNot(contains('eyJ')));
    });
  });

  group('copy text and row', () {
    test('carries code, reference, IST time, action, app, full shop id, raw', () {
      final t = report('K7QM4XRT').copyText();
      expect(t, '''bookledger error NET-03 · May have saved
Reference: K7QM4XRT
Time: 27 Nov 2026, 3:42 pm IST
Action: Collect Payment / Record payment
App: phone 1.7.36 (154)
Shop id: $tenant
Raw: boom''');
    });

    test('the screen shows the shop id shortened', () {
      expect(report('K7QM4XRT').shortShopId, '00000000…4444');
    });

    test('the log row has the agreed columns and nothing personal', () {
      final row = report('K7QM4XRT').toRow();
      expect(row.keys.toSet(), {
        'tenant_id', 'user_id', 'module', 'action', 'error_code',
        'error_message', 'severity', 'reference_id', 'outcome', 'platform',
        'app_version', 'occurred_at',
      });
      expect(row['reference_id'], 'K7QM4XRT');
      expect(row['outcome'], 'MAY_HAVE_SAVED');
      expect(row['platform'], 'phone-android');
      expect(row['occurred_at'], '2026-11-27T10:12:00.000Z');
    });
  });

  group('queue', () {
    test('sent at once when the insert works', () async {
      final store = MemoryErrorQueueStore();
      final sent = <Map<String, dynamic>>[];
      final rep = ErrorReporter(store: store, sink: (r) async => sent.add(r));
      await rep.reportAndWait(report('AAAAAAAA'));
      expect(sent.single['reference_id'], 'AAAAAAAA');
      expect(store.rows, isEmpty);
    });

    test('offline: kept, capped at 50 dropping the oldest, flushed in order later',
        () async {
      final store = MemoryErrorQueueStore();
      var online = false;
      final sent = <String>[];
      final rep = ErrorReporter(
          store: store,
          sink: (r) async {
            if (!online) throw Exception('SocketException: Failed host lookup');
            sent.add(r['reference_id'] as String);
          });
      for (var i = 0; i < 60; i++) {
        await rep.reportAndWait(report('R${i.toString().padLeft(7, '0')}'));
      }
      expect(store.rows.length, ErrorReporter.cap);
      expect(jsonDecode(store.rows.first)['reference_id'], 'R0000010');
      online = true;
      await rep.flush();
      expect(sent.length, 50);
      expect(sent.first, 'R0000010');
      expect(sent.last, 'R0000059');
      expect(store.rows, isEmpty);
    });

    test('a duplicate reference (lost reply, sent again) is dropped as delivered',
        () async {
      final store = MemoryErrorQueueStore();
      final rep = ErrorReporter(
          store: store,
          sink: (r) async => throw const PostgrestException(
              message: 'duplicate key', code: '23505'));
      await rep.reportAndWait(report('DUPDUPDU'));
      expect(store.rows, isEmpty);
    });

    test('table not migrated yet: insert refused quietly, row kept, capped',
        () async {
      final store = MemoryErrorQueueStore();
      final rep = ErrorReporter(
          store: store,
          sink: (r) async => throw const PostgrestException(
              message: "Could not find the 'reference_id' column", code: 'PGRST204'));
      for (var i = 0; i < 55; i++) {
        await rep.reportAndWait(report('M${i.toString().padLeft(7, '0')}'));
      }
      expect(store.rows.length, ErrorReporter.cap);
    });

    test('report() never throws, even when the store itself fails', () async {
      final rep = ErrorReporter(store: _BrokenStore(), sink: (r) async {});
      expect(() => rep.report(report('BROKENST')), returnsNormally);
      await rep.reportAndWait(report('BROKENST')); // completes, no throw
      await rep.flush();
    });

    test('a row queued while a flush is sending is not lost', () async {
      final store = MemoryErrorQueueStore();
      final sent = <String>[];
      final rep = ErrorReporter(
          store: store,
          sink: (r) async {
            await Future<void>.delayed(const Duration(milliseconds: 5));
            sent.add(r['reference_id'] as String);
          });
      final a = rep.reportAndWait(report('FIRSTAAA'));
      final b = rep.reportAndWait(report('SECONDBB'));
      await Future.wait([a, b]);
      await rep.flush();
      expect(sent, ['FIRSTAAA', 'SECONDBB']);
      expect(store.rows, isEmpty);
    });
  });
}

class _BrokenStore implements ErrorQueueStore {
  @override
  Future<List<String>> load() async => throw StateError('disk full');
  @override
  Future<void> save(List<String> rows) async => throw StateError('disk full');
}
