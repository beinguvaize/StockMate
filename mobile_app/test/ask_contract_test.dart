// The phone's side of the ai-ask contract, held to shared/ai_chat and
// shared/fixtures/ai_chat. The web suite (src/lib/askCards.shared.test.js)
// checks the same fixtures against cards.ts and askFormat.js.

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/ai_chat/data/ask_client.dart';
import 'package:mobile_app/features/ai_chat/data/ask_format.dart';
import 'package:mobile_app/features/ai_chat/presentation/ask_routes.dart';
import 'package:mobile_app/features/ai_chat/presentation/providers/ask_providers.dart' show askHiddenIds;
import 'package:mobile_app/features/ai_chat/presentation/widgets/ask_answer.dart';

Map<String, dynamic> _json(String path) => jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;

void main() {
  final strings = _json('../shared/ai_chat/strings.json');
  final registry = _json('../shared/ai_chat/questions.json');
  final cards = _json('../shared/fixtures/ai_chat/cards.json');
  final format = _json('../shared/fixtures/ai_chat/format.json');

  test('the app bundles an exact copy of shared/ai_chat/strings.json', () {
    expect(File('assets/ai_chat/strings.json').readAsStringSync(),
        File('../shared/ai_chat/strings.json').readAsStringSync());
  });

  test('the app bundles an exact copy of shared/ai_chat/questions.json', () {
    expect(File('assets/ai_chat/questions.json').readAsStringSync(),
        File('../shared/ai_chat/questions.json').readAsStringSync());
  });

  test('hidden questions come from the registry', () {
    expect(askHiddenIds(registry), {'expiring_stock'});
  });

  test('the phone speaks the contract version the server sends', () {
    expect(registry['contract_version'], askContractVersion);
    expect(cards['contract_version'], askContractVersion);
  });

  group('formatValue', () {
    for (final c in (format['formatValue'] as List).cast<Map<String, dynamic>>()) {
      test('${c['kind']} ${jsonEncode(c['value'])}', () {
        expect(askFormatValue(c['value'], c['kind'] as String, strings[c['lang']] as Map<String, dynamic>), c['expect']);
      });
    }
  });

  group('usageVars', () {
    for (final c in (format['usageVars'] as List).cast<Map<String, dynamic>>()) {
      test('${(c['usage'] as Map)['resets_on']}', () {
        final v = askUsageVars(c['usage'] as Map<String, dynamic>, strings[c['lang']] as Map<String, dynamic>);
        (c['expect'] as Map).forEach((k, e) => expect(v[k], e));
      });
    }
  });

  group('splitNumbers', () {
    for (final c in (format['splitNumbers'] as List).cast<Map<String, dynamic>>()) {
      test('${c['text']}', () {
        expect(askSplitNumbers(c['text'] as String).where((p) => p.number).map((p) => p.part).toList(), c['numbers']);
      });
    }
  });

  group('screen keys', () {
    test('every question the server marks as having a phone screen has one, labelled', () {
      for (final q in (registry['questions'] as List).cast<Map<String, dynamic>>()) {
        final screen = q['screen'] as Map<String, dynamic>;
        for (final key in [screen['key'], screen['fallback_key']].whereType<String>()) {
          final mobileKey = askMobileKey({'key': key, 'mobile': screen['mobile']});
          if (screen['mobile'] == true && askDroppedScreens.containsKey(key)) {
            expect(mobileKey, isNull, reason: '$key is dropped on the phone: ${askDroppedScreens[key]}');
          } else if (screen['mobile'] == true) {
            expect(mobileKey, key, reason: '${q['id']} → $key has no phone screen');
            for (final lang in ['en', 'hi']) {
              expect(askLinkLabel(mobileKey, strings[lang] as Map<String, dynamic>), isNotNull);
            }
          } else {
            expect(mobileKey, isNull, reason: '${q['id']} has no phone screen, so no link');
          }
        }
      }
    });

    test('an unknown key draws no link', () {
      expect(askMobileKey({'key': 'not_a_screen', 'mobile': true}), isNull);
      expect(askMobileKey(null), isNull);
    });
  });

  group('every fixture card draws', () {
    for (final c in (cards['cases'] as List).cast<Map<String, dynamic>>()) {
      final name = '${c['question_id']} ${c['lang']}${c['empty'] == true ? ' empty' : ''}${c['note'] != null ? ' ${c['note']}' : ''}';
      for (final width in [360.0, 412.0]) {
        testWidgets('$name at ${width.toInt()}dp', (t) async {
          t.view.physicalSize = Size(width, 2400);
          t.view.devicePixelRatio = 1;
          addTearDown(t.view.reset);
          final s = strings[c['lang']] as Map<String, dynamic>;
          final card = c['card'] as Map<String, dynamic>;
          await t.pumpWidget(MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: AskAnswerView(
                  answer: {'card': card, 'text': 'From the figures.', 'reason': null, 'as_of': '2026-11-18T08:42:00Z'},
                  questionLabel: 'Q',
                  strings: s,
                  usage: const {'used': 63, 'limit': 100, 'resets_on': '2026-12-01'},
                  also: const [],
                  onRetry: () {},
                  onPlans: () {},
                  onAsk: (_) {},
                ),
              ),
            ),
          ));
          expect(t.takeException(), isNull);
          final hero = card['hero'] as Map<String, dynamic>;
          final heroText = askFormatValue(hero['value'], hero['kind'] as String, s);
          expect(find.textContaining(heroText, findRichText: true), findsWidgets);
          for (final r in [...(card['rows'] as List), ...(card['rows_after'] as List)].cast<Map<String, dynamic>>()) {
            expect(find.text('${r['label']}'), findsWidgets, reason: 'row ${r['label']}');
          }
          if (card['footnote'] != null) {
            expect(find.textContaining('${card['footnote']}'.substring(0, 20), findRichText: true), findsOneWidget,
                reason: 'footnote drawn');
          }
          final table = card['table'] as Map<String, dynamic>?;
          if (table != null) {
            for (final col in (table['columns'] as List).cast<Map<String, dynamic>>()) {
              expect(find.text('${col['label']}'), findsWidgets);
            }
            expect(find.byKey(const Key('ask-row-0')), findsOneWidget);
            // Bars are drawn at their share: the fill is really that wide.
            final bars = (table['bars'] as List?) ?? const [];
            for (var i = 0; i < bars.length; i++) {
              final fill = t.getSize(find.byKey(Key('ask-bar-$i'))).width;
              final track = t.getSize(find.ancestor(of: find.byKey(Key('ask-bar-$i')), matching: find.byType(Stack)).first).width;
              expect(fill / track, closeTo((bars[i] as num) / 100, 0.01), reason: 'bar $i');
            }
          }
        });
      }
    }
  });

  group('footnotes the server chose, drawn as sent', () {
    Map<String, dynamic> card(String id, String lang, [String? note]) =>
        (cards['cases'] as List).cast<Map<String, dynamic>>().firstWhere((c) =>
            c['question_id'] == id && c['lang'] == lang && c['note'] == note && c['empty'] != true)['card']
            as Map<String, dynamic>;

    Future<void> draw(WidgetTester t, Map<String, dynamic> c, String lang) async {
      t.view.physicalSize = const Size(360, 2400);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: AskAnswerView(
              answer: {'card': c, 'text': null, 'reason': 'ai_off', 'as_of': '2026-11-18T08:42:00Z'},
              questionLabel: 'Q',
              strings: strings[lang] as Map<String, dynamic>,
              usage: null,
              also: const [],
              onRetry: () {},
              onPlans: () {},
              onAsk: (_) {},
            ),
          ),
        ),
      ));
      expect(t.takeException(), isNull);
    }

    String foot(String lang, String key) => '${(strings[lang] as Map)['footnotes'][key]}';

    for (final lang in ['en', 'hi']) {
      testWidgets('GST beyond rounding: one plain line, no gap figures ($lang)', (t) async {
        final c = card('gst_collected', lang);
        expect(c['footnote'], foot(lang, 'gst_screen_unmatched'));
        await draw(t, c, lang);
        expect(find.text(foot(lang, 'gst_screen_unmatched'), findRichText: true), findsOneWidget);
      });

      testWidgets('a loan account that owes money is worded as owed, not "-₹" ($lang)', (t) async {
        final c = card('cash_bank', lang);
        final f = '${c['footnote']}';
        expect(f, contains('₹1,50,000.00'));
        expect(f, isNot(contains('-₹')));
        await draw(t, c, lang);
        expect(find.textContaining('₹1,50,000.00', findRichText: true), findsWidgets);
      });
    }

    testWidgets('GST within rounding names the gap', (t) async {
      final c = card('gst_collected', 'en', 'gst_within_rounding');
      expect('${c['footnote']}', startsWith('GSTR-3B shows ₹1.20 more GST'));
      await draw(t, c, 'en');
      expect(find.textContaining('₹1.20', findRichText: true), findsWidgets);
    });

    testWidgets('GST that ties draws no footnote at all', (t) async {
      final c = card('gst_collected', 'en', 'gst_tied');
      expect(c['footnote'], isNull);
      await draw(t, c, 'en');
      expect(find.textContaining('GSTR-3B'), findsNothing);
    });

    test('review_pending is metadata: the phone reads no such key', () {
      for (final f in Directory('lib/features/ai_chat').listSync(recursive: true).whereType<File>()) {
        expect(f.readAsStringSync().contains('review_pending'), isFalse, reason: f.path);
      }
    });
  });
}
