import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/settings/presentation/providers/settings_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(businessProfileProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Settings',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
          ),
        ),
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Business profile card ────────────────────────────
              profileAsync.when(
                data: (profile) {
                  if (profile == null) {
                    return Text(
                      'No profile found.',
                      style: GoogleFonts.inter(color: AppColors.inkTertiary),
                    );
                  }
                  return Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [AppColors.cardShadow],
                    ),
                    child: Column(
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: const BoxDecoration(
                            color: AppColors.primaryContainer,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(LucideIcons.building2, color: AppColors.primary, size: 28),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          profile.name ?? 'Company Name',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        if (profile.email != null)
                          Text(
                            profile.email!,
                            style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary),
                          ),
                        if (profile.phone != null)
                          Text(
                            profile.phone!,
                            style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary),
                          ),
                        const SizedBox(height: 20),
                        const Divider(color: AppColors.outlineVariant, height: 1),
                        const SizedBox(height: 16),
                        _ProfileRow('Address', profile.address ?? 'N/A'),
                        const SizedBox(height: 8),
                        _ProfileRow('Currency', profile.currency ?? 'INR'),
                      ],
                    ),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
                error: (e, _) => Text('Error: $e', style: GoogleFonts.inter(color: AppColors.danger)),
              ),

              const SizedBox(height: 24),

              // ── App preferences ──────────────────────────────────
              Text(
                'APP PREFERENCES',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.08,
                  color: AppColors.inkSecondary,
                ),
              ),
              const SizedBox(height: 12),

              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [AppColors.cardShadow],
                ),
                child: Column(
                  children: [
                    _SettingRow(
                      icon: LucideIcons.bell,
                      iconColor: AppColors.warning,
                      label: 'Push Notifications',
                      trailing: Switch(
                        value: false,
                        onChanged: (v) {},
                        activeThumbColor: AppColors.primary,
                        activeTrackColor: AppColors.primaryContainer,
                      ),
                    ),
                    const Divider(color: AppColors.outlineVariant, height: 1, indent: 60),
                    _SettingRow(
                      icon: LucideIcons.refreshCw,
                      iconColor: AppColors.primary,
                      label: 'Offline Sync Engine',
                      subtitle: 'Background queue active',
                      trailing: const Icon(LucideIcons.checkCircle2, color: AppColors.success, size: 20),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 32),

              // ── Logout ───────────────────────────────────────────
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () async => await supabase.auth.signOut(),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.danger,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: const BorderSide(color: AppColors.danger),
                    ),
                    textStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  child: const Text('Sign Out'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  final String label;
  final String value;

  const _ProfileRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkTertiary)),
        Text(
          value,
          style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.inkPrimary),
        ),
      ],
    );
  }
}

class _SettingRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final String? subtitle;
  final Widget trailing;

  const _SettingRow({
    required this.icon,
    required this.iconColor,
    required this.label,
    this.subtitle,
    required this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: iconColor, size: 18),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkPrimary,
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: GoogleFonts.inter(fontSize: 11, color: AppColors.inkTertiary),
                  ),
              ],
            ),
          ),
          trailing,
        ],
      ),
    );
  }
}
