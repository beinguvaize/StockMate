// How the outbox reads a failure, and what the owner is told about it.
//
// The whole offline-sale design rests on one split:
//
//   transport  The request may or may not have reached the server. It may even
//              have COMMITTED (a timeout after the server wrote the sale). The
//              only safe move is to keep the job and replay it: every queued
//              RPC carries a client-made id and the server's replay guard turns
//              a second delivery into a no-op. Never "Not saved".
//
//   auth       The server would accept the job once the cashier signs in again
//              (an expired or revoked session). Keep it, say why.
//
//   refused    The server answered and said no: not enough stock, credit limit,
//              access denied, a bad payload. Replaying the same call cannot
//              succeed, so retrying it on a timer only hides it. It is parked as
//              FAILED and shown to the owner with the reason and what to do.
//
// Kept free of Flutter and Drift so it can be tested on its own.

import 'dart:async';
import 'dart:io' show SocketException, HandshakeException;

import 'package:supabase_flutter/supabase_flutter.dart'
    show PostgrestException, AuthException, AuthRetryableFetchException;

enum FailureKind { transport, auth, refused }

/// Postgres / PostgREST codes that describe the server's state at that moment,
/// not the request. A replay later can succeed.
const _transientCodes = <String>{
  '57014', // statement timeout / cancelled
  '40001', // serialization failure
  '40P01', // deadlock
  '53300', // too many connections
  '53400', // configuration limit exceeded
  '08000', '08003', '08006', // connection exceptions
  'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', // PostgREST could not reach / pool timeout
};

/// Codes that mean "your session is not valid right now".
const _authCodes = <String>{'PGRST301', 'PGRST302', '401'};

FailureKind classifyFailure(Object e) {
  if (e is TimeoutException || e is SocketException || e is HandshakeException) {
    return FailureKind.transport;
  }
  if (e is AuthRetryableFetchException) return FailureKind.transport;
  if (e is AuthException) return FailureKind.auth;
  if (e is PostgrestException) {
    final code = (e.code ?? '').toUpperCase();
    if (_authCodes.contains(code) || e.message.toLowerCase().contains('jwt expired')) {
      return FailureKind.auth;
    }
    if (_transientCodes.contains(code)) return FailureKind.transport;
    // A gateway in front of PostgREST answers 5xx with an HTML or empty body;
    // postgrest-dart then reports the HTTP status as the code. The request
    // may have committed behind the gateway, so it is a transport failure.
    // Only a three-digit code is an HTTP status. SQLSTATEs are five
    // characters and are often all digits too: 23514 (check_violation) is the
    // negative-stock refusal, and reading it as "5xx" would retry it forever.
    final asInt = code.length == 3 ? int.tryParse(code) : null;
    if (asInt != null && (asInt >= 500 || asInt == 408 || asInt == 429)) {
      return FailureKind.transport;
    }
    return FailureKind.refused;
  }
  // http ClientException, platform socket errors wrapped in other types, DNS
  // failures: anything the server did not answer is transport.
  return FailureKind.transport;
}

/// The owner-facing explanation of a refused job.
class RefusalInfo {
  final String title;
  final String reason;
  final String whatToDo;
  const RefusalInfo(this.title, this.reason, this.whatToDo);
}

/// Pull the sentence out of a stored error string. process_sale raises
/// `MARKER: readable sentence`; the outbox stores `e.toString()`, which wraps
/// that in `PostgrestException(message: ..., code: ...)`.
String _messageOf(String raw) {
  final m = RegExp(r'message:\s*(.*?)(?:,\s*code:|,\s*details:|\)$)', dotAll: true)
      .firstMatch(raw);
  return (m?.group(1) ?? raw).trim();
}

RefusalInfo describeRefusal(String? lastError) {
  final raw = lastError ?? '';
  final msg = _messageOf(raw);
  String after(String marker) =>
      msg.replaceFirst(RegExp('^.*?$marker:\\s*'), '').trim();

  if (raw.contains('NEGATIVE_STOCK_BLOCKED')) {
    return RefusalInfo(
      'Not enough stock',
      after('NEGATIVE_STOCK_BLOCKED'),
      'The shop is set to stop sales below zero stock, and another sale or '
          'device used the stock first. Record the purchase or correct the stock, '
          'then tap Retry. Or tap Discard and ring the bill again.',
    );
  }
  if (raw.contains('CREDIT_LIMIT_EXCEEDED')) {
    return RefusalInfo(
      'Credit limit reached',
      after('CREDIT_LIMIT_EXCEEDED'),
      'Collect a payment from the customer or raise their credit limit, then '
          'tap Retry. Or tap Discard and ring it again as a cash sale.',
    );
  }
  if (raw.contains('Access denied') || raw.contains('42501') || raw.contains('permission denied')) {
    return RefusalInfo(
      'Not allowed',
      msg,
      'This account is not allowed to record this sale for the shop. Sign in '
          'as the owner or an allowed staff member, then tap Retry.',
    );
  }
  if (raw.contains('PGRST203') || raw.contains('PGRST202')) {
    return RefusalInfo(
      'App and server out of step',
      msg,
      'The server could not match this request. Update the app, then tap '
          'Retry. Do not discard: the bill is kept safely on this phone.',
    );
  }
  return RefusalInfo(
    'Server refused the sale',
    msg.isEmpty ? 'No reason was given.' : msg,
    'The sale is NOT in the books yet. Fix the cause and tap Retry, or tap '
        'Discard and ring the bill again. Send this screen to support if unsure.',
  );
}
