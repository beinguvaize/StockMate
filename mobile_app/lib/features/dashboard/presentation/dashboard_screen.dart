import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/widgets/app_button.dart' show AppTappable;
import 'package:mobile_app/core/widgets/app_states.dart' show AppSpinner;
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/widgets/app_surfaces.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/core/widgets/trial_banner.dart';
import 'package:mobile_app/core/widgets/banner_carousel.dart';
import 'package:mobile_app/core/widgets/expiry_alert_card.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
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
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/sales/presentation/sale_type_sheet.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';
import 'widgets/today_card.dart';

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
                // Grey fill with a pale-amber glyph. This is the app's single
                // most-used action -- add a sale, or add a product -- and it
                // was the only control using a colour pair found nowhere else.
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.onPrimary,
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
  const _GlobalAppBar({required this.onMenuTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.canvas,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Logo — exact center of screen
              Center(
                child: Image.asset(
                  'assets/images/logo_linear.png',
                  height: 32,
                  fit: BoxFit.contain,
                ),
              ),

              // Edge controls
              Row(
            children: [
              // Hamburger
              AppTappable(
                ripple: false,
                onTap: onMenuTap,
                child: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [AppColors.cardShadow],
                  ),
                  child: const Icon(
                    LucideIcons.menu,
                    size: 20,
                    color: AppColors.inkPrimary,
                  ),
                ),
              ),

              const Spacer(),

              // Offline sync status (hidden when synced + online)
              const SyncStatusPill(),

              // Bell
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
                child: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [AppColors.cardShadow],
                  ),
                  child: const Icon(
                    LucideIcons.bell,
                    size: 20,
                    color: AppColors.inkPrimary,
                  ),
                ),
              ),
            ],
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

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Home — Analytics Focus
// ─────────────────────────────────────────────────────────────────────────────

class DashboardHome extends ConsumerStatefulWidget {
  final void Function(String feature) onTabSwitch;
  const DashboardHome({super.key, required this.onTabSwitch});

  @override
  ConsumerState<DashboardHome> createState() => _DashboardHomeState();
}

