import 'package:flutter/material.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/glass_panel.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/hr/presentation/hr_screen.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';
import 'package:lucide_icons/lucide_icons.dart';

class MenuScreen extends StatelessWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'More Modules',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(height: 20),
              
              _buildMenuCard(
                context,
                title: 'Finance & Expenses',
                subtitle: 'Track daily expenses and day book',
                icon: LucideIcons.wallet,
                color: AppColors.danger,
                onTap: () {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const FinanceScreen()));
                },
              ),
              
              _buildMenuCard(
                context,
                title: 'HR & Payroll',
                subtitle: 'Manage employees and salaries',
                icon: LucideIcons.briefcase,
                color: AppColors.info,
                onTap: () {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const HRScreen()));
                },
              ),
              
              _buildMenuCard(
                context,
                title: 'Logistics',
                subtitle: 'Routes and vehicle tracking',
                icon: LucideIcons.truck,
                color: AppColors.warning,
                onTap: () {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const LogisticsScreen()));
                },
              ),
              
              const SizedBox(height: 40),
              const Text(
                'System',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 10),
              
              _buildMenuCard(
                context,
                title: 'Settings',
                subtitle: 'Business profile and preferences',
                icon: LucideIcons.settings,
                color: AppColors.inkSecondary,
                onTap: () {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMenuCard(BuildContext context, {required String title, required String subtitle, required IconData icon, required Color color, required VoidCallback onTap}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: GestureDetector(
        onTap: onTap,
        child: GlassPanel(
          padding: const EdgeInsets.all(20),
          borderRadius: 20,
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    Text(subtitle, style: const TextStyle(color: AppColors.inkSecondary, fontSize: 12)),
                  ],
                ),
              ),
              const Icon(LucideIcons.chevronRight, color: AppColors.inkSecondary),
            ],
          ),
        ),
      ),
    );
  }
}
