import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/features/ai_chat/data/ask_client.dart';

class _Transport extends AskTransport {
  String? token;
  final List<Object> replies; // http.Response or an exception to throw
  final posts = <({Map<String, String> headers, Map<String, dynamic> body})>[];
  int refreshes = 0;
  bool refreshWorks;
  _Transport(this.replies, {this.token = 'jwt-1', this.refreshWorks = true});

  @override
  String? accessToken() => token;

  @override
  Future<bool> refreshSession() async {
    refreshes++;
    if (refreshWorks) token = 'jwt-2';
    return refreshWorks;
  }

  @override
  Future<http.Response> post(Uri url, Map<String, String> headers, String body) async {
    posts.add((headers: headers, body: jsonDecode(body) as Map<String, dynamic>));
    final r = replies.removeAt(0);
    if (r is http.Response) return r;
    throw r;
  }
}

http.Response _json(int status, Object? body) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json'});

void main() {
  final responses = jsonDecode(File('../shared/fixtures/ai_chat/responses.json').readAsStringSync())
      as Map<String, dynamic>;

  AskClient client(_Transport t) =>
      AskClient(transport: t, endpoint: Uri.parse('https://x.test/functions/v1/ai-ask'), anonKey: 'anon');

  test('sends only the action, the question and the language, with the owner\'s session', () async {
    final t = _Transport([_json(200, responses['list_on'])]);
    final list = await client(t).list('hi');
    expect(list['state'], 'on');
    expect(t.posts.single.body, {'action': 'list', 'lang': 'hi'});
    expect(t.posts.single.headers['Authorization'], 'Bearer jwt-1');
    expect(t.posts.single.headers['apikey'], 'anon');

    final t2 = _Transport([_json(200, {'contract_version': 1, 'card': {}})]);
    await client(t2).ask('sales_today', 'en');
    expect(t2.posts.single.body, {'action': 'ask', 'question_id': 'sales_today', 'lang': 'en'});
  });

  test('no session means no call at all', () async {
    final t = _Transport([], token: null);
    await expectLater(client(t).list('en'),
        throwsA(isA<AskError>().having((e) => e.reason, 'reason', 'not_signed_in')));
    expect(t.posts, isEmpty);
  });

  test("the gateway's own 401 (not JSON) refreshes once, then retries", () async {
    final raw = (responses['refusals'] as List).last['raw'] as String;
    final t = _Transport([http.Response(raw, 401), _json(200, responses['list_on'])]);
    final list = await client(t).list('en');
    expect(list['state'], 'on');
    expect(t.refreshes, 1);
    expect(t.posts.last.headers['Authorization'], 'Bearer jwt-2');
  });

  test('a 401 that survives a refresh is not_signed_in, not a loop', () async {
    final t = _Transport([http.Response('nope', 401), http.Response('nope', 401)]);
    await expectLater(client(t).list('en'),
        throwsA(isA<AskError>().having((e) => e.reason, 'reason', 'not_signed_in')));
    expect(t.posts.length, 2);
    expect(t.refreshes, 1);
  });

  test('a 401 with no session to refresh is not_signed_in, after one call', () async {
    final t = _Transport([http.Response('nope', 401)], refreshWorks: false);
    await expectLater(client(t).list('en'),
        throwsA(isA<AskError>().having((e) => e.reason, 'reason', 'not_signed_in')));
    expect(t.posts.length, 1);
  });

  test('every refusal in the fixtures comes back as its reason', () async {
    for (final r in (responses['refusals'] as List).cast<Map<String, dynamic>>()) {
      if (r['body'] == null) continue;
      final t = _Transport([_json(r['status'] as int, r['body'])]);
      await expectLater(client(t).ask('sales_today', 'en'),
          throwsA(isA<AskError>()
              .having((e) => e.kind, 'kind', AskErrorKind.reason)
              .having((e) => e.reason, 'reason', (r['body'] as Map)['reason'])));
    }
  });

  test('a body that is not JSON is a read failure', () async {
    final t = _Transport([http.Response('<html>bad gateway</html>', 502)]);
    await expectLater(client(t).list('en'),
        throwsA(isA<AskError>().having((e) => e.reason, 'reason', 'read_failed')));
  });

  test('no connection and a slow answer are told apart', () async {
    await expectLater(client(_Transport([const SocketException('down')])).list('en'),
        throwsA(isA<AskError>().having((e) => e.kind, 'kind', AskErrorKind.connection)));
    await expectLater(client(_Transport([TimeoutException('slow')])).list('en'),
        throwsA(isA<AskError>().having((e) => e.kind, 'kind', AskErrorKind.slow)));
  });
}
