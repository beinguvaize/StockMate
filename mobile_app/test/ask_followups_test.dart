import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/features/ai_chat/data/ask_client.dart';
import 'package:mobile_app/features/ai_chat/data/ask_local.dart';
import 'package:mobile_app/features/ai_chat/presentation/ask_screen.dart';
import 'package:mobile_app/features/ai_chat/presentation/ask_setting_row.dart';
import 'package:mobile_app/features/ai_chat/presentation/providers/ask_providers.dart';
import 'package:mobile_app/features/ai_chat/presentation/widgets/ask_answer.dart' show askConsentParagraphs;

final _strings = jsonDecode(File('../shared/ai_chat/strings.json').readAsStringSync()) as Map<String, dynamic>;
String _ui(String lang, String k) => '${((_strings[lang] as Map)['ui'] as Map)[k]}';

TenantContext _ctx(List<String> roles) => TenantContext(
      userProfile: UserProfile(id: 'u1', email: 'o@example.com', name: 'O', roles: roles, tenantId: 't1'),
      tenant: const Tenant(id: 't1', name: 'Demo', slug: 'demo', plan: 'GROWTH', status: 'ACTIVE'),
    );

class _Local extends AskLocal {
  final String? saved;
  const _Local(this.saved);
  @override
  Future<String?> lang(String userId) async => saved;
}

class _Client extends AskClient {
  final enabled = <bool>[];
  Object? error;
  _Client();
  @override
  Future<void> setEnabled(bool on) async {
    if (error != null) throw error!;
    enabled.add(on);
  }
}

