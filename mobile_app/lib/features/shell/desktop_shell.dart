import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/sync/offline_sync.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/auth/presentation/login_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/hr/presentation/hr_screen.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';

// Nav item model
class _NavItem {
  final String id;
  final String label;
  final IconData icon;
  final String feature;
  final Widget screen;
  const _NavItem({
    required this.id,
    required this.label,
    required this.icon,
    required this.feature,
    required this.screen,
  });
}

// ignore: prefer_const_declarations
final _navItems = [
  _NavItem(
    id: 'dashboard',
    label: 'Dashboard',
    icon: LucideIcons.layoutDashboard,
    feature: 'dashboard',
    screen: DashboardHome(onTabSwitch: (_) {}),
  ),
  const _NavItem(
    id: 'inventory',
    label: 'Inventory',
    icon: LucideIcons.package,
    feature: 'inventory',
    screen: InventoryScreen(),
  ),
  const _NavItem(
    id: 'sales',
    label: 'Sales',
    icon: LucideIcons.shoppingCart,
    feature: 'sales',
    screen: SalesScreen(),
  ),
  const _NavItem(
    id: 'clients',
    label: 'Clients',
    icon: LucideIcons.users,
    feature: 'clients',
    screen: CRMScreen(),
  ),
  const _NavItem(
    id: 'expenses',
    label: 'Expenses',
    icon: LucideIcons.wallet,
    feature: 'expenses',
    screen: FinanceScreen(),
  ),
  const _NavItem(
    id: 'payroll',
    label: 'Payroll',
    icon: LucideIcons.briefcase,
    feature: 'payroll',
    screen: HRScreen(),
  ),
  const _NavItem(
    id: 'logistics',
    label: 'Vehicles',
    icon: LucideIcons.truck,
    feature: 'logistics',
    screen: LogisticsScreen(),
  ),
  const _NavItem(
    id: 'invoices',
    label: 'Invoices',
    icon: LucideIcons.receipt,
    feature: 'invoices',
    screen: InvoicesScreen(),
  ),
  const _NavItem(
    id: 'purchases',
    label: 'Purchases',
    icon: LucideIcons.shoppingBag,
    feature: 'purchases',
    screen: PurchasesScreen(),
  ),
  const _NavItem(
    id: 'daybook',
    label: 'Day Book',
    icon: LucideIcons.bookOpen,
    feature: 'daybook',
    screen: DayBookScreen(),
  ),
  const _NavItem(
    id: 'reports',
    label: 'Reports',
    icon: LucideIcons.barChart2,
    feature: 'reports',
    screen: ReportsScreen(),
  ),
  const _NavItem(
    id: 'settings',
    label: 'Settings',
    icon: LucideIcons.settings,
    feature: 'settings',
    screen: SettingsScreen(),
  ),
];

class DesktopShell extends ConsumerStatefulWidget {
  const DesktopShell({super.key});

  @override
  ConsumerState<DesktopShell> createState() => _DesktopShellState();
}

