import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/features/ai_chat/data/ask_client.dart';
import 'package:mobile_app/features/ai_chat/presentation/ask_screen.dart' show AskConsentScreen;
import 'package:mobile_app/features/ai_chat/presentation/providers/ask_providers.dart';

/// The Ask switch in Settings. Turning it on goes through the consent notice;
/// turning it off is direct. Hidden for staff and for shops without Ask, so
/// the notice's "turn it off in Settings" is true wherever Ask exists.
class AskSettingRow extends ConsumerStatefulWidget {
  const AskSettingRow({super.key});

  @override
  ConsumerState<AskSettingRow> createState() => _AskSettingRowState();
}

class _AskSettingRowState extends ConsumerState<AskSettingRow> {
  bool _busy = false;

  Future<void> _set(bool on) async {
    final messenger = ScaffoldMessenger.of(context);
    if (on) {
      final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => const AskConsentScreen()),
      );
      if (ok == true) ref.invalidate(askTenantProvider);
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(askClientProvider).setEnabled(false);
      ref.invalidate(askTenantProvider);
    } on AskError catch (e) {
      debugPrint('[ask] turn off failed: $e');
      messenger.showSnackBar(SnackBar(
        content: Text('Could not turn Ask off: ${e.message ?? e}'),
        backgroundColor: AppColors.danger,
      ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final flags = ref.watch(askTenantProvider).valueOrNull;
    if (flags == null || !flags.available) return const SizedBox.shrink();
    final strings = ref.watch(askBundledStringsProvider).valueOrNull;
    final uid = ref.watch(tenantContextProvider).valueOrNull?.userProfile.id ?? '';
    final lang = ref.watch(askSavedLangProvider(uid)).valueOrNull ?? askDeviceLang();
    final ui = (strings?[lang] as Map?)?['ui'] as Map?;
    return Column(children: [
      const Divider(color: AppColors.outlineVariant, height: 1, indent: 60),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(LucideIcons.messageSquare, color: AppColors.primary, size: 18),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${ui?['entry_title'] ?? 'Ask about your shop'}',
                  style: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.inkPrimary)),
              if (ui?['tagline'] != null)
                Text('${ui!['tagline']}', style: AppText.caption.copyWith(color: AppColors.inkTertiary)),
            ]),
          ),
          Switch(
            key: const Key('ask-setting'),
            value: flags.enabled,
            onChanged: _busy ? null : _set,
            activeThumbColor: AppColors.primary,
            activeTrackColor: AppColors.primaryContainer,
          ),
        ]),
      ),
    ]);
  }
}
