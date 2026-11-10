import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/widgets.dart' show WidgetsBinding;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/ai_chat/data/ask_client.dart';
import 'package:mobile_app/features/ai_chat/data/ask_local.dart';

final askClientProvider = Provider<AskClient>((ref) => AskClient());
final askLocalProvider = Provider<AskLocal>((ref) => const AskLocal());

/// The bundled copy of shared/ai_chat/strings.json: the words for first run and
/// offline, before any list has come from the server.
final askBundledStringsProvider = FutureProvider<Map<String, dynamic>>((ref) async =>
    jsonDecode(await rootBundle.loadString('assets/ai_chat/strings.json')) as Map<String, dynamic>);

/// Question ids the server registry marks hidden (not shown to any shop until
/// they tie to their screen). Applied to every list, the saved one included,
/// so a list cached before a question was hidden never offers it.
final askHiddenQuestionsProvider = FutureProvider<Set<String>>((ref) async {
  final reg = jsonDecode(await rootBundle.loadString('assets/ai_chat/questions.json')) as Map<String, dynamic>;
  return askHiddenIds(reg);
});

Set<String> askHiddenIds(Map<String, dynamic> registry) => {
      for (final q in (registry['questions'] as List).cast<Map<String, dynamic>>())
        if (q['hidden'] == true) q['id'] as String,
    };

/// Who may see the entry. The server decides (is_tenant_admin); this only
/// keeps the row off staff dashboards.
bool askMaySee(List<String> roles) => roles.contains('OWNER') || roles.contains('GLOBAL_ADMIN');

/// Hindi when the phone is set to Hindi, otherwise English.
String askDeviceLang() =>
    WidgetsBinding.instance.platformDispatcher.locale.languageCode == 'hi' ? 'hi' : 'en';

/// The language this user chose in Ask, if any.
final askSavedLangProvider =
    FutureProvider.family<String?, String>((ref, uid) => ref.read(askLocalProvider).lang(uid));

/// The per-tenant flag that makes Ask available to a shop at all. ASSUMED NAME:
/// confirm with the Senior Developer's migration before release. Until a shop
/// has it, Ask stays out of sight on the phone.
const askFeatureFlagKey = 'ai_chat_available';

class AskTenantFlags {
  /// Ask is offered to this shop.
  final bool available;
  /// The owner has turned it on (tenants.settings.ai_enabled, set by ai_set_enabled).
  final bool enabled;
  const AskTenantFlags({required this.available, required this.enabled});
  static const hidden = AskTenantFlags(available: false, enabled: false);
}

/// tenants.settings for a shop. A provider so tests can stand in for it.
final askTenantSettingsReaderProvider = Provider<Future<Map> Function(String tenantId)>((ref) => (tenantId) async {
      final row = await supabase.from('tenants').select('settings').eq('id', tenantId).maybeSingle();
      return (row?['settings'] as Map?) ?? const {};
    });

/// Reads both flags from the shop's settings. A failed read hides Ask rather
/// than offering something the shop may not have.
final askTenantProvider = FutureProvider.autoDispose<AskTenantFlags>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null || !askMaySee(ctx.roles)) return AskTenantFlags.hidden;
  try {
    final settings = await ref.read(askTenantSettingsReaderProvider)(ctx.tenantId);
    return AskTenantFlags(
      available: settings[askFeatureFlagKey] == true,
      enabled: settings['ai_enabled'] == true,
    );
  } catch (e) {
    debugPrint('[ask] tenant flags failed: $e');
    return AskTenantFlags.hidden;
  }
});
