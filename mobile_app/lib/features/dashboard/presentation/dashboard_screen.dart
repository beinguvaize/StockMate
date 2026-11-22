import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/app_button.dart' show AppTappable;
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/hr/presentation/hr_screen.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/inventory/presentation/add_product_screen.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/logistics/presentation/driver_route_screen.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart';
import 'package:mobile_app/features/menu/presentation/menu_screen.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';
import 'package:mobile_app/features/sales/presentation/sale_type_sheet.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';
export 'dashboard_home.dart';
import 'dashboard_home.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

typedef _NavTab = ({String feature, IconData icon, String label, Widget tab});

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  int _selectedIndex = 0;
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  // Master tab list. `feature` is the RBAC key; '__menu__' is always shown.
  late final List<_NavTab> _allTabs = [
    (feature: 'dashboard', icon: LucideIcons.layoutDashboard, label: 'Dashboard', tab: DashboardHome(onTabSwitch: _switchToFeature)),
    (feature: 'sales',     icon: LucideIcons.shoppingCart,    label: 'Sales',     tab: const SalesScreen()),
    (feature: 'inventory', icon: LucideIcons.package,         label: 'Inventory', tab: const InventoryScreen(showAddButton: false)),
    (feature: 'logistics', icon: LucideIcons.truck,           label: 'My Route',  tab: const DriverRouteScreen()),
    (feature: '__menu__',  icon: LucideIcons.moreHorizontal,  label: 'More',      tab: const MenuScreen()),
  ];

  // Tabs the current user may see — filtered by the shared RBAC matrix.
  List<_NavTab> _visibleTabs(List<String> roles, String plan, Map? permissions) {
    return _allTabs.where((t) =>
        t.feature == '__menu__' ||
        canAccess(t.feature, roles: roles, plan: plan, permissions: permissions)
    ).toList();
  }

  void _switchTab(int index) => setState(() => _selectedIndex = index);

  // Jump to a tab by feature key (used by in-dashboard shortcuts).
  void _switchToFeature(String feature) {
    final ctx = ref.read(tenantContextProvider).value;
    final visible = _visibleTabs(ctx?.roles ?? [], ctx?.plan ?? 'FREE', ctx?.permissions);
    final idx = visible.indexWhere((t) => t.feature == feature);
    if (idx >= 0) setState(() => _selectedIndex = idx);
  }

  @override
  Widget build(BuildContext context) {
    final ctx = ref.watch(tenantContextProvider).value;
    final tabs = _visibleTabs(
        ctx?.roles ?? [], ctx?.plan ?? 'FREE', ctx?.permissions);
    final selIdx = tabs.isEmpty ? 0 : _selectedIndex.clamp(0, tabs.length - 1);
    final currentFeature = tabs.isEmpty ? '' : tabs[selIdx].feature;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.canvas,
      drawer: const _AppDrawer(),
      // Lift the FAB clear of the custom bottom nav bar so the "+" sits
      // ABOVE the "More" tab instead of covering it. The nav bar is a
      // Positioned container (not Scaffold.bottomNavigationBar), so Scaffold
      // never auto-offsets the FAB — we pad it up by the nav height + SafeArea.
      // Inventory used to have no visible Add button on the phone. The screen
      // supplies one, but at the default position -- which is UNDER this nav
      // bar, since the bar is a Positioned overlay and Scaffold therefore never
      // offsets a FAB above it. The button was rendering and invisible.
      // The shell owns the offset, so the shell owns the button.
      floatingActionButton: (currentFeature == 'sales' || currentFeature == 'inventory')
          ? Padding(
              padding: EdgeInsets.only(
                  bottom: 76 + MediaQuery.of(context).viewPadding.bottom),
              child: FloatingActionButton(
                heroTag: null,
                tooltip: currentFeature == 'inventory' ? 'Add product' : 'New sale',
                onPressed: () {
                  if (currentFeature == 'inventory') {
                    // Hold the container now: reaching for `context` inside the
                    // .then() is across an async gap, by which point this widget
                    // may be gone.
                    final container =
                        ProviderScope.containerOf(context, listen: false);
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const AddProductScreen()),
                    ).then((_) => container.invalidate(productsProvider));
                    return;
                  }
                  final roles = ProviderScope.containerOf(context, listen: false)
                      .read(tenantContextProvider)
                      .value?.roles ?? [];
                  navigateToNewSale(context, roles);
                },
                // The app's single most-used action -- add a sale, or add a
                // product -- so it carries the same fill as every other
                // primary action. The per-screen FABs were already moved to
                // brandFill; this is the one actually on screen, because the
                // shell owns the offset and therefore owns the button.
                backgroundColor: AppColors.brandFill,
                foregroundColor: AppColors.onBrandFill,
                elevation: 3,
                shape: const RoundedRectangleBorder(borderRadius: Radii.rMd),
                child: const Icon(LucideIcons.plus, size: 26),
              ),
            )
          : null,
      body: Column(
        children: [
          // ── Global app bar ────────────────────────────────────────
          _GlobalAppBar(
            title: tabs.isEmpty ? '' : (currentFeature == 'dashboard' ? 'Today' : tabs[selIdx].label),
            onMenuTap: () => _scaffoldKey.currentState?.openDrawer(),
          ),

          // ── Tab content ───────────────────────────────────────────
          Expanded(
            child: Stack(
              children: [
                MediaQuery.removePadding(
                  context: context,
                  removeTop: true,
                  child: IndexedStack(
                    index: selIdx,
                    children: tabs.map((t) => t.tab).toList(),
                  ),
                ),

          // Bottom nav
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              // A deep 60px top curve and a hairline, not a drop shadow.
              // The bar sits ON the warm canvas rather than floating over
              // it, which is the one place the app still spent elevation on
              // something that never moves.
              decoration: const BoxDecoration(
                color: AppColors.canvas,
                border: Border(
                  top: BorderSide(color: AppColors.outlineVariant),
                ),
                borderRadius: BorderRadius.vertical(top: Radius.circular(60)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: tabs.asMap().entries.map((e) {
                      final i = e.key;
                      final item = e.value;
                      final isActive = selIdx == i;
                      return AppTappable(
                        onTap: () => _switchTab(i),
                        ripple: false,
                        pressedScale: 0.94,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AnimatedContainer(
                              duration: Motion.base,
                              curve: Motion.standard,
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                              decoration: BoxDecoration(
                                color: isActive ? AppColors.primaryContainer : Colors.transparent,
                                borderRadius: BorderRadius.circular(99),
                              ),
                              child: Icon(
                                item.icon,
                                size: 22,
                                color: isActive ? AppColors.primary : AppColors.inkTertiary,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              item.label,
                              // 10px monospace: the five most-used labels in
                              // the app were also the smallest text in it.
                              style: AppText.label.copyWith(
                                fontWeight:
                                    isActive ? FontWeight.w700 : FontWeight.w500,
                                color: isActive
                                    ? AppColors.primary
                                    : AppColors.inkTertiary,
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
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

// ─────────────────────────────────────────────────────────────────────────────
// Global App Bar
// ─────────────────────────────────────────────────────────────────────────────

class _GlobalAppBar extends StatelessWidget {
  final VoidCallback onMenuTap;
  final String title;
  const _GlobalAppBar({required this.onMenuTap, required this.title});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.canvas,
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 52,
          child: Row(
            children: [
              // Menu: a bare icon, 48dp hit area, no card behind it.
              AppTappable(
                ripple: false,
                onTap: onMenuTap,
                child: const SizedBox(
                  width: 52,
                  height: 52,
                  child: Icon(LucideIcons.menu, size: 22, color: AppColors.inkPrimary),
                ),
              ),
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.title.copyWith(
                    fontSize: 20,
                    fontWeight: FontWeight.w500,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
              // Online / sync state (hidden when synced + online)
              const SyncStatusPill(),
              AppTappable(
                ripple: false,
                onTap: () => showModalBottomSheet(
                  context: context,
                  backgroundColor: Colors.white,
                  shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                  ),
                  builder: (_) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 40),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(LucideIcons.bell, size: 40, color: AppColors.inkTertiary),
                        const SizedBox(height: 16),
                        Text(
                          'No new notifications',
                          style: AppText.bodyStrong.copyWith(color: AppColors.inkSecondary),
                        ),
                      ],
                    ),
                  ),
                ),
                child: const SizedBox(
                  width: 52,
                  height: 52,
                  child: Icon(LucideIcons.bell, size: 20, color: AppColors.inkPrimary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar Drawer
// ─────────────────────────────────────────────────────────────────────────────

class _AppDrawer extends ConsumerWidget {
  const _AppDrawer();

  static const _sections = [
    _DrawerSection(label: 'SALES & FINANCE', items: [
      _DrawerItem(icon: LucideIcons.shoppingBag,  label: 'New Sale',      color: AppColors.primary, feature: 'sales'),
      _DrawerItem(icon: LucideIcons.shoppingCart,  label: 'Sales History', color: AppColors.primary, feature: 'sales'),
      _DrawerItem(icon: LucideIcons.fileText,      label: 'Invoices',      color: AppColors.primary, feature: 'invoices'),
      _DrawerItem(icon: LucideIcons.creditCard,    label: 'Expenses',      color: AppColors.danger, feature: 'expenses'),
      _DrawerItem(icon: LucideIcons.clipboardList, label: 'Purchases',     color: AppColors.warning, feature: 'purchases'),
      _DrawerItem(icon: LucideIcons.bookOpen,      label: 'Day Book',      color: AppColors.info, feature: 'daybook'),
    ]),
    _DrawerSection(label: 'INVENTORY & CRM', items: [
      _DrawerItem(icon: LucideIcons.package,  label: 'Inventory', color: Color(0xFF5b5f5a), feature: 'inventory'),
      _DrawerItem(icon: LucideIcons.users,    label: 'CRM',        color: AppColors.secondary, feature: 'clients'),
    ]),
    _DrawerSection(label: 'INSIGHTS', items: [
      _DrawerItem(icon: LucideIcons.barChart2, label: 'Reports', color: AppColors.primary, feature: 'reports'),
    ]),
    _DrawerSection(label: 'WORKFORCE & OPS', items: [
      _DrawerItem(icon: LucideIcons.users2, label: 'Payroll',  color: AppColors.secondary, feature: 'payroll'),
      _DrawerItem(icon: LucideIcons.truck,  label: 'Vehicles', color: Color(0xFF5b5f5a), feature: 'logistics'),
    ]),
  ];

  void _navigate(BuildContext context, String label, {List<String> roles = const []}) {
    Navigator.pop(context); // close drawer
    if (label == 'New Sale') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) navigateToNewSale(context, roles);
      });
      return;
    }
    final Widget? screen = _screenFor(context, label);
    if (screen != null) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    }
  }

  Widget? _screenFor(BuildContext context, String label) {
    switch (label) {
      case 'New Sale':      return const AddSaleScreen();
      case 'Sales History': return const SalesScreen();
      case 'Invoices':      return const InvoicesScreen();
      case 'Expenses':      return const FinanceScreen();
      case 'Purchases':     return const PurchasesScreen();
      case 'Day Book':      return const DayBookScreen();
      case 'Inventory':     return const InventoryScreen();
      case 'CRM':           return const CRMScreen();
      case 'Reports':       return const ReportsScreen();
      case 'Payroll':   return const HRScreen();
      case 'Vehicles':  return const LogisticsScreen();
      case 'Settings':      return const SettingsScreen();
      default:              return null;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantAsync = ref.watch(tenantContextProvider);
    final roles = tenantAsync.value?.roles ?? [];
    final plan = tenantAsync.value?.plan ?? 'FREE';
    final permissions = tenantAsync.value?.permissions;
    // Filter drawer by RBAC — drop items and empty sections the user can't access.
    final sections = _sections
        .map((s) => _DrawerSection(
              label: s.label,
              items: s.items
                  .where((i) =>
                      i.feature == '__always__' ||
                      canAccess(i.feature,
                          roles: roles, plan: plan, permissions: permissions))
                  .toList(),
            ))
        .where((s) => s.items.isNotEmpty)
        .toList();

    return Drawer(
      backgroundColor: AppColors.surface,
      width: MediaQuery.of(context).size.width * 0.80,
      child: SafeArea(
        child: Column(
          children: [
            // ── Brand header (profile card lives in the More tab) ─
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Row(
                children: [
                  Image.asset('assets/images/logo_linear.png', height: 30, fit: BoxFit.contain),
                  const Spacer(),
                ],
              ),
            ),

            // ── Nav sections ──────────────────────────────────────
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: sections.map((section) => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 20, 8, 8),
                        child: Text(
                          section.label,
                          style: AppText.label.copyWith(fontWeight: FontWeight.w700,
                            letterSpacing: 1.5,
                            color: AppColors.inkTertiary),
                        ),
                      ),
                      ...section.items.map((item) => _DrawerTile(
                        item: item,
                        onTap: () => _navigate(context, item.label, roles: roles),
                      )),
                    ],
                  )).toList(),
                ),
              ),
            ),

            // ── Sign out ──────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.all(16),
              child: AppTappable(
                ripple: false,
                onTap: () async {
                  Navigator.pop(context);
                  await supabase.auth.signOut();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.danger.withValues(alpha: 0.2)),
                  ),
                  child: Row(
                    children: [
                      Icon(LucideIcons.logOut, size: 18, color: AppColors.danger),
                      const SizedBox(width: 12),
                      Text(
                        'Sign Out',
                        style: GoogleFonts.manrope(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.danger,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerSection {
  final String label;
  final List<_DrawerItem> items;
  const _DrawerSection({required this.label, required this.items});
}

class _DrawerItem {
  final IconData icon;
  final String label;
  final Color color;
  final String feature; // RBAC key; '__always__' = always shown
  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.color,
    required this.feature,
  });
}

class _DrawerTile extends StatelessWidget {
  final _DrawerItem item;
  final VoidCallback onTap;
  const _DrawerTile({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AppTappable(
      ripple: false,
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 2),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: item.color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(item.icon, size: 16, color: item.color),
            ),
            const SizedBox(width: 14),
            Text(
              item.label,
              style: GoogleFonts.manrope(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppColors.inkPrimary,
              ),
            ),
            const Spacer(),
            Icon(LucideIcons.chevronRight, size: 14, color: AppColors.inkTertiary),
          ],
        ),
      ),
    );
  }
}