class _DesktopShellState extends ConsumerState<DesktopShell> {
  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);
    final syncState = ref.watch(syncProvider);

    return Scaffold(
      body: Row(
        children: [
          // Sidebar
          Container(
            width: 240,
            decoration: BoxDecoration(
              color: AppColors.inkPrimary,
              border: Border(
                right: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Logo area
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text(
                        'LEDGR',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -1,
                        ),
                      ),
                      Text(
                        'PRO',
                        style: TextStyle(
                          color: AppColors.accentSignature,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                ),

                // Nav items
                Expanded(
                  child: tenantAsync.when(
                    data: (ctx) {
                      final roles = ctx?.roles ?? ['STAFF'];
                      final plan = ctx?.plan ?? 'STARTER';
                      final permissions = ctx?.permissions;
                      return ListView(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        children: _navItems.asMap().entries.map((entry) {
                          final i = entry.key;
                          final item = entry.value;
                          final accessible = canAccess(item.feature,
                              roles: roles, plan: plan, permissions: permissions);
                          final isSelected = _selectedIndex == i && accessible;

                          return Tooltip(
                            message: accessible
                                ? ''
                                : 'Upgrade to ${requiredPlan(item.feature)} to unlock',
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Material(
                                color: Colors.transparent,
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(10),
                                  onTap: accessible
                                      ? () =>
                                          setState(() => _selectedIndex = i)
                                      : null,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 12,
                                    ),
                                    decoration: BoxDecoration(
                                      color: isSelected
                                          ? AppColors.accentSignature
                                              .withValues(alpha: 0.15)
                                          : Colors.transparent,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          item.icon,
                                          size: 18,
                                          color: isSelected
                                              ? AppColors.accentSignature
                                              : accessible
                                                  ? Colors.white
                                                      .withValues(alpha: 0.7)
                                                  : Colors.white
                                                      .withValues(alpha: 0.25),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Text(
                                            item.label,
                                            style: TextStyle(
                                              color: isSelected
                                                  ? AppColors.accentSignature
                                                  : accessible
                                                      ? Colors.white
                                                          .withValues(alpha: 0.85)
                                                      : Colors.white
                                                          .withValues(alpha: 0.25),
                                              fontSize: 13,
                                              fontWeight: isSelected
                                                  ? FontWeight.w800
                                                  : FontWeight.w500,
                                            ),
                                          ),
                                        ),
                                        if (!accessible)
                                          Icon(
                                            LucideIcons.lock,
                                            size: 12,
                                            color: Colors.white
                                                .withValues(alpha: 0.2),
                                          ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      );
                    },
                    loading: () => const SizedBox(),
                    error: (_, _) => const SizedBox(),
                  ),
                ),

                // Bottom: user + sync status
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(
                        color: Colors.white.withValues(alpha: 0.06),
                      ),
                    ),
                  ),
                  child: tenantAsync.when(
                    data: (ctx) => Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Sync status indicator
                        Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: syncState.status == SyncStatus.online
                                    ? Colors.green
                                    : syncState.status == SyncStatus.syncing
                                        ? Colors.amber
                                        : Colors.red,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              syncState.status == SyncStatus.online
                                  ? 'Synced'
                                  : syncState.status == SyncStatus.syncing
                                      ? 'Syncing...'
                                      : 'Offline',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.5),
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        // User row
                        Row(
                          children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: AppColors.accentSignature
                                    .withValues(alpha: 0.2),
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  (ctx?.userProfile.name.isNotEmpty == true
                                          ? ctx!.userProfile.name[0]
                                          : ctx?.userProfile.email.isNotEmpty ==
                                                  true
                                              ? ctx!.userProfile.email[0]
                                              : 'U')
                                      .toUpperCase(),
                                  style: const TextStyle(
                                    color: AppColors.accentSignature,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    ctx?.userProfile.name.isNotEmpty == true
                                        ? ctx!.userProfile.name
                                        : ctx?.userProfile.email ?? '',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    ctx?.plan ?? 'STARTER',
                                    style: const TextStyle(
                                      color: AppColors.accentSignature,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            // Logout button
                            InkWell(
                              borderRadius: BorderRadius.circular(8),
                              onTap: () async {
                                await supabase.auth.signOut();
                                if (context.mounted) {
                                  Navigator.of(context).pushReplacement(
                                    MaterialPageRoute(
                                      builder: (_) => const LoginScreen(),
                                    ),
                                  );
                                }
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(6),
                                child: Icon(
                                  LucideIcons.logOut,
                                  size: 16,
                                  color: Colors.white.withValues(alpha: 0.4),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    loading: () => const SizedBox(),
                    error: (_, _) => const SizedBox(),
                  ),
                ),
              ],
            ),
          ),

          // Main content area
          Expanded(
            child: Column(
              children: [
                // Trial banner (only when <= 7 days left)
                tenantAsync.when(
                  data: (ctx) {
                    if (ctx == null ||
                        ctx.tenant.status != 'TRIAL' ||
                        ctx.trialDaysLeft > 7) {
                      return const SizedBox.shrink();
                    }
                    return Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 10,
                      ),
                      color: Colors.amber.shade50,
                      child: Row(
                        children: [
                          Icon(
                            LucideIcons.clock,
                            size: 14,
                            color: Colors.amber.shade800,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '${ctx.trialDaysLeft} days left in your free trial.',
                            style: TextStyle(
                              color: Colors.amber.shade900,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'Upgrade now →',
                            style: TextStyle(
                              color: Colors.amber.shade900,
                              fontWeight: FontWeight.w900,
                              fontSize: 13,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (_, _) => const SizedBox.shrink(),
                ),

                // Screen content
                Expanded(
                  child: tenantAsync.when(
                    data: (ctx) {
                      final roles = ctx?.roles ?? ['STAFF'];
                      final plan = ctx?.plan ?? 'STARTER';
                      final permissions = ctx?.permissions;
                      final item = _navItems[_selectedIndex];
                      if (!canAccess(item.feature,
                          roles: roles, plan: plan, permissions: permissions)) {
                        return _LockedScreen(feature: item.feature);
                      }
                      return item.screen;
                    },
                    loading: () => const Center(
                      child: CircularProgressIndicator(),
                    ),
                    error: (e, _) => Center(child: Text('Could not load. Check your internet and try again.')),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LockedScreen extends StatelessWidget {
  final String feature;
  const _LockedScreen({required this.feature});

  @override
  Widget build(BuildContext context) {
    final plan = requiredPlan(feature);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.canvas,
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Icon(
              LucideIcons.lock,
              size: 48,
              color: AppColors.inkSecondary,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            '${feature[0].toUpperCase()}${feature.substring(1)} requires $plan plan',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          const Text(
            'Upgrade your plan to unlock this feature.',
            style: TextStyle(color: AppColors.inkSecondary, fontSize: 14),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.mail, size: 16),
            label: const Text('Contact support to upgrade'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.inkPrimary,
              side: const BorderSide(color: AppColors.inkSecondary),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: StadiumBorder(),
            ),
          ),
        ],
      ),
    );
  }
}
