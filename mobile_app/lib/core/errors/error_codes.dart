// Error codes with support codes: the catalogue, and the one rule that picks
// a code for a failure.
//
// The headline a screen shows is the OUTCOME, and the outcome must be true:
//
//   Not sent        the request provably never left the phone
//   May have saved  it left and no answer came back, or part of the action
//                   already landed
//   Not saved       the server answered and refused
//
// When the code cannot prove which, it says "May have saved". A wrong "Not
// saved" makes a shopkeeper record a payment twice; a wrong "Not sent" does
// the same. A cautious "May have saved" costs one look at the list.
//
// Built on core/database/sync_errors.dart (classifyFailure, requestNeverLeft,
// describeRefusal), not a second copy of those rules. Kept free of Flutter so
// it can be tested on its own. The web twin is src/lib/errorCodes.js; a test
// on each side fails if the two lists drift.

import 'dart:async' show TimeoutException;
import 'dart:io' show SocketException, HandshakeException, TlsException;

import 'package:mobile_app/core/database/sync_errors.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show
        PostgrestException,
        AuthException,
        AuthApiException,
        AuthRetryableFetchException,
        AuthSessionMissingException,
        FunctionException;

enum ErrorOutcome { notSent, mayHaveSaved, notSaved, noChange }

extension ErrorOutcomeText on ErrorOutcome {
  /// The headline, exactly as the card shows it.
  String get label => switch (this) {
        ErrorOutcome.notSent => 'Not sent',
        ErrorOutcome.mayHaveSaved => 'May have saved',
        ErrorOutcome.notSaved => 'Not saved',
        ErrorOutcome.noChange => 'No change to the books',
      };

  /// The value written to platform_error_logs.outcome (and used by web).
  String get wire => switch (this) {
        ErrorOutcome.notSent => 'NOT_SENT',
        ErrorOutcome.mayHaveSaved => 'MAY_HAVE_SAVED',
        ErrorOutcome.notSaved => 'NOT_SAVED',
        ErrorOutcome.noChange => 'NO_CHANGE',
      };
}

class ErrorCodeInfo {
  final String code;
  final String title;
  final ErrorOutcome outcome;
  final String advice;
  const ErrorCodeInfo(this.code, this.title, this.outcome, this.advice);
}

const _sent = ErrorOutcome.notSent;
const _may = ErrorOutcome.mayHaveSaved;
const _no = ErrorOutcome.notSaved;

/// The catalogue (mockups/error-codes/catalogue.md). A code never changes
/// meaning once released; retired codes are not reused.
const List<ErrorCodeInfo> kErrorCatalogue = [
  ErrorCodeInfo('NET-01', 'No internet', _sent,
      'Turn off airplane mode or connect to Wi-Fi, then tap Try again.'),
  ErrorCodeInfo('NET-02', 'Connection dropped', _may,
      'Check before trying again. It may already be saved.'),
  ErrorCodeInfo('NET-03', 'Took too long', _may,
      'Check before trying again. It may already be saved.'),
  ErrorCodeInfo('NET-04', 'Secure connection failed', _sent,
      "Check the phone's date and time are correct. On shop Wi-Fi, try mobile data."),
  ErrorCodeInfo('AUTH-01', 'Signed out', _sent,
      'Sign in again. What you typed is kept.'),
  ErrorCodeInfo('AUTH-02', 'Session expired', _no,
      'Sign in again, then try again.'),
  ErrorCodeInfo('AUTH-03', 'Could not refresh sign-in', _sent,
      'Wait a moment and tap Try again.'),
  ErrorCodeInfo('SRV-01', 'Server did not answer properly', _may,
      'Check before trying again. It may already be saved.'),
  ErrorCodeInfo('SRV-02', 'Server busy', _no,
      'Wait a minute and tap Try again.'),
  ErrorCodeInfo('SRV-03', 'App needs an update', _no,
      'Update the app from the Update screen, then try again.'),
  ErrorCodeInfo('DB-01', 'Already saved', _no,
      'It is already in the books. Check the list, do not add it again.'),
  ErrorCodeInfo('DB-02', 'Not allowed', _no,
      'Ask the shop owner to give your account access to this.'),
  ErrorCodeInfo('DB-03', 'Not enough stock', _no,
      'Record the purchase or correct the stock, then try again.'),
  ErrorCodeInfo('DB-04', 'Credit limit reached', _no,
      "Collect a payment or raise the client's credit limit."),
  ErrorCodeInfo('DB-05', 'Record was removed', _no,
      'It was deleted on another device. Go back and refresh.'),
  ErrorCodeInfo('DB-06', 'Shop rule stopped it', _no,
      'Read the reason shown. Fix it and try again.'),
  ErrorCodeInfo('VAL-01', 'Check what you typed', _sent,
      'Fix the highlighted field.'),
  ErrorCodeInfo('VAL-02', 'Server could not read a value', _no,
      'Re-enter the value (date, amount) and try again.'),
  ErrorCodeInfo('SYNC-01', 'Saved on this phone', _sent,
      'Nothing to do. It will send when the phone is online.'),
  ErrorCodeInfo('SYNC-02', 'May already be recorded', _may,
      'Open the list and look for it. If there, Discard. If not, Retry.'),
  ErrorCodeInfo('SYNC-03', 'Refused when sent', _no,
      'Read the reason. Fix it, then Retry or Discard.'),
  ErrorCodeInfo('SYNC-04', 'Waiting for sign-in', _sent,
      'Sign in again. Queued items will send after.'),
  ErrorCodeInfo('APP-01', 'Something went wrong on the phone', _sent,
      'Tap Try again. If it repeats, send the details to support.'),
  ErrorCodeInfo('APP-02', 'Something went wrong while saving', _may,
      'Check before trying again. It may already be saved.'),
  ErrorCodeInfo('APP-03', 'Could not print or share', ErrorOutcome.noChange,
      'Check the printer or the app you shared to, then try again.'),
];