class _DashboardHomeState extends ConsumerState<DashboardHome>
    with WidgetsBindingObserver {
  bool _revenueVisible = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Refresh dashboard data when the app returns to the foreground.
    if (state == AppLifecycleState.resumed) _refresh();
  }

  // Re-fetch all dashboard data — telemetry KPIs + recent sales.
  Future<void> _refresh() async {
    ref.invalidate(telemetryProvider);
    ref.invalidate(recentSalesProvider);
    try {
      await ref.read(telemetryProvider.future);
    } catch (_) {}
  }

  void _push(Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final telemetryAsync = ref.watch(telemetryProvider);
    final tenantAsync    = ref.watch(tenantContextProvider);
    final recentSalesAsync = ref.watch(recentSalesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvasWarm,
      body: SafeArea(
        top: false,
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.md, Gap.xl, 120),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
              // ── Greeting ─────────────────────────────────────────
              tenantAsync.when(
                data: (ctx) {
                  final name = ctx?.userProfile.name.isNotEmpty == true
                      ? ctx!.userProfile.name.split(' ').first
                      : 'there';
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Hi, $name', style: AppText.display),
                                // The business name, not "Here's your
                                // business overview": on a shop floor the
                                // person knows what the screen is. Which
                                // ledger they are looking at is the thing
                                // worth confirming.
                                Text(
                                  ctx?.tenant.name.toUpperCase() ?? '',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppText.caption.copyWith(
                                    color: AppColors.inkTertiary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Gap.w12,
                          AppTappable(
                            ripple: false,
                            onTap: () => Scaffold.of(context).openDrawer(),
                            child: Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: AppColors.canvas,
                                shape: BoxShape.circle,
                                border: Border.all(color: AppColors.outlineVariant),
                              ),
                              child: const Icon(LucideIcons.user,
                                  size: 20, color: AppColors.inkSecondary),
                            ),
                          ),
                        ],
                      ),
                      if (ctx != null && ctx.tenant.status == 'TRIAL' && ctx.trialDaysLeft <= 7) ...[
                        const SizedBox(height: 12),
                        TrialBanner(daysLeft: ctx.trialDaysLeft),
                      ],
                      const ExpiryAlertCard(),
                    ],
                  );
                },
                loading: () => const SizedBox(height: 52),
                error:   (_, _) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 20),

              // ── KPI Cards ─────────────────────────────────────────
              // Offline is a state, not a warning: the bills are safe and
              // they will sync. It sits left, under the greeting, at the
              // size of the sentence it is -- not centred in amber, which
              // read as something having gone wrong.
              if (telemetryAsync.asData?.value.fromCache == true)
                Padding(
                  padding: const EdgeInsets.only(bottom: Gap.md),
                  child: _OfflinePill(),
                ),
              telemetryAsync.when(
                data: (m) => Column(
                  children: [
                    TodayCard(
                      amount: m.todaySales,
                      billCount: m.todayBillCount,
                      averageBill: m.averageBill,
                      deltaPct: m.salesDeltaPct,
                      hourly: m.hourlySales,
                      revenueVisible: _revenueVisible,
                      onToggleVisible: () =>
                          setState(() => _revenueVisible = !_revenueVisible),
                      onTap: () => widget.onTabSwitch('sales'),
                    ),
                    const SizedBox(height: Gap.md),
                    // The day's three next moves, and exactly ONE of them
                    // filled. Peers stay neutral, which is what makes the
                    // filled one read as primary rather than as decoration.
                    Row(
                      children: [
                        Expanded(
                          child: _ActionButton(
                            icon: LucideIcons.plus,
                            label: 'New bill',
                            primary: true,
                            // Goes through the role gate, not straight to
                            // the screen: not every seat may ring a sale.
                            onTap: () => navigateToNewSale(
                              context,
                              ref.read(tenantContextProvider).value?.roles ?? [],
                            ),
                          ),
                        ),
                        Gap.w8,
                        Expanded(
                          child: _ActionButton(
                            icon: LucideIcons.package,
                            label: 'Stock',
                            onTap: () => widget.onTabSwitch('inventory'),
                          ),
                        ),
                        Gap.w8,
                        Expanded(
                          child: _ActionButton(
                            icon: LucideIcons.barChart3,
                            label: 'Reports',
                            onTap: () => _push(const ReportsScreen()),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: Gap.xl),
                    // The other five figures stay. The artboard does not draw
                    // them, but they are real numbers this shop already reads
                    // every day -- demoting them below the day's headline is
                    // the design change; deleting them would be a data loss
                    // dressed up as one.
                    SectionHeading('The rest of today'),
                    const SizedBox(height: Gap.sm),
                    // Row 2: Expenses | Outstanding
                    Row(
                      children: [
                        Expanded(
                          child: _KpiCard(
                            label: 'Expenses',
                            value: _fmtAmount(m.todayExpenses),
                            icon: LucideIcons.creditCard,
                            accentColor: const Color(0xFFe53935),
                            onTap: () => _push(const FinanceScreen()),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _KpiCard(
                            label: 'Outstanding',
                            value: _fmtAmount(m.outstandingCollections),
                            icon: LucideIcons.clock,
                            accentColor: const Color(0xFFe6a817),
                            onTap: () => _push(const InvoicesScreen()),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    // Row 3: Products | Low Stock
                    Row(
                      children: [
                        Expanded(
                          child: _KpiCard(
                            label: 'Products',
                            value: '${m.totalProducts}',
                            icon: LucideIcons.package,
                            accentColor: AppColors.primary,
                            onTap: () => widget.onTabSwitch('inventory'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _KpiCard(
                            label: 'Low stock',
                            value: '${m.lowStockItems}',
                            icon: LucideIcons.alertTriangle,
                            accentColor: m.lowStockItems > 0
                                ? const Color(0xFFe53935)
                                : AppColors.secondary,
                            onTap: () => widget.onTabSwitch('inventory'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                // The skeleton has to be the shape of what arrives. This one
                // still drew the old six-tile grid, so for a second the screen
                // promised a layout that no longer comes -- which is worse
                // than no skeleton, because the page visibly rearranges.
                loading: () => Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      child: _SkeletonBox(height: 196),
                    ),
                    const SizedBox(height: Gap.md),
                    Row(children: [
                      _SkeletonBox(height: 44, expand: true),
                      Gap.w8,
                      _SkeletonBox(height: 44, expand: true),
                      Gap.w8,
                      _SkeletonBox(height: 44, expand: true),
                    ]),
                    const SizedBox(height: Gap.xl),
                    Row(children: [
                      _SkeletonBox(height: 90, expand: true),
                      const SizedBox(width: Gap.md),
                      _SkeletonBox(height: 90, expand: true),
                    ]),
                    const SizedBox(height: Gap.md),
                    Row(children: [
                      _SkeletonBox(height: 90, expand: true),
                      const SizedBox(width: Gap.md),
                      _SkeletonBox(height: 90, expand: true),
                    ]),
                  ],
                ),
                error: (_, _) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 24),

              // Below the day's figures, not above them. A full-width orange
              // gradient sitting between the greeting and the money card was
              // the loudest thing on a screen whose point is the money, and
              // it competed with the one filled action for the same job.
              const BannerCarousel(),

              // ── Recent Sales ──────────────────────────────────────
              SectionHeading(
                'Recent sales',
                icon: LucideIcons.receipt,
                actionLabel: 'See all',
                onAction: () => widget.onTabSwitch('sales'),
              ),

              recentSalesAsync.when(
                data: (sales) {
                  if (sales.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 24),
                        child: Column(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: AppColors.surface,
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                              ),
                              child: const Icon(LucideIcons.shoppingBag, size: 28, color: AppColors.inkTertiary),
                            ),
                            const SizedBox(height: 12),
                            Text('No sales yet', style: AppText.heading),
                            const SizedBox(height: 2),
                            Text('Tap + to record your first sale',
                                style: AppText.caption),
                          ],
                        ),
                      ),
                    );
                  }
                  final recent = sales.take(5).toList();
                  // One card, five rows -- not five cards. See _ActivityItem.
                  return AppCard(
                    padding: const EdgeInsets.symmetric(horizontal: Gap.lg),
                    child: Column(
                      children: recent.asMap().entries.map((e) {
                        final sale = e.value;
                        final isLast = e.key == recent.length - 1;
                        return _ActivityItem(
                          label: (sale.customerInfo?['name'] as String?)?.isNotEmpty == true
                              ? sale.customerInfo!['name'] as String
                              : 'Walk-in Customer',
                          subtitle: _formatDate(sale.date),
                          amount: sale.totalAmount ?? 0,
                          status: sale.paymentMethod ?? 'CASH',
                          showDivider: !isLast,
                        );
                      }).toList(),
                    ),
                  );
                },
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: AppSpinner(size: 20),
                  ),
                ),
                error: (e, _) => Text('Error: $e',
                    style: GoogleFonts.manrope(color: AppColors.danger)),
              ),

              const SizedBox(height: 16),

              // ── Quick actions row ─────────────────────────────────
              Row(
                children: [
                  _QuickBtn(
                    icon: LucideIcons.bookOpen,
                    label: 'Day Book',
                    onTap: () => _push(const DayBookScreen()),
                  ),
                  const SizedBox(width: 10),
                  _QuickBtn(
                    icon: LucideIcons.users2,
                    label: 'HR & Payroll',
                    onTap: () => _push(const HRScreen()),
                  ),
                  const SizedBox(width: 10),
                  _QuickBtn(
                    icon: LucideIcons.truck,
                    label: 'Fleet',
                    onTap: () => _push(const LogisticsScreen()),
                  ),
                ],
              ),
            ],
          ),
        ),
        ),
      ),
    );
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null) return 'Today';
    try {
      final dt = DateTime.parse(dateStr);
      final now = DateTime.now();
      if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
        return 'Today · ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      }
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return dateStr;
    }
  }

  // Was a hand-rolled lakh/crore grouper living only on this screen, so
  // every other screen printed an ungrouped run of digits. See Money.
  String _fmtAmount(double amount) => Money.inr(amount);
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card — hero (gradient) or metric (white)
// ─────────────────────────────────────────────────────────────────────────────

