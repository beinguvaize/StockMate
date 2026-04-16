import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/features/settings/presentation/providers/settings_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(businessProfileProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('System Settings', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppColors.inkPrimary,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Business Profile', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              profileAsync.when(
                data: (profile) {
                  if (profile == null) return const Text('No profile found.');
                  return GlassPanel(
                    padding: const EdgeInsets.all(20),
                    borderRadius: 20,
                    child: Column(
                      children: [
                        const CircleAvatar(
                          radius: 30,
                          backgroundColor: AppColors.accentSignature,
                          child: Icon(LucideIcons.building, color: Colors.black, size: 30),
                        ),
                        const SizedBox(height: 16),
                        Text(profile.name ?? 'Company Name', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
                        const SizedBox(height: 8),
                        Text(profile.email ?? 'No email', style: const TextStyle(color: AppColors.inkSecondary)),
                        Text(profile.phone ?? 'No phone', style: const TextStyle(color: AppColors.inkSecondary)),
                        const SizedBox(height: 16),
                        const Divider(color: Colors.white24),
                        const SizedBox(height: 16),
                        _buildSettingRow('Address', profile.address ?? 'N/A'),
                        _buildSettingRow('Base Currency', profile.currency ?? 'INR'),
                      ],
                    ),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text('Error: $e'),
              ),
              const SizedBox(height: 40),
              const Text('App Preferences', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              GlassPanel(
                padding: const EdgeInsets.all(8),
                borderRadius: 16,
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(LucideIcons.bell, color: AppColors.inkPrimary),
                      title: const Text('Push Notifications'),
                      trailing: Switch(value: false, onChanged: (v) {}),
                    ),
                    ListTile(
                      leading: const Icon(LucideIcons.globe, color: AppColors.inkPrimary),
                      title: const Text('Offline Sync Engine'),
                      subtitle: const Text('Background queue active'),
                      trailing: const Icon(LucideIcons.checkCircle, color: AppColors.success),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSettingRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.inkSecondary)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