final Map<String, ErrorCodeInfo> _byCode = {
  for (final c in kErrorCatalogue) c.code: c,
};

ErrorCodeInfo errorCodeInfo(String code) =>
    _byCode[code] ?? _byCode['APP-02']!;

/// A check the phone made before sending anything (VAL-01).
class ValidationFailure implements Exception {
  final String message;
  const ValidationFailure(this.message);
  @override
  String toString() => 'ValidationFailure: $message';
}

/// What the screen is told about one failure.
class ErrorResult {
  final ErrorCodeInfo info;

  /// The outcome actually shown. Equal to [info.outcome] except when an
  /// earlier write of the same action already landed ([partial]).
  final ErrorOutcome outcome;

  /// True when part of a multi-request action was already written, which is
  /// what forced the outcome to "May have saved".
  final bool partial;

  /// The server's own readable sentence for a refusal (from describeRefusal),
  /// when there is one. Never the raw exception.
  final String? serverReason;

  /// For a refused outbox item: the code of the inner refusal (SYNC-03 / DB-03).
  final String? innerCode;

  const ErrorResult(this.info,
      {required this.outcome,
      this.partial = false,
      this.serverReason,
      this.innerCode});

  String get code => info.code;
  String get chip => innerCode == null ? code : '$code / $innerCode';
}

/// Pick the code for [e].
///
/// [sent]: whether any request of this action may already have left the
/// phone. It only decides between APP-01 and APP-02 for an exception the
/// rules below do not recognise: unknown + nothing sent is "Not sent".
///
/// [earlierWriteSucceeded]: whether an earlier WRITE of the same action
/// already succeeded. If it did, the whole action is "May have saved",
/// whatever this error says (the multi-request rule).
///
/// [printOrShare]: the action was a print / PDF / share, which never changes
/// the books (APP-03).
ErrorResult classifyError(Object e,
    {bool sent = true,
    bool earlierWriteSucceeded = false,
    bool printOrShare = false}) {
  final base = _pick(e, sent: sent, printOrShare: printOrShare);
  final info = errorCodeInfo(base.$1);
  var outcome = info.outcome;
  var partial = false;
  if (earlierWriteSucceeded && outcome != ErrorOutcome.mayHaveSaved) {
    outcome = ErrorOutcome.mayHaveSaved;
    partial = true;
  }
  return ErrorResult(info,
      outcome: outcome, partial: partial, serverReason: base.$2);
}

