import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/trial_banner.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_supplier_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/finance/presentation/add_expense_screen.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/hr/presentation/hr_screen.dart';
import 'package:mobile_app/features/inventory/presentation/add_product_screen.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart';
import 'package:mobile_app/features/menu/presentation/menu_screen.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
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

  static const _navItems = [
    (icon: LucideIcons.layoutDashboard, label: 'Dashboard'),
    (icon: LucideIcons.shoppingCart, label: 'Sales'),
    (icon: LucideIcons.package, label: 'Inventory'),
    (icon: LucideIcons.users, label: 'Clients'),
    (icon: LucideIcons.moreHorizontal, label: 'More'),
  ];

  void _switchTab(int index) => setState(() => _selectedIndex = index);

  List<Widget> get _tabs => [
    DashboardHome(onTabSwitch: _switchTab),
    const SalesScreen(),
    const InventoryScreen(),
    const CRMScreen(),
    const MenuScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      floatingActionButton: FloatingActionButton(
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
      body: Stack(
        children: [
          IndexedStack(index: _selectedIndex, children: _tabs),

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
                                letterSpacing: 0.03,
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
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Home
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
    final tenantAsync = ref.watch(tenantContextProvider);
    final recentSalesAsync = ref.watch(recentSalesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 120),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 16),

              // ── Top App Bar ───────────────────────────────────────
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'StockMate',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: AppColors.secondary,
                      letterSpacing: -0.3,
                    ),
                  ),
                  GestureDetector(
                    onTap: () => widget.onTabSwitch(2),
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Icon(LucideIcons.bell, size: 22, color: AppColors.onSurfaceVariant),
                        telemetryAsync.whenData((m) => m.lowStockItems).when(
                          data: (count) => count > 0
                              ? Positioned(
                                  top: -2,
                                  right: -2,
                                  child: Container(
                                    width: 10,
                                    height: 10,
                                    decoration: const BoxDecoration(
                                      color: AppColors.danger,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                )
                              : const SizedBox.shrink(),
                          loading: () => const SizedBox.shrink(),
                          error: (_, __) => const SizedBox.shrink(),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 20),

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
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          color: AppColors.inkSecondary,
                        ),
                      ),
                      if (ctx != null && ctx.tenant.status == 'TRIAL' && ctx.trialDaysLeft <= 7) ...[
                        const SizedBox(height: 12),
                        TrialBanner(daysLeft: ctx.trialDaysLeft),
                      ],
                    ],
                  );
                },
                loading: () => const SizedBox(height: 52),
                error: (_, __) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 20),

              // ── EXPENSES + OUTSTANDING — TOP ──────────────────────
              telemetryAsync.when(
                data: (m) => Row(
                  children: [
                    _SummaryChip(
                      label: 'Today\'s Expenses',
                      value: '₹${m.todayExpenses.toStringAsFixed(0)}',
                      icon: LucideIcons.creditCard,
                      color: AppColors.danger,
                      onTap: () => _push(const FinanceScreen()),
                    ),
                    const SizedBox(width: 12),
                    _SummaryChip(
                      label: 'Outstanding',
                      value: '₹${m.outstandingCollections.toStringAsFixed(0)}',
                      icon: LucideIcons.clock,
                      color: AppColors.warning,
                      onTap: () => _push(const PurchasesScreen()),
                    ),
                  ],
                ),
                loading: () => Row(
                  children: [
                    _SummaryChipSkeleton(),
                    const SizedBox(width: 12),
                    _SummaryChipSkeleton(),
                  ],
                ),
                error: (_, __) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 20),

              // ── Revenue Hero Card (LIME) ──────────────────────────
              telemetryAsync.when(
                data: (metrics) => _RevenueCard(
                  revenue: metrics.todaySales,
                  visible: _revenueVisible,
                  onToggle: () => setState(() => _revenueVisible = !_revenueVisible),
                  onPayout: () => _push(const AddExpenseScreen()),
                  onTopUp: () => _push(const AddProductScreen()),
                ),
                loading: () => _RevenueCard(
                  revenue: 0,
                  visible: _revenueVisible,
                  onToggle: () => setState(() => _revenueVisible = !_revenueVisible),
                  onPayout: () {},
                  onTopUp: () {},
                ),
                error: (_, __) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 32),

              // ── All Features ──────────────────────────────────────
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(LucideIcons.layoutGrid, size: 14, color: AppColors.primary),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'ALL FEATURES',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.5,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 3,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.9,
                children: [
                  _FeatureTile(
                    icon: LucideIcons.shoppingBag,
                    label: 'New Sale',
                    color: AppColors.primary,
                    bg: AppColors.primaryContainer.withValues(alpha: 0.35),
                    isPrimary: true,
                    onTap: () => _push(const AddSaleScreen()),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.fileText,
                    label: 'Sales History',
                    color: AppColors.primary,
                    bg: AppColors.primaryContainer.withValues(alpha: 0.15),
                    onTap: () => widget.onTabSwitch(1),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.package,
                    label: 'Inventory',
                    color: const Color(0xFF5b5f5a),
                    bg: const Color(0x22d0d3cc),
                    onTap: () => widget.onTabSwitch(2),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.users,
                    label: 'Clients',
                    color: AppColors.secondary,
                    bg: AppColors.secondaryContainer.withValues(alpha: 0.5),
                    onTap: () => widget.onTabSwitch(3),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.building2,
                    label: 'Suppliers',
                    color: AppColors.secondary,
                    bg: AppColors.secondaryContainer.withValues(alpha: 0.35),
                    onTap: () => _push(const AddSupplierScreen()),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.shoppingCart,
                    label: 'Purchases',
                    color: AppColors.warning,
                    bg: AppColors.warning.withValues(alpha: 0.1),
                    onTap: () => _push(const PurchasesScreen()),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.creditCard,
                    label: 'Expenses',
                    color: AppColors.danger,
                    bg: AppColors.danger.withValues(alpha: 0.08),
                    onTap: () => _push(const FinanceScreen()),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.bookOpen,
                    label: 'Day Book',
                    color: AppColors.info,
                    bg: AppColors.info.withValues(alpha: 0.1),
                    onTap: () => _push(const DayBookScreen()),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.barChart2,
                    label: 'Reports',
                    color: AppColors.primary,
                    bg: AppColors.primaryContainer.withValues(alpha: 0.2),
                    onTap: () => _push(const ReportsScreen()),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.users2,
                    label: 'HR & Payroll',
                    color: AppColors.secondary,
                    bg: AppColors.secondaryContainer.withValues(alpha: 0.4),
                    onTap: () => _push(const HRScreen()),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.truck,
                    label: 'Fleet',
                    color: const Color(0xFF5b5f5a),
                    bg: const Color(0x22d0d3cc),
                    onTap: () => _push(const LogisticsScreen()),
                  ),
                  _FeatureTile(
                    icon: LucideIcons.settings,
                    label: 'Settings',
                    color: AppColors.inkSecondary,
                    bg: Colors.black.withValues(alpha: 0.05),
                    onTap: () => _push(const SettingsScreen()),
                  ),
                ],
              ),

              const SizedBox(height: 32),

              // ── Sales Analytics ──────────────────────────────────
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
                              'Sales Analytics',
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: AppColors.inkPrimary,
                              ),
                            ),
                            telemetryAsync.when(
                              data: (m) => Text(
                                '${m.totalProducts} products · ${m.lowStockItems} low stock',
                                style: GoogleFonts.inter(
                                  fontSize: 12,
                                  color: AppColors.onSurfaceVariant,
                                ),
                              ),
                              loading: () => const SizedBox.shrink(),
                              error: (_, __) => const SizedBox.shrink(),
                            ),
                          ],
                        ),
                        GestureDetector(
                          onTap: () => widget.onTabSwitch(1),
                          child: const Icon(LucideIcons.trendingUp, size: 22, color: AppColors.primary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    const SizedBox(
                      height: 80,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _Bar(frac: 0.40),
                          SizedBox(width: 6),
                          _Bar(frac: 0.60),
                          SizedBox(width: 6),
                          _Bar(frac: 0.45),
                          SizedBox(width: 6),
                          _Bar(frac: 0.85, isHighlight: true),
                          SizedBox(width: 6),
                          _Bar(frac: 0.55),
                          SizedBox(width: 6),
                          _Bar(frac: 0.70),
                          SizedBox(width: 6),
                          _Bar(frac: 0.95),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: ['S', 'M', 'T', 'W', 'T', 'F', 'S']
                          .map((d) => Text(
                                d,
                                style: GoogleFonts.inter(
                                  fontSize: 11,
                                  color: AppColors.outline,
                                  fontWeight: FontWeight.w500,
                                ),
                              ))
                          .toList(),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 32),

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
                        child: Text(
                          'No sales yet. Tap + to record one.',
                          style: GoogleFonts.inter(color: AppColors.inkTertiary),
                          textAlign: TextAlign.center,
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
                          isPositive: true,
                          status: sale.paymentMethod ?? 'CASH',
                        ),
                      );
                    }).toList(),
                  );
                },
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: CircularProgressIndicator(
                      color: AppColors.primary,
                      strokeWidth: 2,
                    ),
                  ),
                ),
                error: (e, _) => Text('Error: $e',
                    style: GoogleFonts.inter(color: AppColors.danger)),
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Revenue Card
// ─────────────────────────────────────────────────────────────────────────────

