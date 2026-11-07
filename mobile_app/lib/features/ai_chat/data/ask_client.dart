// Talks to the ai-ask Edge Function. The phone only ever sends an action, a
// question id and a language: the shop, the dates and the prompt are the
// server's. Nothing here is queued offline, and no answer is worked out on the
// phone.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/core/supabase/client.dart';

const askContractVersion = 1;

enum AskErrorKind { reason, connection, slow }

class AskError implements Exception {
  final AskErrorKind kind;
  final String? reason;
  final String? message;
  const AskError(this.kind, {this.reason, this.message});
  @override
  String toString() => message ?? reason ?? kind.name;
}

/// What the client needs from the outside world, so tests can stand in for it.
class AskTransport {
  const AskTransport();

  String? accessToken() => supabase.auth.currentSession?.accessToken;

  Future<bool> refreshSession() async {
    try {
      final r = await supabase.auth.refreshSession();
      return r.session != null;
    } catch (e) {
      debugPrint('[ask] session refresh failed: $e');
      return false;
    }
  }

  Future<http.Response> post(Uri url, Map<String, String> headers, String body) =>
      http.post(url, headers: headers, body: body);

  Future<void> setEnabled(bool on) => supabase.rpc('ai_set_enabled', params: {'p_enabled': on});
}

class AskClient {
  final AskTransport transport;
  final Uri endpoint;
  final String anonKey;
  final Duration timeout;

  AskClient({
    this.transport = const AskTransport(),
    Uri? endpoint,
    String? anonKey,
    this.timeout = const Duration(seconds: 25),
  })  : endpoint = endpoint ?? Uri.parse('${SupabaseConfig.url}/functions/v1/ai-ask'),
        anonKey = anonKey ?? SupabaseConfig.anonKey;

  Future<Map<String, dynamic>> list(String lang) => _call({'action': 'list', 'lang': lang});

  Future<Map<String, dynamic>> ask(String questionId, String lang) =>
      _call({'action': 'ask', 'question_id': questionId, 'lang': lang});

  Future<void> setEnabled(bool on) async {
    try {
      await transport.setEnabled(on);
    } catch (e) {
      debugPrint('[ask] ai_set_enabled failed: $e');
      throw AskError(AskErrorKind.reason, reason: 'read_failed', message: '$e');
    }
  }

  Future<Map<String, dynamic>> _call(Map<String, Object?> body, {bool retried = false}) async {
    final token = transport.accessToken();
    // Never call without the owner's session: a request on the anon key alone
    // is refused by the gateway, and it would not be this owner's books.
    if (token == null) throw const AskError(AskErrorKind.reason, reason: 'not_signed_in');

    http.Response res;
    try {
      res = await transport.post(
        endpoint,
        {'Content-Type': 'application/json', 'Authorization': 'Bearer $token', 'apikey': anonKey},
        jsonEncode(body),
      ).timeout(timeout);
    } on TimeoutException {
      throw const AskError(AskErrorKind.slow);
    } on SocketException {
      throw const AskError(AskErrorKind.connection);
    } on http.ClientException {
      throw const AskError(AskErrorKind.connection);
    }

    Map<String, dynamic>? json;
    try {
      final decoded = jsonDecode(utf8.decode(res.bodyBytes));
      if (decoded is Map<String, dynamic>) json = decoded;
    } catch (_) {
      // The gateway's own 401 is not JSON. Handled by status below.
    }

    if (res.statusCode == 401) {
      // An expired token: refresh once and try again.
      if (!retried && await transport.refreshSession()) return _call(body, retried: true);
      throw AskError(AskErrorKind.reason, reason: 'not_signed_in', message: json?['message'] as String?);
    }
    if (res.statusCode < 200 || res.statusCode >= 300 || json == null) {
      debugPrint('[ask] ${body['action']} refused: ${res.statusCode} ${json?['reason']}');
      throw AskError(AskErrorKind.reason,
          reason: (json?['reason'] as String?) ?? 'read_failed', message: json?['message'] as String?);
    }
    return json;
  }
}