(String, String?) _pick(Object e,
    {required bool sent, required bool printOrShare}) {
  if (e is ValidationFailure) return ('VAL-01', null);

  // ── Never left the phone ────────────────────────────────────────────────
  if (requestNeverLeft(e)) return ('NET-01', null);
  if (e is HandshakeException || e is TlsException || _tlsText(e.toString())) {
    return ('NET-04', null);
  }
  // The sign-in refresh runs before the write; its failure means the write
  // was never sent. A host-lookup cause is NET-01 (handled above).
  if (e is AuthRetryableFetchException) return ('AUTH-03', null);
  if (e is AuthSessionMissingException) return ('AUTH-01', null);
  if (e is AuthException) return (_authCode(e), null);

  // ── Left, no clear answer ───────────────────────────────────────────────
  if (e is TimeoutException) return ('NET-03', null);
  if (e is SocketException) return ('NET-02', null);

  if (e is PostgrestException) return _postgrest(e);

  if (e is FunctionException) {
    final s = e.status;
    if (s >= 500) return ('SRV-01', null);
    if (s == 401) return ('AUTH-02', null);
    if (s == 403) return ('DB-02', null);
    if (s == 408) return ('NET-03', null);
    if (s == 429) return ('SRV-02', null);
    if (s >= 400) return ('DB-06', null);
    return ('SRV-01', null);
  }

  if (printOrShare) return ('APP-03', null);

  final text = e.toString().toLowerCase();
  // http ClientException and other wrappers that left after connecting.
  if (text.contains('clientexception') ||
      text.contains('socketexception') ||
      text.contains('connection closed') ||
      text.contains('connection reset')) {
    return ('NET-02', null);
  }
  if (text.contains('timeoutexception') || text.contains('timed out')) {
    return ('NET-03', null);
  }
  return (sent ? 'APP-02' : 'APP-01', null);
}

bool _tlsText(String s) {
  final m = s.toLowerCase();
  return m.contains('handshakeexception') ||
      m.contains('certificate_verify_failed') ||
      m.contains('tlsexception');
}

const _signedOutCodes = {
  'refresh_token_not_found',
  'refresh_token_already_used',
  'invalid_grant',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'bad_jwt',
};

String _authCode(AuthException e) {
  final code = (e.code ?? '').toLowerCase();
  if (_signedOutCodes.contains(code)) return 'AUTH-01';
  final status = int.tryParse(e.statusCode ?? '');
  if (e is AuthApiException && status != null && status >= 400 && status < 500) {
    return 'AUTH-01';
  }
  if (status != null && (status == 400 || status == 401 || status == 403)) {
    return 'AUTH-01';
  }
  // Auth 5xx, an unknown auth failure: the refresh did not finish, the write
  // was not sent.
  return 'AUTH-03';
}

const _busy = {
  '53300', '53400', '40001', '40P01', '57014',
  'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003',
};
const _outOfStep = {'PGRST202', 'PGRST203', 'PGRST204', '42883', '42703', '42P01'};
const _badValue = {'22P02', '22003', '22007', '22008', '22001'};

(String, String?) _postgrest(PostgrestException e) {
  final code = (e.code ?? '').toUpperCase();
  final raw = e.toString();
  final lower = '${e.message} ${e.details ?? ''}'.toLowerCase();
  String? reason() {
    final r = describeRefusal(raw).reason.trim();
    return r.isEmpty ? null : r;
  }

  if (code == 'PGRST301' || code == 'PGRST302' || code == '401' ||
      lower.contains('jwt expired')) {
    return ('AUTH-02', null);
  }
  // A gateway in front of PostgREST answers with an HTML or empty body; the
  // client then reports the HTTP status as the code. Only a three-digit code
  // is an HTTP status (23514 is a SQLSTATE, not "5xx").
  final http = code.length == 3 ? int.tryParse(code) : null;
  if (http != null) {
    if (http == 408) return ('NET-03', null);
    if (http == 429) return ('SRV-02', null);
    if (http == 403) return ('DB-02', null);
    // 5xx, and any other bare status: the request may have been processed
    // behind the gateway. Not provable either way, so "May have saved".
    return ('SRV-01', null);
  }
  // Connection to the database broke: the transaction may have committed.
  if (code.startsWith('08')) return ('SRV-01', null);
  if (_busy.contains(code)) return ('SRV-02', null);
  if (_outOfStep.contains(code)) return ('SRV-03', null);
  if (raw.contains('NEGATIVE_STOCK_BLOCKED') ||
      (code == '23514' && lower.contains('stock'))) {
    return ('DB-03', reason());
  }
  if (raw.contains('CREDIT_LIMIT_EXCEEDED')) return ('DB-04', reason());
  if (code == '23505' || lower.contains('already processed')) {
    return ('DB-01', null);
  }
  if (code == '42501' ||
      lower.contains('row-level security') ||
      lower.contains('access denied') ||
      lower.contains('permission denied')) {
    return ('DB-02', null);
  }
  if (code == '23503' || code == 'PGRST116') return ('DB-05', null);
  if (_badValue.contains(code)) return ('VAL-02', null);
  // P0001 with a sentence, 23514 (other checks), 23502, and any other code the
  // server answered with: a refusal, nothing written.
  return ('DB-06', reason());
}