void main() {
  group('the per-tenant flag', () {
    Future<AskTenantFlags> read(List<String> roles, Future<Map> Function(String) reader) async {
      final c = ProviderContainer(overrides: [
        tenantContextProvider.overrideWith((ref) async => _ctx(roles)),
        askTenantSettingsReaderProvider.overrideWithValue(reader),
      ]);
      addTearDown(c.dispose);
      return c.read(askTenantProvider.future);
    }

    test('on for the shop, read for the owner', () async {
      final f = await read(['OWNER'], (_) async => {askFeatureFlagKey: true, 'ai_enabled': false});
      expect(f.available, isTrue);
      expect(f.enabled, isFalse);
    });

    test('a shop without the flag does not see Ask', () async {
      expect((await read(['OWNER'], (_) async => {'ai_enabled': true})).available, isFalse);
    });

    test('staff never see it, and the shop row is not even read', () async {
      var reads = 0;
      final f = await read(['STAFF'], (_) async {
        reads++;
        return {askFeatureFlagKey: true};
      });
      expect(f.available, isFalse);
      expect(reads, 0);
    });

    test('a failed read hides Ask', () async {
      expect((await read(['OWNER'], (_) async => throw Exception('rls'))).available, isFalse);
    });
  });

  Future<_Client> pump(WidgetTester t, Widget child, {String? saved, Map flags = const {}}) async {
    final client = _Client();
    t.view.physicalSize = const Size(390, 1600);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(ProviderScope(
      overrides: [
        tenantContextProvider.overrideWith((ref) async => _ctx(['OWNER'])),
        askTenantSettingsReaderProvider.overrideWithValue((_) async => flags),
        askBundledStringsProvider.overrideWith((ref) async => _strings),
        askLocalProvider.overrideWithValue(_Local(saved)),
        askClientProvider.overrideWithValue(client),
      ],
      child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: Column(children: [child])))),
    ));
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 50));
    }
    return client;
  }

  group('the dashboard row', () {
    testWidgets('speaks the language the owner chose in Ask', (t) async {
      await pump(t, AskEntryRow(onTap: () {}), saved: 'hi');
      expect(find.text(_ui('hi', 'entry_title')), findsOneWidget);
    });
    testWidgets('falls back to the phone language', (t) async {
      await pump(t, AskEntryRow(onTap: () {}));
      expect(find.text(_ui('en', 'entry_title')), findsOneWidget);
    });
  });

  group('the Settings switch', () {
    testWidgets('is hidden where the shop does not have Ask', (t) async {
      await pump(t, const AskSettingRow(), flags: {'ai_enabled': true});
      expect(find.byKey(const Key('ask-setting')), findsNothing);
    });

    testWidgets('turning on goes through the consent notice, with the agreed text', (t) async {
      final c = await pump(t, const AskSettingRow(), flags: {askFeatureFlagKey: true, 'ai_enabled': false});
      expect(t.widget<Switch>(find.byKey(const Key('ask-setting'))).value, isFalse);
      await t.tap(find.byKey(const Key('ask-setting')));
      for (var i = 0; i < 8; i++) {
        await t.pump(const Duration(milliseconds: 50));
      }
      expect(c.enabled, isEmpty, reason: 'nothing is switched before consent');
      expect(find.text(_ui('en', 'on_title')), findsOneWidget);
      final shown = t.widgetList<Text>(find.byKey(const Key('ask-on-fine'))).map((w) => w.data).toList();
      expect(shown, ((_strings['en'] as Map)['ui'] as Map)['on_fine_paragraphs']);
      expect(shown, hasLength(3));
      expect(find.byKey(const Key('ask-on-fine-review')), findsNothing, reason: 'English has no review tag');
      await t.ensureVisible(find.text(_ui('en', 'turn_on')));
      await t.tap(find.text(_ui('en', 'turn_on')));
      for (var i = 0; i < 8; i++) {
        await t.pump(const Duration(milliseconds: 50));
      }
      expect(c.enabled, [true]);
      await t.pumpAndSettle();
      expect(find.text(_ui('en', 'on_title')), findsNothing, reason: 'the notice closes once Ask is on');
    });

    testWidgets('Not now changes nothing', (t) async {
      final c = await pump(t, const AskSettingRow(), flags: {askFeatureFlagKey: true, 'ai_enabled': false});
      await t.tap(find.byKey(const Key('ask-setting')));
      for (var i = 0; i < 8; i++) {
        await t.pump(const Duration(milliseconds: 50));
      }
      await t.ensureVisible(find.text(_ui('en', 'not_now')));
      await t.tap(find.text(_ui('en', 'not_now')));
      for (var i = 0; i < 8; i++) {
        await t.pump(const Duration(milliseconds: 50));
      }
      expect(c.enabled, isEmpty);
    });

    testWidgets('turning off is direct', (t) async {
      final c = await pump(t, const AskSettingRow(), flags: {askFeatureFlagKey: true, 'ai_enabled': true});
      await t.tap(find.byKey(const Key('ask-setting')));
      await t.pump();
      expect(c.enabled, [false]);
      expect(find.text(_ui('en', 'on_title')), findsNothing);
    });

    testWidgets('a failed turn-off says why', (t) async {
      final c = await pump(t, const AskSettingRow(), flags: {askFeatureFlagKey: true, 'ai_enabled': true});
      c.error = const AskError(AskErrorKind.reason, reason: 'read_failed', message: 'permission denied');
      await t.tap(find.byKey(const Key('ask-setting')));
      await t.pump();
      await t.pump();
      expect(find.text('Could not turn Ask off: permission denied'), findsOneWidget);
    });
  });

  testWidgets('the Hindi notice carries its review tag until it is signed off', (t) async {
    await pump(t, const AskSettingRow(), saved: 'hi', flags: {askFeatureFlagKey: true, 'ai_enabled': false});
    await t.tap(find.byKey(const Key('ask-setting')));
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 50));
    }
    expect(find.text(_ui('hi', 'on_fine_review')), findsOneWidget);
    expect(t.widgetList<Text>(find.byKey(const Key('ask-on-fine'))).map((w) => w.data).toList(),
        ((_strings['hi'] as Map)['ui'] as Map)['on_fine_paragraphs']);
  });

  test('older strings without on_fine_paragraphs fall back to on_fine', () {
    expect(askConsentParagraphs({'on_fine': 'a\nb'}), ['a', 'b']);
  });
}