class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? accentColor;
  final VoidCallback? onTap;

  const _KpiCard({
    required this.label,
    required this.value,
    required this.icon,
    this.accentColor,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final tint = accentColor ?? AppColors.primary;


    // ── Metric card ─────────────────────────────────────────────────────────
    //
    // The label was 9px monospace with 0.8 letter-spacing -- below the size at
    // which text is read rather than merely seen. It is 13px now, and the
    // value carries the colour so the pair still reads as one unit.
    return AppTappable(
      ripple: false,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(Gap.lg),
        decoration: BoxDecoration(
          color: AppColors.canvas,
          borderRadius: Radii.rMd,
          border: Border.all(color: AppColors.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconTile(icon: icon, tint: tint, size: 36),
              ],
            ),
            const SizedBox(height: Gap.md),
            // The value used to take the accent colour, so a row of four
            // cards showed four different coloured numbers -- red, amber,
            // brown, red -- and the colour carried no meaning beyond "this is
            // a number". The tinted tile already identifies the metric; the
            // figure is ink like every other figure in the app, which also
            // keeps it off the colours that fail contrast at small sizes.
            Text(value,
                style: AppText.money.copyWith(fontSize: 22),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Text(label,
                style: AppText.caption,
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Btn (Day Book / HR / Fleet shortcut row)
// ─────────────────────────────────────────────────────────────────────────────

class _QuickBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QuickBtn({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    // Was a shadowed card with an 11px label. A shortcut is not a surface that
    // floats above the page, so it is a hairline like everything else, and the
    // label is readable at a glance because that is the whole point of it.
    return Expanded(
      child: AppTappable(
        onTap: onTap,
        ripple: false,
        borderRadius: Radii.rMd,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: Gap.lg),
          decoration: BoxDecoration(
            color: AppColors.canvas,
            borderRadius: Radii.rMd,
            border: Border.all(color: AppColors.outlineVariant),
          ),
          child: Column(
            children: [
              Icon(icon, size: 22, color: AppColors.primary),
              const SizedBox(height: Gap.sm),
              Text(
                label,
                style: AppText.label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Activity Item (recent sale row)
// ─────────────────────────────────────────────────────────────────────────────

class _ActivityItem extends StatelessWidget {
  final String label;
  final String subtitle;
  final double amount;
  final String status;
  final bool showDivider;

  const _ActivityItem({
    required this.label,
    required this.subtitle,
    required this.amount,
    required this.status,
    this.showDivider = true,
  });

  /// Credit is the only one of these that is an open obligation, so it is
  /// the only one that gets colour. Cash and bank are simply done.
  static Color _statusTint(String status) =>
      status.toUpperCase() == 'CREDIT'
          ? AppColors.warning
          : AppColors.inkTertiary;

  @override
  Widget build(BuildContext context) {
    // Each of these used to be its own shadowed card, so five recent sales
    // read as five unrelated objects rather than as one list. They are rows
    // inside a single card now, separated by a hairline -- which is what a
    // list of like things looks like.
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: Gap.md),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style: AppText.bodyStrong,
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    // The date was 10px monospace. A date is prose, not a
                    // column of digits that has to align with anything.
                    Text(subtitle, style: AppText.caption),
                  ],
                ),
              ),
              Gap.w12,
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // Money.inr, not a hand-rolled toStringAsFixed(0): this
                  // row was printing 48210 where the rest of the app prints
                  // 48,210. Grouping is not decoration in lakhs.
                  Text(Money.inr(amount.abs()), style: AppText.money),
                  const SizedBox(height: 3),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: _statusTint(status),
                          shape: BoxShape.circle,
                        ),
                      ),
                      Gap.w4,
                      Text(status, style: AppText.caption.copyWith(
                          color: _statusTint(status))),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
        if (showDivider)
          const Divider(height: 1, thickness: 1,
              color: AppColors.outlineVariant),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton placeholder
// ─────────────────────────────────────────────────────────────────────────────

class _SkeletonBox extends StatelessWidget {
  final double height;
  final bool expand;
  const _SkeletonBox({required this.height, this.expand = false});

  @override
  Widget build(BuildContext context) {
    final box = Container(
      height: height,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(18),
      ),
    );
    return expand ? Expanded(child: box) : box;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action button — the row under the Today card
// ─────────────────────────────────────────────────────────────────────────────

/// One of three peers. Exactly one is [primary] and carries the fill; the
/// others are a hairline on the canvas. Filled colour is what encodes primary
/// emphasis here, so spending it twice would leave neither reading as first.
class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool primary;
  final VoidCallback onTap;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  @override
  Widget build(BuildContext context) {
    final fg = primary ? AppColors.onBrandFill : AppColors.onSurface;
    return AppTappable(
      ripple: false,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13, horizontal: Gap.sm),
        decoration: BoxDecoration(
          color: primary ? AppColors.brandFill : AppColors.canvas,
          borderRadius: Radii.rSm,
          border: primary
              ? null
              : Border.all(color: AppColors.outlineVariant),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: fg),
            Gap.w8,
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.label.copyWith(
                  color: fg,
                  fontWeight: primary ? FontWeight.w700 : FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline pill
// ─────────────────────────────────────────────────────────────────────────────

/// Shown while the figures above came from the local database. The dot
/// breathes rather than blinks: 2.6s is far under the three-per-second that
/// WCAG 2.3.1 treats as a flash, and it animates opacity only, because a dot
/// that also scales pulls the eye off the numbers it sits beside.
class _OfflinePill extends StatefulWidget {
  @override
  State<_OfflinePill> createState() => _OfflinePillState();
}

class _OfflinePillState extends State<_OfflinePill>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Motion.durationOf collapses to ~0 when the platform asks for reduced
    // motion, so an indefinite repeat would spin uselessly. Hold it still.
    if (Motion.durationOf(context, const Duration(milliseconds: 2600)) ==
        Duration.zero) {
      _c.stop();
      _c.value = 1;
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(11, 7, 13, 7),
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: Radii.rXs,
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: Tween<double>(begin: 1, end: 0.35).animate(_c),
            child: Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(
                color: AppColors.accountBank,
                shape: BoxShape.circle,
              ),
            ),
          ),
          Gap.w8,
          Text(
            'Offline · showing your saved figures',
            style: AppText.label.copyWith(color: AppColors.inkSecondary),
          ),
        ],
      ),
    );
  }
}