// ── Outbox items ──────────────────────────────────────────────────────────

enum QueuedState { pending, auth, unconfirmed, refused }

/// The code for an outbox item, from its state and stored error text.
ErrorResult classifyQueued(QueuedState state, String? lastError) {
  switch (state) {
    case QueuedState.pending:
      return ErrorResult(errorCodeInfo('SYNC-01'), outcome: ErrorOutcome.notSent);
    case QueuedState.auth:
      return ErrorResult(errorCodeInfo('SYNC-04'), outcome: ErrorOutcome.notSent);
    case QueuedState.unconfirmed:
      return ErrorResult(errorCodeInfo('SYNC-02'),
          outcome: ErrorOutcome.mayHaveSaved);
    case QueuedState.refused:
      final raw = lastError ?? '';
      if (raw.contains(kUnconfirmedMarker)) {
        return ErrorResult(errorCodeInfo('SYNC-02'),
            outcome: ErrorOutcome.mayHaveSaved);
      }
      final inner = innerCodeFromText(raw);
      final r = describeRefusal(raw).reason.trim();
      return ErrorResult(errorCodeInfo('SYNC-03'),
          outcome: ErrorOutcome.notSaved,
          innerCode: inner,
          serverReason: r.isEmpty ? null : r);
  }
}

/// Matches sync_service's `kUnconfirmed` marker text.
const kUnconfirmedMarker = 'Unconfirmed';

/// The DB-/SRV-/VAL- code behind a stored refusal string (the outbox keeps
/// `e.toString()`, not the exception).
String? innerCodeFromText(String raw) {
  if (raw.isEmpty) return null;
  final m = RegExp(r'code:\s*([A-Za-z0-9]+)').firstMatch(raw);
  final msg = RegExp(r'message:\s*(.*?)(?:,\s*code:|,\s*details:|\)$)', dotAll: true)
          .firstMatch(raw)
          ?.group(1) ??
      raw;
  final pe = PostgrestException(message: msg, code: m?.group(1));
  return _postgrest(pe).$1;
}

// ── Plain words for the card ─────────────────────────────────────────────

/// The one plain sentence under the headline. [noun] is what was being saved
/// ("payment", "sale"); [checkWhere] is where to look ("Asha's payments",
/// "the sales list"). Raw error text never appears here.
String plainMessage(ErrorResult r,
    {required String noun, String checkWhere = 'the list'}) {
  final info = r.info;
  if (r.partial) {
    return 'Part of this $noun was saved before it stopped. It may already be '
        'in the books. Check $checkWhere before trying again, so it is not '
        'recorded twice.';
  }
  switch (r.outcome) {
    case ErrorOutcome.notSent:
      final lead = switch (info.code) {
        'NET-01' => 'Your phone is offline. ',
        'NET-04' => 'A secure connection to the server could not be made. ',
        'AUTH-01' => 'You have been signed out. ',
        'AUTH-03' => 'Sign-in could not be refreshed. ',
        'VAL-01' => '',
        _ => '',
      };
      final fix = switch (info.code) {
        'NET-01' => 'Connect to the internet and try again.',
        _ => info.advice,
      };
      return '${lead}The $noun was not sent, so nothing changed in the books. $fix';
    case ErrorOutcome.mayHaveSaved:
      return 'The $noun was sent but the reply did not come back. It may '
          'already be in the books. Check $checkWhere before trying again, so '
          'it is not recorded twice.';
    case ErrorOutcome.notSaved:
      final why = switch (info.code) {
        'DB-02' => 'Your account is not allowed to do this for this shop.',
        'DB-01' => 'This $noun is already in the books.',
        'AUTH-02' => 'Your session expired before the server would take it.',
        'SRV-02' => 'The server was too busy to take it.',
        'SRV-03' => 'This version of the app is out of step with the server.',
        _ => r.serverReason != null && r.serverReason!.isNotEmpty
            ? '${info.title}: ${_sentence(r.serverReason!)}'
            : '${info.title}.',
      };
      final nothing = info.code == 'DB-01'
          ? 'Nothing new was added.'
          : 'Nothing was added to the books.';
      return '$why $nothing ${info.advice}';
    case ErrorOutcome.noChange:
      return 'Nothing in the books changed. ${info.advice}';
  }
}

String _sentence(String s) {
  final t = s.trim();
  if (t.isEmpty) return t;
  return RegExp(r'[.!?]$').hasMatch(t) ? t : '$t.';
}
