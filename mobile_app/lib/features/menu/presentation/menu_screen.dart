import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/app_button.dart' show AppTappable;
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/hr/presentation/hr_screen.dart';
import 'package:mobile_app/features/logistics/presentation/driver_route_screen.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';
import 'package:mobile_app/features/accounts/presentation/accounts_screen.dart';
import 'package:mobile_app/features/estimates/presentation/estimates_screen.dart';
import 'package:mobile_app/features/cash_collection/presentation/cash_collection_screen.dart';
import 'package:mobile_app/features/manufacturing/presentation/manufacturing_screen.dart';

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
                style: GoogleFonts.manrope(
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
                  final plan = ctx?.plan ?? 'FREE';
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
                                  style: GoogleFonts.manrope(
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
                                    style: GoogleFonts.manrope(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    ctx?.tenant.name ?? '',
                                    style: GoogleFonts.manrope(
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
                                style: GoogleFonts.manrope(
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

                      // ── Sync ─────────────────────────────────
                      _SectionLabel('Sync'),
                      const SizedBox(height: 12),
                      _MenuCard(
                        icon: LucideIcons.refreshCw,
                        iconColor: const Color(0xFF16A34A),
                        label: 'Force Sync',
                        subtitle: 'Push offline changes to the cloud',
                        feature: 'dashboard',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        alwaysShow: true,
                        onTap: () => _forceSyncFromMenu(context, ref),
                      ),
                      const SizedBox(height: 20),

                      // ── Menu section ─────────────────────────
                      _SectionLabel('Modules'),
                      const SizedBox(height: 12),

                      _MenuCard(
                        icon: LucideIcons.users,
                        iconColor: const Color(0xFF0D9488),
                        label: 'Clients & Suppliers',
                        subtitle: 'Add, edit, view parties',
                        feature: 'clients',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CRMScreen())),
                      ),
                      _MenuCard(
                        icon: LucideIcons.wallet,
                        iconColor: const Color(0xFFD97706),
                        label: 'Expenses',
                        subtitle: 'Track daily expenses',
                        feature: 'expenses',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FinanceScreen())),
                      ),
                      _MenuCard(
                        icon: LucideIcons.bookOpen,
                        iconColor: const Color(0xFF2563EB),
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
                        iconColor: const Color(0xFF7C3AED),
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
                          iconColor: const Color(0xFF4F46E5),
                          label: 'Reports',
                          subtitle: 'Sales, GST, P&L reports',
                          feature: 'reports',
                          roles: roles,
                          plan: plan,
                          permissions: permissions,
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReportsScreen())),
                        ),
                      if (canAccess('payroll', roles: roles, plan: plan, permissions: permissions))
                        _MenuCard(
                          icon: LucideIcons.briefcase,
                          iconColor: const Color(0xFF0EA5E9),
                          label: 'Payroll',
                          subtitle: 'Employees & salary management',
                          feature: 'payroll',
                          roles: roles,
                          plan: plan,
                          permissions: permissions,
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HRScreen())),
                        ),
                      _MenuCard(
                        icon: LucideIcons.wallet,
                        iconColor: const Color(0xFF16A34A),
                        label: 'Cash & Bank',
                        subtitle: 'Account balances & GL',
                        feature: 'accounts',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountsScreen())),
                      ),
                      _MenuCard(
                        icon: LucideIcons.fileText,
                        iconColor: const Color(0xFF7C3AED),
                        label: 'Estimates',
                        subtitle: 'Quotes, challans, proforma',
                        feature: 'estimates',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EstimatesScreen())),
                      ),
                      _MenuCard(
                        icon: LucideIcons.banknote,
                        iconColor: const Color(0xFF059669),
                        label: 'Cash Collection',
                        subtitle: 'Collect from due clients',
                        feature: 'clients',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CashCollectionScreen())),
                      ),
                      _MenuCard(
                        icon: LucideIcons.factory,
                        iconColor: const Color(0xFFD97706),
                        label: 'Manufacturing',
                        subtitle: 'BOMs & production orders',
                        feature: 'manufacturing',
                        roles: roles,
                        plan: plan,
                        permissions: permissions,
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ManufacturingScreen())),
                      ),
                      if (canAccess('logistics', roles: roles, plan: plan, permissions: permissions))
                        _MenuCard(
                          icon: LucideIcons.truck,
                          iconColor: const Color(0xFFEA580C),
                          label: 'Vehicles',
                          subtitle: 'Vehicles & route tracking',
                          feature: 'logistics',
                          roles: roles,
                          plan: plan,
                          permissions: permissions,
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LogisticsScreen())),
                        ),
                      _MenuCard(
                        icon: LucideIcons.mapPin,
                        iconColor: const Color(0xFF059669),
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
                        iconColor: const Color(0xFF475569),
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
                      AppTappable(
                        ripple: false,
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
                                style: GoogleFonts.manrope(
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
                error: (e, _) => Text('Error: $e', style: GoogleFonts.manrope(color: AppColors.danger)),
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

/// Manual Force Sync from the More menu. Flushes the offline queue and reports
/// the result. sync() is idempotent + guarded + timed-out, so it's always safe.
Future<void> _forceSyncFromMenu(BuildContext context, WidgetRef ref) async {
  final messenger = ScaffoldMessenger.of(context);
  final svc = ref.read(syncServiceProvider);
  final conn = await Connectivity().checkConnectivity();
  final pending = await svc.pendingCount();
  if (conn == ConnectivityResult.none) {
    messenger.showSnackBar(SnackBar(
      content: Text(pending > 0
          ? 'No internet — $pending change${pending == 1 ? '' : 's'} saved, will sync when back online.'
          : 'No internet connection.'),
      behavior: SnackBarBehavior.floating,
    ));
    return;
  }
  messenger.showSnackBar(const SnackBar(
    content: Text('Syncing…'), duration: Duration(milliseconds: 900),
    behavior: SnackBarBehavior.floating,
  ));
  await svc.sync();
  final left = await svc.pendingCount();
  if (!context.mounted) return;
  messenger.showSnackBar(SnackBar(
    content: Text(left == 0
        ? 'All changes synced ✓'
        : '$left change${left == 1 ? '' : 's'} still pending — will retry.'),
    backgroundColor: left == 0 ? const Color(0xFF16A34A) : const Color(0xFFD97706),
    behavior: SnackBarBehavior.floating,
  ));
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

    return AppTappable(
      ripple: false,
      onTap: isPlanLocked
          ? () => ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Upgrade to $requiredPlan to unlock this feature'),
                  backgroundColor: AppColors.primary,
                ),
              )
          : onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppColors.outlineVariant.withValues(alpha: 0.6),
          ),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9), // slate-100
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(
                isPlanLocked ? LucideIcons.lock : icon,
                color: const Color(0xFF475569), // slate-600
                size: 21,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.manrope(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: isPlanLocked ? AppColors.inkTertiary : AppColors.inkPrimary,
                    ),
                  ),
                  Text(
                    isPlanLocked ? 'Upgrade to $requiredPlan to unlock' : subtitle,
                    style: GoogleFonts.manrope(
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
                  style: GoogleFonts.manrope(
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
