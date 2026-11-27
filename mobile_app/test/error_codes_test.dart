// The error-code mapper: every code in the catalogue, the airplane-mode bug,
// and the multi-request rule. The headline must be true: "Not saved" only for
// a server refusal, "Not sent" only when nothing left the phone, otherwise
// "May have saved".

import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/core/database/sync_errors.dart';
import 'package:mobile_app/core/errors/error_codes.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

PostgrestException pg(String code, [String message = 'x', Object? details]) =>
    PostgrestException(message: message, code: code, details: details);

String codeOf(Object e, {bool sent = true, bool earlier = false, bool print = false}) =>
    classifyError(e, sent: sent, earlierWriteSucceeded: earlier, printOrShare: print).code;

ErrorOutcome outcomeOf(Object e, {bool sent = true, bool earlier = false}) =>
    classifyError(e, sent: sent, earlierWriteSucceeded: earlier).outcome;

// The exact exception from the field report (project host replaced).
final airplane = AuthRetryableFetchException(
    message: "ClientException with SocketException: Failed host lookup: "
        "'example.supabase.co' (OS Error: No address associated with hostname, "
        "errno = 7), uri=https://example.supabase.co/auth/v1/token?"
        "grant_type=refresh_token");

void main() {
  group('catalogue', () {
    test('has the 25 codes, unique, in the published order', () {
      expect(kErrorCatalogue.map((c) => c.code).toList(), [
        'NET-01', 'NET-02', 'NET-03', 'NET-04',
        'AUTH-01', 'AUTH-02', 'AUTH-03',
        'SRV-01', 'SRV-02', 'SRV-03',
        'DB-01', 'DB-02', 'DB-03', 'DB-04', 'DB-05', 'DB-06',
        'VAL-01', 'VAL-02',
        'SYNC-01', 'SYNC-02', 'SYNC-03', 'SYNC-04',
        'APP-01', 'APP-02', 'APP-03',
      ]);
    });

    test('outcomes follow the catalogue', () {
      final may = kErrorCatalogue
          .where((c) => c.outcome == ErrorOutcome.mayHaveSaved)
          .map((c) => c.code)
          .toSet();
      expect(may, {'NET-02', 'NET-03', 'SRV-01', 'SYNC-02', 'APP-02'});
      final sent = kErrorCatalogue
          .where((c) => c.outcome == ErrorOutcome.notSent)
          .map((c) => c.code)
          .toSet();
      expect(sent, {'NET-01', 'NET-04', 'AUTH-01', 'AUTH-03', 'VAL-01',
        'SYNC-01', 'SYNC-04', 'APP-01'});
      expect(errorCodeInfo('APP-03').outcome, ErrorOutcome.noChange);
    });
  });

  group('the airplane-mode bug', () {
    test('a refresh that could not look up the host is NET-01 Not sent', () {
      expect(requestNeverLeft(airplane), isTrue);
      final r = classifyError(airplane);
      expect(r.code, 'NET-01');
      expect(r.outcome, ErrorOutcome.notSent);
    });

    test('the same wrapped in a bare http ClientException is NET-01', () {
      final e = http.ClientException(
          'SocketException: Failed host lookup: example.supabase.co (OS Error: '
          'nodename nor servname provided, or not known, errno = 8)');
      expect(codeOf(e), 'NET-01');
    });

    test('a wrapped connection reset is NOT "never left"', () {
      final e = http.ClientException(
          'SocketException: Connection reset by peer (OS Error: Connection '
          'reset by peer, errno = 104)');
      expect(requestNeverLeft(e), isFalse);
      expect(codeOf(e), 'NET-02');
      expect(outcomeOf(e), ErrorOutcome.mayHaveSaved);
    });

    test('a refresh failure without a host-lookup cause is AUTH-03 Not sent', () {
      final e = AuthRetryableFetchException(message: 'upstream', statusCode: '503');
      expect(codeOf(e), 'AUTH-03');
      expect(outcomeOf(e), ErrorOutcome.notSent);
    });
  });

  group('every code maps from its technical cause', () {
    final cases = <String, List<Object>>{
      'NET-01': [
        const SocketException('Failed host lookup: example.supabase.co',
            osError: OSError('No address associated with hostname', 7)),
        const SocketException('Connection failed',
            osError: OSError('Network is unreachable', 101)),
        const SocketException('Connection refused',
            osError: OSError('Connection refused', 111)),
        airplane,
      ],
      'NET-02': [
        const SocketException('Connection reset by peer'),
        const SocketException('Write failed',
            osError: OSError('Broken pipe', 32)),
        http.ClientException('Connection closed before full header was received'),
      ],
      'NET-03': [TimeoutException('x'), pg('408')],
      'NET-04': [
        const HandshakeException('CERTIFICATE_VERIFY_FAILED'),
        const TlsException('bad'),
      ],
      'AUTH-01': [
        AuthApiException('Invalid Refresh Token',
            statusCode: '400', code: 'refresh_token_not_found'),
        AuthApiException('x', statusCode: '400', code: 'session_not_found'),
        AuthSessionMissingException(),
      ],
      'AUTH-02': [pg('PGRST301'), pg('PGRST302'), pg('401'), pg('', 'JWT expired')],
      'AUTH-03': [AuthRetryableFetchException(message: 'timeout')],
      'SRV-01': [
        pg('500'), pg('502'), pg('503'), pg('504'), pg('08006'),
        const FunctionException(status: 500),
      ],
      'SRV-02': [
        pg('53300'), pg('53400'), pg('40001'), pg('40P01'), pg('57014'),
        pg('PGRST000'), pg('PGRST003'), pg('429'),
      ],
      'SRV-03': [pg('PGRST202'), pg('PGRST203'), pg('PGRST204'), pg('42883'),
        pg('42703'), pg('42P01')],
      'DB-01': [pg('23505', 'duplicate key value'), pg('P0001', 'op already processed')],
      'DB-02': [
        pg('42501', 'new row violates row-level security policy'),
        pg('P0001', 'Access denied'),
        pg('403'),
        const FunctionException(status: 403),
      ],
      'DB-03': [
        pg('P0001', 'NEGATIVE_STOCK_BLOCKED: only 2 left'),
        pg('23514', 'stock check failed'),
      ],
      'DB-04': [pg('P0001', 'CREDIT_LIMIT_EXCEEDED: over the limit')],
      'DB-05': [pg('23503'), pg('PGRST116')],
      'DB-06': [
        pg('P0001', 'Bill date is in a closed period'),
        pg('23514', 'check "amount_positive"'),
        pg('23502'),
      ],
      'VAL-01': [const ValidationFailure('amount is 0')],
      'VAL-02': [pg('22P02'), pg('22003'), pg('22007'), pg('22008'), pg('22001')],
      'APP-01': [StateError('bad state')], // with sent: false, below
      'APP-02': [StateError('bad state')],
      'APP-03': [Exception('printer offline')], // with printOrShare, below
    };
    for (final entry in cases.entries) {
      test(entry.key, () {
        for (final e in entry.value) {
          final got = codeOf(e,
              sent: entry.key != 'APP-01', print: entry.key == 'APP-03');
          expect(got, entry.key, reason: '$e');
        }
      });
    }

    test('SYNC codes from the outbox state', () {
      expect(classifyQueued(QueuedState.pending, null).code, 'SYNC-01');
      expect(classifyQueued(QueuedState.unconfirmed, null).code, 'SYNC-02');
      expect(
          classifyQueued(QueuedState.refused,
                  'Unconfirmed: check Stock History before Retry (TimeoutException)')
              .code,
          'SYNC-02');
      final refused = classifyQueued(QueuedState.refused,
          'PostgrestException(message: NEGATIVE_STOCK_BLOCKED: only 2 left, code: P0001, details: null, hint: null)');
      expect(refused.code, 'SYNC-03');
      expect(refused.chip, 'SYNC-03 / DB-03');
      expect(refused.outcome, ErrorOutcome.notSaved);
      expect(classifyQueued(QueuedState.auth, null).code, 'SYNC-04');
    });

    test('every catalogue code is reachable by the tests above', () {
      final covered = {...cases.keys, 'SYNC-01', 'SYNC-02', 'SYNC-03', 'SYNC-04'};
      expect(covered, kErrorCatalogue.map((c) => c.code).toSet());
    });
  });

  group('hard rules', () {
    test('"Not saved" only when the server answered', () {
      for (final e in <Object>[
        TimeoutException('x'),
        const SocketException('Connection reset by peer'),
        pg('502'),
        pg('418'),
        StateError('x'),
        http.ClientException('Connection closed'),
      ]) {
        expect(outcomeOf(e), isNot(ErrorOutcome.notSaved), reason: '$e');
      }
    });

    test('an unknown error after a request went out is May have saved', () {
      expect(outcomeOf(StateError('x'), sent: true), ErrorOutcome.mayHaveSaved);
      expect(outcomeOf(StateError('x'), sent: false), ErrorOutcome.notSent);
    });

    test('a bare unknown HTTP status cannot prove anything: May have saved', () {
      expect(codeOf(pg('418')), 'SRV-01');
    });
  });

  group('the multi-request rule', () {
    test('an earlier write landed: May have saved, whatever the last error', () {
      for (final e in <Object>[
        airplane, // would be Not sent
        pg('42501'), // would be Not saved
        pg('429'), // SRV-02, Not saved on its own
        const ValidationFailure('x'),
        StateError('x'),
      ]) {
        final r = classifyError(e, earlierWriteSucceeded: true);
        expect(r.outcome, ErrorOutcome.mayHaveSaved, reason: '$e');
        expect(r.partial, r.info.outcome != ErrorOutcome.mayHaveSaved);
      }
    });

    test('the code is kept so support can see the last cause', () {
      final r = classifyError(pg('42501'), earlierWriteSucceeded: true);
      expect(r.code, 'DB-02');
      expect(plainMessage(r, noun: 'payment'), contains('Part of this payment was saved'));
    });

    test('nothing written yet: the error decides', () {
      expect(outcomeOf(airplane, earlier: false), ErrorOutcome.notSent);
      expect(outcomeOf(pg('42501'), earlier: false), ErrorOutcome.notSaved);
    });
  });

  group('plain message', () {
    test('never carries the raw error', () {
      final r = classifyError(airplane);
      final m = plainMessage(r, noun: 'payment');
      expect(m, contains('Your phone is offline'));
      expect(m, isNot(contains('SocketException')));
      expect(m, isNot(contains('supabase')));
    });

    test('a shop rule shows the server sentence, not the exception', () {
      final r = classifyError(pg('P0001', 'Bill date is in a closed period'));
      final m = plainMessage(r, noun: 'payment');
      expect(m, contains('Bill date is in a closed period.'));
      expect(m, isNot(contains('PostgrestException')));
    });
  });
}
