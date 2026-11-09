import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart' show connectivityProvider;
import 'package:mobile_app/features/ai_chat/data/ask_client.dart';
import 'package:mobile_app/features/ai_chat/data/ask_local.dart';
import 'package:mobile_app/features/ai_chat/presentation/ask_screen.dart';
import 'package:mobile_app/features/ai_chat/presentation/providers/ask_providers.dart';
import 'package:mobile_app/features/ai_chat/presentation/widgets/ask_answer.dart' show AskQuestionRow;
import 'package:mobile_app/features/reports/data/report_params.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';

Map<String, dynamic> _json(String p) => jsonDecode(File(p).readAsStringSync()) as Map<String, dynamic>;

final _strings = _json('../shared/ai_chat/strings.json');
final _registry = _json('../shared/ai_chat/questions.json');
final _cards = _json('../shared/fixtures/ai_chat/cards.json');

class _Local extends AskLocal {
  String? savedLang;
  final lists = <String, Map<String, dynamic>>{};
  _Local({this.savedLang});
  @override
  Future<String?> lang(String userId) async => savedLang;
  @override
  Future<void> setLang(String userId, String lang) async => savedLang = lang;
  @override
  Future<Map<String, dynamic>?> list(String u, String t, String lang) async => lists[lang];
  @override
  Future<void> setList(String u, String t, String lang, Map<String, dynamic> l) async =>
      lists[lang] = {...l}..remove('state')..remove('usage');
}

/// Every question, in a language, as the server would list them.
Map<String, dynamic> _list(String lang, {String state = 'on'}) => {
      'contract_version': 1,
      'state': state,
      'lang': lang,
      'strings': _strings[lang],
      'questions': [
        for (final q in (_registry['questions'] as List).cast<Map<String, dynamic>>())
          {
            'id': q['id'],
            'category': q['category'],
            'label': (q['label'] as Map)[lang],
            'screen_key': (q['screen'] as Map)['key'],
            'mobile': (q['screen'] as Map)['mobile'],
          }
      ],
      'usage': {'used': 63, 'limit': 100, 'resets_on': '2026-12-01'},
    };

Map<String, dynamic> _answer(String id, String lang, {String? text, String? reason}) {
  final c = (_cards['cases'] as List).cast<Map<String, dynamic>>()
      .firstWhere((c) => c['question_id'] == id && c['lang'] == lang && c['empty'] != true);
  final q = (_registry['questions'] as List).cast<Map<String, dynamic>>().firstWhere((q) => q['id'] == id);
  return {
    'contract_version': 1,
    'text': text,
    'reason': reason,
    'card': c['card'],
    'figures': c['figures'],
    'as_of': '2026-11-18T08:42:00Z',
    'screen': {'key': (q['screen'] as Map)['key'], 'mobile': (q['screen'] as Map)['mobile'],
        'params': {'from': '2026-11-18', 'to': '2026-11-18'}},
    'usage': null,
  };
}

class _Client extends AskClient {
  Map<String, dynamic> Function(String lang) onList;
  Map<String, dynamic> Function(String id, String lang)? onAsk;
  Object? listError;
  Object? askError;
  int lists = 0;
  final asked = <String>[];
  final enabled = <bool>[];
  _Client({required this.onList, this.onAsk, this.listError, this.askError});

  @override
  Future<Map<String, dynamic>> list(String lang) async {
    lists++;
    if (listError != null) throw listError!;
    return onList(lang);
  }

  @override
  Future<Map<String, dynamic>> ask(String questionId, String lang) async {
    asked.add(questionId);
    if (askError != null) throw askError!;
    return onAsk!(questionId, lang);
  }

  @override
  Future<void> setEnabled(bool on) async => enabled.add(on);
}

const _owner = TenantContext(
  userProfile: UserProfile(id: 'u1', email: 'o@example.com', name: 'O', roles: ['OWNER'], tenantId: 't1'),
  tenant: Tenant(id: 't1', name: 'Demo', slug: 'demo', plan: 'GROWTH', status: 'ACTIVE'),
);

final _salesReads = <ReportParams>[];

Future<void> _pump(WidgetTester t, _Client client, {_Local? local, ConnectivityResult conn = ConnectivityResult.wifi,
    double width = 390, double height = 844}) async {
  t.view.physicalSize = Size(width, height);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
  await t.pumpWidget(ProviderScope(
    overrides: [
      tenantContextProvider.overrideWith((ref) async => _owner),
      connectivityProvider.overrideWith((ref) => Stream.value(conn)),
      askClientProvider.overrideWithValue(client),
      askLocalProvider.overrideWithValue(local ?? _Local(savedLang: 'en')),
      askBundledStringsProvider.overrideWith((ref) async => _strings),
      reportSalesProvider.overrideWith((ref, p) async {
        _salesReads.add(p);
        return const <Map<String, dynamic>>[];
      }),
    ],
    child: MaterialApp(home: Builder(
      builder: (c) => Scaffold(body: Center(child: TextButton(
        onPressed: () => Navigator.of(c).push(MaterialPageRoute(builder: (_) => const AskScreen())),
        child: const Text('open'),
      ))),
    )),
  ));
  await t.tap(find.text('open'));
  await _settle(t);
}

