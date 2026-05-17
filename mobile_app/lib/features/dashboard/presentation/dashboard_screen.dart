import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/trial_banner.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/finance/presentation/add_expense_screen.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/hr/presentation/hr_screen.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart';
import 'package:mobile_app/features/menu/presentation/menu_screen.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _selectedIndex = 0;
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  static const _navItems = [
    (icon: LucideIcons.layoutDashboard, label: 'Dashboard'),
    (icon: LucideIcons.shoppingCart,    label: 'Sales'),
    (icon: LucideIcons.package,         label: 'Inventory'),
    (icon: LucideIcons.fileText,        label: 'Invoices'),
    (icon: LucideIcons.moreHorizontal,  label: 'More'),
  ];

  void _switchTab(int index) => setState(() => _selectedIndex = index);

  List<Widget> get _tabs => [
    DashboardHome(onTabSwitch: _switchTab),
    const SalesScreen(),
    const InventoryScreen(),
    const InvoicesScreen(),
    const MenuScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.canvas,
      drawer: const _AppDrawer(),
      floatingActionButton: FloatingActionButton(
        heroTag: null,
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddSaleScreen()),
        ),
        backgroundColor: AppColors.secondary,
        foregroundColor: AppColors.primaryContainer,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: const Icon(LucideIcons.plus, size: 26),
      ),
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
                  child: IndexedStack(index: _selectedIndex, children: _tabs),
                ),

          // Bottom nav
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.surface,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.04),
                    blurRadius: 20,
                    offset: const Offset(0, -4),
                  ),
                ],
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: _navItems.asMap().entries.map((e) {
                      final i = e.key;
                      final item = e.value;
                      final isActive = _selectedIndex == i;
                      return GestureDetector(
                        onTap: () => _switchTab(i),
                        behavior: HitTestBehavior.opaque,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
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
                              style: GoogleFonts.jetBrainsMono(
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                                color: isActive ? AppColors.primary : AppColors.inkTertiary,
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
          child: Row(
            children: [
              // Hamburger
              GestureDetector(
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

              // Logo
              Expanded(
                child: Center(
                  child: Image.asset(
                    'assets/images/logo.png',
                    height: 32,
                    fit: BoxFit.contain,
                  ),
                ),
              ),

              // Offline sync status (hidden when synced + online)
              const SyncStatusPill(),

              // Bell
              GestureDetector(
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
                          style: GoogleFonts.inter(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: AppColors.inkSecondary,
                          ),
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
      _DrawerItem(icon: LucideIcons.shoppingBag,  label: 'New Sale',      color: AppColors.primary),
      _DrawerItem(icon: LucideIcons.shoppingCart,  label: 'Sales History', color: AppColors.primary),
      _DrawerItem(icon: LucideIcons.fileText,      label: 'Invoices',      color: AppColors.primary),
      _DrawerItem(icon: LucideIcons.creditCard,    label: 'Expenses',      color: AppColors.danger),
      _DrawerItem(icon: LucideIcons.clipboardList, label: 'Purchases',     color: AppColors.warning),
      _DrawerItem(icon: LucideIcons.bookOpen,      label: 'Day Book',      color: AppColors.info),
    ]),
    _DrawerSection(label: 'INVENTORY & CRM', items: [
      _DrawerItem(icon: LucideIcons.package,  label: 'Inventory', color: Color(0xFF5b5f5a)),
      _DrawerItem(icon: LucideIcons.users,    label: 'CRM',        color: AppColors.secondary),
    ]),
    _DrawerSection(label: 'INSIGHTS', items: [
      _DrawerItem(icon: LucideIcons.barChart2, label: 'Reports', color: AppColors.primary),
    ]),
    _DrawerSection(label: 'WORKFORCE & OPS', items: [
      _DrawerItem(icon: LucideIcons.users2, label: 'HR & Payroll', color: AppColors.secondary),
      _DrawerItem(icon: LucideIcons.truck,  label: 'Fleet',         color: Color(0xFF5b5f5a)),
    ]),
    _DrawerSection(label: 'ACCOUNT', items: [
      _DrawerItem(icon: LucideIcons.settings, label: 'Settings', color: AppColors.inkSecondary),
    ]),
  ];

  void _navigate(BuildContext context, String label) {
    Navigator.pop(context); // close drawer
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
      case 'HR & Payroll':  return const HRScreen();
      case 'Fleet':         return const LogisticsScreen();
      case 'Settings':      return const SettingsScreen();
      default:              return null;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return Drawer(
      backgroundColor: AppColors.surface,
      width: MediaQuery.of(context).size.width * 0.80,
      child: SafeArea(
        child: Column(
          children: [
            // ── Profile header ────────────────────────────────────
            tenantAsync.when(
              data: (ctx) {
                final name = ctx?.userProfile.name ?? ctx?.userProfile.email ?? 'User';
                final plan = ctx?.plan ?? 'STARTER';
                final letter = name.isNotEmpty ? name[0].toUpperCase() : 'U';
                return Container(
                  margin: const EdgeInsets.all(16),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: const BoxDecoration(
                          color: AppColors.primaryContainer,
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text(
                            letter,
                            style: GoogleFonts.hankenGrotesk(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.primaryContainer.withValues(alpha: 0.25),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                plan,
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.primaryContainer,
                                  letterSpacing: 1,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
              loading: () => const SizedBox(height: 100),
              error: (_, __) => const SizedBox.shrink(),
            ),

            // ── Nav sections ──────────────────────────────────────
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: _sections.map((section) => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 20, 8, 8),
                        child: Text(
                          section.label,
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.5,
                            color: AppColors.inkTertiary,
                          ),
                        ),
                      ),
                      ...section.items.map((item) => _DrawerTile(
                        item: item,
                        onTap: () => _navigate(context, item.label),
                      )),
                    ],
                  )).toList(),
                ),
              ),
            ),

            // ── Sign out ──────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.all(16),
              child: GestureDetector(
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
                        style: GoogleFonts.inter(
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
  const _DrawerItem({required this.icon, required this.label, required this.color});
}

class _DrawerTile extends StatelessWidget {
  final _DrawerItem item;
  final VoidCallback onTap;
  const _DrawerTile({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
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
              style: GoogleFonts.inter(
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
  final void Function(int index) onTabSwitch;
  const DashboardHome({super.key, required this.onTabSwitch});

  @override
  ConsumerState<DashboardHome> createState() => _DashboardHomeState();
}

class _DashboardHomeState extends ConsumerState<DashboardHome> {
  bool _revenueVisible = true;

  void _push(Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final telemetryAsync = ref.watch(telemetryProvider);
    final tenantAsync    = ref.watch(tenantContextProvider);
    final recentSalesAsync = ref.watch(recentSalesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
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
                      Text(
                        'Hi, $name 👋',
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                          color: AppColors.inkPrimary,
                          letterSpacing: -0.5,
                        ),
                      ),
                      Text(
                        'Here\'s your business overview',
                        style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkSecondary),
                      ),
                      if (ctx != null && ctx.tenant.status == 'TRIAL' && ctx.trialDaysLeft <= 7) ...[
                        const SizedBox(height: 12),
                        TrialBanner(daysLeft: ctx.trialDaysLeft),
                      ],
                    ],
                  );
                },
                loading: () => const SizedBox(height: 52),
                error:   (_, __) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 20),

              // ── KPI Cards ─────────────────────────────────────────
              telemetryAsync.when(
                data: (m) => Column(
                  children: [
                    // Row 1: Revenue hero card
                    _KpiCard(
                      label: 'TODAY\'S REVENUE',
                      value: _revenueVisible ? _fmtAmount(m.todaySales) : '••••••',
                      icon: LucideIcons.trendingUp,
                      isHero: true,
                      onTap: () => widget.onTabSwitch(1),
                      trailing: GestureDetector(
                        onTap: () => setState(() => _revenueVisible = !_revenueVisible),
                        child: Icon(
                          _revenueVisible ? LucideIcons.eye : LucideIcons.eyeOff,
                          size: 16,
                          color: Colors.white.withValues(alpha: 0.45),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Row 2: Expenses | Outstanding
                    Row(
                      children: [
                        Expanded(
                          child: _KpiCard(
                            label: 'EXPENSES',
                            value: _fmtAmount(m.todayExpenses),
                            icon: LucideIcons.creditCard,
                            accentColor: const Color(0xFFe53935),
                            onTap: () => _push(const FinanceScreen()),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _KpiCard(
                            label: 'OUTSTANDING',
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
                            label: 'PRODUCTS',
                            value: '${m.totalProducts}',
                            icon: LucideIcons.package,
                            accentColor: AppColors.primary,
                            onTap: () => widget.onTabSwitch(2),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _KpiCard(
                            label: 'LOW STOCK',
                            value: '${m.lowStockItems}',
                            icon: LucideIcons.alertTriangle,
                            accentColor: m.lowStockItems > 0
                                ? const Color(0xFFe53935)
                                : AppColors.secondary,
                            onTap: () => widget.onTabSwitch(2),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                loading: () => Column(
                  children: [
                    // Full-width skeleton (no Expanded — inside ScrollView Column)
                    SizedBox(
                      width: double.infinity,
                      child: _SkeletonBox(height: 100),
                    ),
                    const SizedBox(height: 10),
                    Row(children: [
                      _SkeletonBox(height: 90, expand: true),
                      const SizedBox(width: 10),
                      _SkeletonBox(height: 90, expand: true),
                    ]),
                    const SizedBox(height: 10),
                    Row(children: [
                      _SkeletonBox(height: 90, expand: true),
                      const SizedBox(width: 10),
                      _SkeletonBox(height: 90, expand: true),
                    ]),
                  ],
                ),
                error: (_, __) => const SizedBox.shrink(),
              ),

              // Quick action buttons
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => _push(const AddSaleScreen()),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(LucideIcons.shoppingBag, size: 16, color: AppColors.primary),
                            const SizedBox(width: 8),
                            Text('New Sale', style: GoogleFonts.inter(
                              fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.primary,
                            )),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => _push(const AddExpenseScreen()),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(LucideIcons.send, size: 16, color: AppColors.primaryContainer),
                            const SizedBox(width: 8),
                            Text('Add Expense', style: GoogleFonts.inter(
                              fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.primaryContainer,
                            )),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // ── Sales Analytics Chart ─────────────────────────────
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [AppColors.cardShadow],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Weekly Sales',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: AppColors.inkPrimary,
                              ),
                            ),
                            Text(
                              'Last 7 days performance',
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                color: AppColors.inkSecondary,
                              ),
                            ),
                          ],
                        ),
                        GestureDetector(
                          onTap: () => widget.onTabSwitch(1),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: AppColors.primaryContainer.withValues(alpha: 0.3),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              children: [
                                const Icon(LucideIcons.trendingUp, size: 12, color: AppColors.primary),
                                const SizedBox(width: 4),
                                Text(
                                  'All Sales',
                                  style: GoogleFonts.jetBrainsMono(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    Builder(builder: (context) {
                      final weekly = telemetryAsync.asData?.value.weeklySales ?? [];
                      if (weekly.isEmpty) {
                        // Still loading or no data — show skeleton bars
                        return SizedBox(
                          height: 100,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: List.generate(7, (i) => Expanded(
                              child: Padding(
                                padding: EdgeInsets.only(right: i < 6 ? 6 : 0),
                                child: Container(
                                  height: 40,
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.05),
                                    borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                                  ),
                                ),
                              ),
                            )),
                          ),
                        );
                      }
                      final dayLabels = ['S','M','T','W','T','F','S'];
                      final maxAmt = weekly.map((d) => d.amount).reduce((a, b) => a > b ? a : b);
                      final today = DateTime.now();
                      final todayDate = DateTime(today.year, today.month, today.day);
                      return SizedBox(
                        height: 100,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            for (int i = 0; i < weekly.length; i++) ...[
                              _Bar(
                                frac: maxAmt > 0 ? (weekly[i].amount / maxAmt).clamp(0.05, 1.0) : 0.05,
                                day: dayLabels[weekly[i].date.weekday % 7],
                                isHighlight: weekly[i].date == todayDate,
                                amount: weekly[i].amount,
                              ),
                              if (i < weekly.length - 1) const SizedBox(width: 6),
                            ],
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // ── Recent Sales ──────────────────────────────────────
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(LucideIcons.receipt, size: 14, color: AppColors.primary),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'RECENT SALES',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.5,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                  GestureDetector(
                    onTap: () => widget.onTabSwitch(1),
                    child: Text(
                      'See All',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

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
                            Text('No sales yet',
                                style: GoogleFonts.hankenGrotesk(
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.inkPrimary,
                                )),
                            Text('Tap + to record your first sale',
                                style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkTertiary)),
                          ],
                        ),
                      ),
                    );
                  }
                  final recent = sales.take(5).toList();
                  return Column(
                    children: recent.asMap().entries.map((e) {
                      final sale = e.value;
                      final isLast = e.key == recent.length - 1;
                      return Padding(
                        padding: EdgeInsets.only(bottom: isLast ? 0 : 10),
                        child: _ActivityItem(
                          label: (sale.customerInfo?['name'] as String?)?.isNotEmpty == true
                              ? sale.customerInfo!['name'] as String
                              : 'Walk-in Customer',
                          subtitle: _formatDate(sale.date),
                          amount: sale.totalAmount ?? 0,
                          status: sale.paymentMethod ?? 'CASH',
                        ),
                      );
                    }).toList(),
                  );
                },
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2),
                  ),
                ),
                error: (e, _) => Text('Error: $e',
                    style: GoogleFonts.inter(color: AppColors.danger)),
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

  String _fmtAmount(double amount) {
    // Indian number system grouping (lakhs/crores style): 1,23,456.00
    final whole = amount.truncate();
    final str = whole.toString();
    String grouped;
    if (str.length <= 3) {
      grouped = str;
    } else {
      final last3 = str.substring(str.length - 3);
      final rest = str.substring(0, str.length - 3);
      final restGrouped = rest.replaceAllMapped(
        RegExp(r'(\d)(?=(\d{2})+$)'),
        (m) => '${m[1]},',
      );
      grouped = '$restGrouped,$last3';
    }
    return '₹$grouped';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card — hero (gradient) or metric (white)
// ─────────────────────────────────────────────────────────────────────────────

class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? accentColor;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool isHero;

  const _KpiCard({
    required this.label,
    required this.value,
    required this.icon,
    this.accentColor,
    this.trailing,
    this.onTap,
    this.isHero = false,
  });

  @override
  Widget build(BuildContext context) {
    final valueColor = accentColor ?? AppColors.inkPrimary;

    if (isHero) {
      // ── Hero card (TODAY'S REVENUE) — dark gradient, full-width ──
      return GestureDetector(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 22),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF1e3600), Color(0xFF446900)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(22),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF446900).withValues(alpha: 0.35),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Stack(clipBehavior: Clip.hardEdge, children: [
            Positioned(
              right: -16,
              bottom: -16,
              child: Icon(icon, size: 90,
                  color: Colors.white.withValues(alpha: 0.06)),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                  child: Text(label,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10, fontWeight: FontWeight.w700,
                      letterSpacing: 1.4,
                      color: AppColors.primaryContainer.withValues(alpha: 0.7),
                    ),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (trailing != null) ...[
                  const SizedBox(width: 8), trailing!,
                ],
              ]),
              const SizedBox(height: 10),
              Text(value,
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 34, fontWeight: FontWeight.w900,
                  color: Colors.white, letterSpacing: -1.2,
                ),
              ),
              const SizedBox(height: 6),
              Row(children: [
                Container(
                  width: 6, height: 6,
                  decoration: const BoxDecoration(
                    color: AppColors.primaryContainer,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text('Today',
                  style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.5),
                  ),
                ),
              ]),
            ]),
          ]),
        ),
      );
    }

    // ── Metric card — white, colored icon + value ──
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.black.withValues(alpha: 0.04)),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: valueColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, size: 15, color: valueColor),
                ),
                if (trailing != null) trailing!,
              ],
            ),
            const SizedBox(height: 12),
            Text(value,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 24, fontWeight: FontWeight.w800,
                color: valueColor, letterSpacing: -0.8,
              ),
            ),
            const SizedBox(height: 3),
            Text(label,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9, fontWeight: FontWeight.w600,
                letterSpacing: 0.8, color: AppColors.inkTertiary,
              ),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            ),
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
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
            boxShadow: [AppColors.cardShadow],
          ),
          child: Column(
            children: [
              Icon(icon, size: 20, color: AppColors.primary),
              const SizedBox(height: 6),
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.inkPrimary,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar chart
// ─────────────────────────────────────────────────────────────────────────────

class _Bar extends StatelessWidget {
  final double frac;
  final String day;
  final bool isHighlight;
  final double amount;

  const _Bar({required this.frac, required this.day, this.isHighlight = false, this.amount = 0});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Expanded(
            child: FractionallySizedBox(
              heightFactor: frac,
              alignment: Alignment.bottomCenter,
              child: Container(
                decoration: BoxDecoration(
                  color: isHighlight ? AppColors.primary : AppColors.primaryContainer.withValues(alpha: 0.5),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            day.substring(0, 1),
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              color: isHighlight ? AppColors.primary : AppColors.inkTertiary,
              fontWeight: isHighlight ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ],
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

  const _ActivityItem({
    required this.label,
    required this.subtitle,
    required this.amount,
    required this.status,
  });

  String _initials(String name) {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts[0].isNotEmpty) return parts[0][0].toUpperCase();
    return '?';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: const BoxDecoration(
              color: AppColors.secondaryContainer,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                _initials(label),
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.secondary,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 10,
                    color: AppColors.inkTertiary,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '+₹${amount.abs().toStringAsFixed(0)}',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: AppColors.inkPrimary,
                ),
              ),
              const SizedBox(height: 3),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  status,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 9,
                    color: AppColors.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
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