class _RevenueCard extends StatelessWidget {
  final double revenue;
  final bool visible;
  final VoidCallback onToggle;
  final VoidCallback onPayout;
  final VoidCallback onTopUp;

  const _RevenueCard({
    required this.revenue,
    required this.visible,
    required this.onToggle,
    required this.onPayout,
    required this.onTopUp,
  });

  @override
  Widget build(BuildContext context) {
    const textDark = Color(0xFF121f00);
    const textMuted = Color(0x99121f00);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.primaryContainer,
        borderRadius: BorderRadius.circular(32),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFa3e635).withValues(alpha: 0.15),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'TODAY\'S REVENUE',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.5,
                  color: textMuted,
                ),
              ),
              GestureDetector(
                onTap: onToggle,
                child: Icon(
                  visible ? LucideIcons.eye : LucideIcons.eyeOff,
                  size: 20,
                  color: textMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            visible ? '₹${revenue.toStringAsFixed(0)}' : '₹ ••••••',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 40,
              fontWeight: FontWeight.w900,
              color: textDark,
              letterSpacing: -1.5,
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onPayout,
                  icon: const Icon(LucideIcons.send, size: 15),
                  label: const Text('Add Expense'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.secondary,
                    foregroundColor: AppColors.primaryContainer,
                    elevation: 0,
                    shape: const StadiumBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 12),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onTopUp,
                  icon: const Icon(LucideIcons.plus, size: 15),
                  label: const Text('Add Stock'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFb2f746),
                    foregroundColor: textDark,
                    elevation: 0,
                    shape: const StadiumBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 12),
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
// Feature Tile (3-col grid)
// ─────────────────────────────────────────────────────────────────────────────

class _FeatureTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final Color bg;
  final bool isPrimary;
  final VoidCallback onTap;

  const _FeatureTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.bg,
    required this.onTap,
    this.isPrimary = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isPrimary ? AppColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isPrimary ? Colors.transparent : Colors.black.withValues(alpha: 0.06),
          ),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isPrimary ? Colors.white.withValues(alpha: 0.2) : bg,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                icon,
                size: 20,
                color: isPrimary ? Colors.white : color,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: isPrimary ? Colors.white : AppColors.inkPrimary,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Chip (top row)