Future<void> _settle(WidgetTester t) async {
  for (var i = 0; i < 8; i++) {
    await t.pump(const Duration(milliseconds: 50));
  }
}

String _ui(String lang, String key) => '${((_strings[lang] as Map)['ui'] as Map)[key]}';

void main() {
  testWidgets('lists the questions by category, with the usage line', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l)));
    expect(t.takeException(), isNull);
    expect(find.text(_ui('en', 'category_sales')), findsOneWidget);
    expect(find.text('How much did I sell today?'), findsOneWidget);
    final usage = find.text('63 of 100 explanations used in November. Figures never count.');
    await t.scrollUntilVisible(usage, 200, scrollable: find.byType(Scrollable).first);
    expect(usage, findsOneWidget);
  });

  testWidgets('an answer: hero, AI text, figures, and a link to the phone screen', (t) async {
    final c = _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, text: 'You sold ₹1,84,620.00 today.'));
    await _pump(t, c);
    await t.tap(find.text('How much did I sell today?'));
    await _settle(t);
    expect(c.asked, ['sales_today']);
    expect(find.text('₹1,84,620.00', findRichText: true), findsWidgets);
    expect(find.text(_ui('en', 'ai_label')), findsOneWidget);
    expect(find.text(_ui('en', 'from_books')), findsOneWidget);
    // No link for this one: see askDroppedScreens.
    expect(find.byKey(const Key('ask-go')), findsNothing);
  });

  testWidgets('a question with no phone screen shows no link', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, text: 'x')));
    await t.tap(find.text('What is my profit this month?'));
    await _settle(t);
    expect(find.byKey(const Key('ask-go')), findsNothing);
  });

  testWidgets('Back returns to the list where the owner left it', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, text: 'x')), height: 520);
    final list = find.byKey(const Key('ask-list'));
    await t.drag(list, const Offset(0, -300));
    await _settle(t);
    final before = t.widget<ListView>(list).controller!.offset;
    expect(before, greaterThan(100));
    // Whichever question is on screen down there.
    await t.tap(find.byType(AskQuestionRow).hitTestable().first);
    await _settle(t);
    expect(list, findsNothing);
    await t.tap(find.byTooltip('Back'));
    await _settle(t);
    expect(t.widget<ListView>(find.byKey(const Key('ask-list'))).controller!.offset, closeTo(before, 0.5));
  });

  testWidgets('the system back from an answer goes to the list, not out of Ask', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, text: 'x')));
    await t.tap(find.text('Who owes me the most?'));
    await _settle(t);
    await t.binding.handlePopRoute();
    await _settle(t);
    expect(find.byKey(const Key('ask-list')), findsOneWidget);
  });

  testWidgets('figures only: the reason is said, the figures stay', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, reason: 'guard_rejected')));
    await t.tap(find.text('How much did I sell today?'));
    await _settle(t);
    expect(find.text(_ui('en', 'figures_only')), findsOneWidget);
    expect(find.text(_ui('en', 'reason_guard_rejected')), findsOneWidget);
    expect(find.text('₹1,84,620.00', findRichText: true), findsWidgets);
  });

  testWidgets('quota reached names the month and the reset day', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, reason: 'quota_reached')));
    await t.tap(find.text('How much did I sell today?'));
    await _settle(t);
    expect(find.text('You have used all 100 explanations for November. They return on 1 Dec. Your figures keep working.'),
        findsOneWidget);
    expect(find.text(_ui('en', 'see_plans')), findsOneWidget);
  });

  testWidgets('a failed read says why and shows no number', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), askError: const AskError(AskErrorKind.slow)));
    await t.tap(find.text('How much did I sell today?'));
    await _settle(t);
    expect(find.text(_ui('en', 'error_title')), findsOneWidget);
    expect(find.textContaining(_ui('en', 'error_slow')), findsOneWidget);
    expect(find.textContaining('₹'), findsNothing);
    expect(find.text(_ui('en', 'retry')), findsOneWidget);
  });

  testWidgets('off until the owner turns it on', (t) async {
    var state = 'off';
    final c = _Client(onList: (l) => _list(l, state: state));
    await _pump(t, c);
    expect(find.text(_ui('en', 'on_title')), findsOneWidget);
    expect(find.text(_ui('en', 'never_1')), findsOneWidget);
    expect(find.text('How much did I sell today?'), findsNothing);
    state = 'on';
    await t.ensureVisible(find.text(_ui('en', 'turn_on')));
    await _settle(t);
    await t.tap(find.text(_ui('en', 'turn_on')));
    await _settle(t);
    expect(c.enabled, [true]);
    expect(find.text('How much did I sell today?'), findsOneWidget);
  });

  testWidgets('staff are told Ask is for the owner', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), listError: const AskError(AskErrorKind.reason, reason: 'not_owner')));
    expect(find.text(_ui('en', 'staff_title')), findsOneWidget);
    expect(find.text('हिन्दी'), findsNothing);
  });

  testWidgets('offline with a saved list: Needs internet, questions shown but disabled, no call', (t) async {
    final local = _Local(savedLang: 'en')..lists['en'] = _list('en');
    final c = _Client(onList: (l) => _list(l));
    await _pump(t, c, local: local, conn: ConnectivityResult.none);
    expect(c.lists, 0);
    expect(find.textContaining(_ui('en', 'offline_title')), findsOneWidget);
    await t.tap(find.text('How much did I sell today?'));
    await _settle(t);
    expect(c.asked, isEmpty);
  });

  testWidgets('offline with nothing saved: only the message', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l)), conn: ConnectivityResult.none);
    expect(find.text(_ui('en', 'offline_title')), findsOneWidget);
    expect(find.text(_ui('en', 'offline_body')), findsOneWidget);
  });

  testWidgets('switching to Hindi reloads the list in Hindi and remembers it', (t) async {
    final local = _Local(savedLang: 'en');
    await _pump(t, _Client(onList: (l) => _list(l)), local: local);
    await t.tap(find.text('हिन्दी'));
    await _settle(t);
    expect(local.savedLang, 'hi');
    expect(find.text('आज मैंने कितनी बिक्री की?'), findsOneWidget);
  });

  testWidgets('Hindi at 360dp: the list and every answer fit', (t) async {
    final c = _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, text: 'बिक्री ₹1,84,620.00 रही।'));
    await _pump(t, c, local: _Local(savedLang: 'hi'), width: 360, height: 780);
    expect(t.takeException(), isNull);
    for (final q in (_registry['questions'] as List).cast<Map<String, dynamic>>()) {
      final label = (q['label'] as Map)['hi'] as String;
      await t.scrollUntilVisible(find.text(label), 80, scrollable: find.byType(Scrollable).first);
      await t.tap(find.text(label));
      await _settle(t);
      expect(t.takeException(), isNull, reason: q['id'] as String);
      expect(find.byKey(const Key('ask-hero')), findsOneWidget);
      await t.tap(find.byTooltip('Back'));
      await _settle(t);
    }
  });

  testWidgets('a shop without Ask yet: the server says not_enabled, the phone says so', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), listError: const AskError(AskErrorKind.reason, reason: 'not_enabled')));
    expect(find.text(_ui('en', 'reason_not_enabled')), findsOneWidget);
    expect(find.text('How much did I sell today?'), findsNothing);
    expect(find.text('हिन्दी'), findsNothing);
  });

  testWidgets('a lost connection says "Connection lost."', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), askError: const AskError(AskErrorKind.connection)));
    await t.tap(find.text('How much did I sell today?'));
    await _settle(t);
    expect(_ui('en', 'error_connection'), 'Connection lost.');
    expect(find.text('Connection lost. ${_ui('en', 'error_nothing')}'), findsOneWidget);
  });

  testWidgets('a failed read on the server says the server could not read the books', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l),
        askError: const AskError(AskErrorKind.reason, reason: 'read_failed')));
    await t.tap(find.text('How much did I sell today?'));
    await _settle(t);
    expect(_ui('en', 'error_read'), 'The server could not read your books.');
    expect(find.text('The server could not read your books. ${_ui('en', 'error_nothing')}'), findsOneWidget);
    expect(find.text(_ui('en', 'retry')), findsOneWidget);
  });

  testWidgets('switching language keeps the question, and asks again only on a tap', (t) async {
    final c = _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, text: 'x'));
    await _pump(t, c);
    await t.tap(find.text('How much did I sell today?'));
    await _settle(t);
    expect(c.asked, ['sales_today']);
    await t.tap(find.text('हिन्दी'));
    await _settle(t);
    expect(c.asked, ['sales_today'], reason: 'never automatic: asking uses an explanation');
    expect(find.text('आज मैंने कितनी बिक्री की?'), findsOneWidget);
    expect(find.text(_ui('hi', 'stale_note')), findsOneWidget);
    await t.tap(find.text(_ui('hi', 'ask_again')));
    await _settle(t);
    expect(c.asked, ['sales_today', 'sales_today']);
    expect(find.byKey(const Key('ask-hero')), findsOneWidget);
  });

  testWidgets('"sold today" has no phone link until the screen ties', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, text: 'x')));
    await t.tap(find.text('How much did I sell today?'));
    await _settle(t);
    expect(find.byKey(const Key('ask-hero')), findsOneWidget);
    expect(find.byKey(const Key('ask-go')), findsNothing);
  });

  testWidgets('a linked answer still opens its screen', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, text: 'x')));
    await t.tap(find.text('Who owes me the most?'));
    await _settle(t);
    expect(find.text('Open Customers'), findsOneWidget);
  });

  testWidgets('GST collected has no phone link: GSTR-3B would show another number', (t) async {
    await _pump(t, _Client(onList: (l) => _list(l), onAsk: (id, l) => _answer(id, l, text: 'x')));
    final q = find.text('How much GST did I collect this month?');
    await t.scrollUntilVisible(q, 120, scrollable: find.byType(Scrollable).first);
    await t.tap(q);
    await _settle(t);
    expect(find.byKey(const Key('ask-hero')), findsOneWidget);
    expect(find.byKey(const Key('ask-go')), findsNothing);
  });
}
