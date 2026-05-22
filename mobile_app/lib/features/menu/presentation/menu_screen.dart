import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/hr/presentation/hr_screen.dart';
import 'package:mobile_app/features/logistics/presentation/driver_route_screen.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';

class MenuScreen extends ConsumerWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'More',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 20),

              tenantAsync.when(
                data: (ctx) {
                  final roles = ctx?.userRoles ?? [];
                  final plan = ctx?.plan ?? 'STARTER';
                  final permissions = ctx?.permissions;
                  final name = ctx?.userProfile.name ?? ctx?.userProfile.email ?? 'User';

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // ── Profile header card ──────────────────
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 52,
                              height: 52,
                              decoration: const BoxDecoration(
                                color: AppColors.secondaryContainer,
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  name.isNotEmpty ? name[0].toUpperCase() : 'U',
                                  style: GoogleFonts.hankenGrotesk(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    name,
                                    style: GoogleFonts.hankenGrotesk(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    ctx?.tenant.name ?? '',
                                    style: GoogleFonts.inter(
                                      fontSize: 12,
                                      color: Colors.white60,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.primaryContainer,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                plan,
                                style: GoogleFonts.inter(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.primary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 24),

                      // ── Menu section ─────────────────────────
                      _SectionLabel('Modules'),
                      const SizedBox(height: 12),

                      _MenuCard(
                        icon: LucideIcons.wallet,
                        iconColor: const Color(0xFFe6a817),
                        label: 'Finance & Expenses',
                        subtitle: 'Track daily expenses',
                        feature: 'expenses',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FinanceScreen())),
                      ),
                      _MenuCard(
                        icon: LucideIcons.bookOpen,
                        iconColor: const Color(0xFF2196F3),
                        label: 'Day Book',
                        subtitle: 'All daily transactions',
                        feature: 'daybook',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DayBookScreen())),
                      ),
                      _MenuCard(
                        icon: LucideIcons.shoppingBag,
                        iconColor: const Color(0xFF9C27B0),
                        label: 'Purchases',
                        subtitle: 'Supplier purchases & stock-in',
                        feature: 'purchases',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PurchasesScreen())),
                      ),
                      if (canAccess('reports', roles: roles, plan: plan, permissions: permissions))
                        _MenuCard(
                          icon: LucideIcons.barChart2,
                          iconColor: AppColors.primary,
                          label: 'Reports',
                          subtitle: 'Sales, GST, P&L reports',
                          feature: 'reports',
                          roles: roles,
                          plan: plan,
                          permissions: permissions,
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReportsScreen())),
                        ),
                      if (canAccess('hr', roles: roles, plan: plan, permissions: permissions))
                        _MenuCard(
                          icon: LucideIcons.briefcase,
                          iconColor: const Color(0xFF673AB7),
                          label: 'HR & Payroll',
                          subtitle: 'Manage employees & salaries',
                          feature: 'hr',
                          roles: roles,
                          plan: plan,
                          permissions: permissions,
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HRScreen())),
                        ),
                      if (canAccess('logistics', roles: roles, plan: plan, permissions: permissions))
                        _MenuCard(
                          icon: LucideIcons.truck,
                          iconColor: const Color(0xFFFF9800),
                          label: 'Fleet Management',
                          subtitle: 'Vehicles & route tracking',
                          feature: 'logistics',
                          roles: roles,
                          plan: plan,
                          permissions: permissions,
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LogisticsScreen())),
                        ),
                      _MenuCard(
                        icon: LucideIcons.mapPin,
                        iconColor: AppColors.primaryContainer,
                        label: 'My Route',
                        subtitle: 'Driver view — stops & van sales',
                        feature: 'logistics',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        alwaysShow: true,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DriverRouteScreen())),
                      ),

                      const SizedBox(height: 16),
                      _SectionLabel('System'),
                      const SizedBox(height: 12),

                      _MenuCard(
                        icon: LucideIcons.settings,
                        iconColor: AppColors.inkTertiary,
                        label: 'Settings',
                        subtitle: 'Business profile & preferences',
                        feature: 'settings',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        alwaysShow: true,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen())),
                      ),

                      // Logout
                      const SizedBox(height: 4),
                      GestureDetector(
                        onTap: () async => await supabase.auth.signOut(),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [AppColors.cardShadow],
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: AppColors.danger.withValues(alpha: 0.08),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(LucideIcons.logOut, color: AppColors.danger, size: 20),
                              ),
                              const SizedBox(width: 14),
                              Text(
                                'Logout',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.danger,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  );
                },
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(40),
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                ),
                error: (e, _) => Text('Error: $e', style: GoogleFonts.inter(color: AppColors.danger)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: GoogleFonts.jetBrainsMono(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.08,
        color: AppColors.inkSecondary,
      ),
    );
  }
}

class _MenuCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final String subtitle;
  final String feature;
  final List<String> roles;
  final String plan;
  final Map<dynamic, dynamic>? permissions;
  final VoidCallback onTap;
  final bool alwaysShow;

  const _MenuCard({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.subtitle,
    required this.feature,
    required this.roles,
    required this.plan,
    required this.onTap,
    this.permissions,
    this.alwaysShow = false,
  });

  @override
  Widget build(BuildContext context) {
    final isPlanLocked = !planMeetsRequirement(feature, plan);
    final requiredPlan = requiredPlanFor(feature);
    // Role check using the full web matrix (view action, plan already checked separately)
    final isRoleBlocked = !hasModulePermission(
      feature == 'logistics' ? 'vehicles' : (feature == 'pos' ? 'sales' : feature),
      'view',
      roles: roles,
      permissions: permissions,
    );

    if (isRoleBlocked && !alwaysShow) return const SizedBox.shrink();

    return GestureDetector(
      onTap: isPlanLocked
          ? () => ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Upgrade to $requiredPlan to unlock this feature'),
                  backgroundColor: AppColors.primary,
                ),
              )
          : onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isPlanLocked
                    ? AppColors.surfaceContainer
                    : iconColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                isPlanLocked ? LucideIcons.lock : icon,
                color: isPlanLocked ? AppColors.inkTertiary : iconColor,
                size: 20,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: isPlanLocked ? AppColors.inkTertiary : AppColors.inkPrimary,
                    ),
                  ),
                  Text(
                    isPlanLocked ? 'Upgrade to $requiredPlan to unlock' : subtitle,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: isPlanLocked ? AppColors.warning : AppColors.inkTertiary,
                      fontWeight: isPlanLocked ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
            if (isPlanLocked)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.warning.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'PRO',
                  style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: AppColors.warning,
                  ),
                ),
              )
            else
              const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkTertiary),
          ],
        ),
      ),
    );
  }
}