// ─────────────────────────────────────────────────────────────────────────────

class _SummaryChip extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const _SummaryChip({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withValues(alpha: 0.15)),
            boxShadow: [AppColors.cardShadow],
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 16, color: color),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: GoogleFonts.inter(
                        fontSize: 10,
                        color: AppColors.inkTertiary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    Text(
                      value,
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: color,
                      ),
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
}

// Skeleton placeholder while loading
class _SummaryChipSkeleton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        height: 64,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [AppColors.cardShadow],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar chart bar
// ─────────────────────────────────────────────────────────────────────────────

class _Bar extends StatelessWidget {
  final double frac;
  final bool isHighlight;

  const _Bar({required this.frac, this.isHighlight = false});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: FractionallySizedBox(
        heightFactor: frac,
        alignment: Alignment.bottomCenter,
        child: Container(
          decoration: BoxDecoration(
            color: isHighlight
                ? AppColors.primaryContainer
                : AppColors.surfaceContainer,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Item
// ─────────────────────────────────────────────────────────────────────────────

class _ActivityItem extends StatelessWidget {
  final String label;
  final String subtitle;
  final double amount;
  final bool isPositive;
  final String status;

  const _ActivityItem({
    required this.label,
    required this.subtitle,
    required this.amount,
    required this.isPositive,
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
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: AppColors.secondaryContainer,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                _initials(label),
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 15,
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
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${isPositive ? '+' : '-'}₹${amount.abs().toStringAsFixed(0)}',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: isPositive ? AppColors.inkPrimary : AppColors.danger,
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
                    letterSpacing: 0.3,
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
