import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/widgets/trial_banner.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/menu/presentation/menu_screen.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _selectedIndex = 0;

  static const _tabs = [
    DashboardHome(),
    SalesScreen(),
    InventoryScreen(),
    CRMScreen(),
    MenuScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: Stack(
        children: [
          IndexedStack(index: _selectedIndex, children: _tabs),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _LuminaBottomNav(
              selectedIndex: _selectedIndex,
              onTap: (i) => setState(() => _selectedIndex = i),
            ),
          ),
        ],
      ),
    );
  }
}

class _LuminaBottomNav extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onTap;

  const _LuminaBottomNav({required this.selectedIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 80,
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _NavItem(icon: LucideIcons.layoutDashboard, index: 0, selectedIndex: selectedIndex, onTap: onTap),
            _NavItem(icon: LucideIcons.shoppingCart, index: 1, selectedIndex: selectedIndex, onTap: onTap),
            _NavItem(icon: LucideIcons.package, index: 2, selectedIndex: selectedIndex, onTap: onTap),
            _NavItem(icon: LucideIcons.users, index: 3, selectedIndex: selectedIndex, onTap: onTap),
            _NavItem(icon: LucideIcons.menu, index: 4, selectedIndex: selectedIndex, onTap: onTap),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final int index;
  final int selectedIndex;
  final ValueChanged<int> onTap;

  const _NavItem({
    required this.icon,
    required this.index,
    required this.selectedIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isSelected = selectedIndex == index;
    return GestureDetector(
      onTap: () => onTap(index),
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Icon(
          icon,
          size: 24,
          color: isSelected ? AppColors.primary : AppColors.inkTertiary,
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Dashboard Home
// ─────────────────────────────────────────────

class DashboardHome extends ConsumerStatefulWidget {
  const DashboardHome({super.key});

  @override
  ConsumerState<DashboardHome> createState() => _DashboardHomeState();
}

class _DashboardHomeState extends ConsumerState<DashboardHome> {
  bool _revenueVisible = true;

  @override
  Widget build(BuildContext context) {
    final telemetryAsync = ref.watch(telemetryProvider);
    final tenantAsync = ref.watch(tenantContextProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 100),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 20),

              // ── Header row ──────────────────────────────────────
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'BizManage',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                      letterSpacing: -0.3,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [AppColors.cardShadow],
                    ),
                    child: const Icon(LucideIcons.bell, size: 20, color: AppColors.inkPrimary),
                  ),
                ],
              ),

              const SizedBox(height: 24),

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
                          fontSize: 26,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                      Text(
                        'Welcome back',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          color: AppColors.inkTertiary,
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

              const SizedBox(height: 24),

              // ── Revenue card ─────────────────────────────────────
              telemetryAsync.when(
                data: (metrics) => _RevenueCard(
                  todaySales: metrics.todaySales,
                  visible: _revenueVisible,
                  onToggle: () => setState(() => _revenueVisible = !_revenueVisible),
                ),
                loading: () => _RevenueCard(
                  todaySales: 0,
                  visible: _revenueVisible,
                  onToggle: () => setState(() => _revenueVisible = !_revenueVisible),
                ),
                error: (_, __) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 24),

              // ── Quick Actions ────────────────────────────────────
              Text(
                'QUICK ACTIONS',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.08,
                  color: AppColors.inkSecondary,
                ),
              ),
              const SizedBox(height: 16),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childAspectRatio: 1.25,
                children: const [
                  _QuickActionCard(icon: LucideIcons.shoppingCart, label: 'New Sale'),
                  _QuickActionCard(icon: LucideIcons.userPlus, label: 'Add Client'),
                  _QuickActionCard(icon: LucideIcons.package, label: 'Inventory'),
                  _QuickActionCard(icon: LucideIcons.fileText, label: 'Invoice'),
                ],
              ),

              const SizedBox(height: 32),

              // ── Analytics card ───────────────────────────────────
              Container(
                padding: const EdgeInsets.all(24),
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
                        Text(
                          'This Week',
                          style: GoogleFonts.hankenGrotesk(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppColors.inkPrimary,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer.withValues(alpha: 0.25),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '↑ 4.9% from last week',
                            style: GoogleFonts.inter(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      height: 80,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _Bar(height: 40),
                          _Bar(height: 55),
                          _Bar(height: 35),
                          _Bar(height: 70),
                          _Bar(height: 50),
                          _Bar(height: 80, isHighlight: true),
                          _Bar(height: 60),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                          .map((d) => Text(
                                d,
                                style: GoogleFonts.inter(
                                  fontSize: 10,
                                  color: AppColors.inkTertiary,
                                ),
                              ))
                          .toList(),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 32),

              // ── Recent Activity ──────────────────────────────────
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'RECENT ACTIVITY',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.08,
                      color: AppColors.inkSecondary,
                    ),
                  ),
                  Text(
                    'View All',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              telemetryAsync.when(
                data: (metrics) => Column(
                  children: [
                    _ActivityItem(
                      label: 'Today Sales',
                      type: 'Sale',
                      amount: metrics.todaySales,
                      isPositive: true,
                      time: 'Today',
                    ),
                    const SizedBox(height: 12),
                    _ActivityItem(
                      label: 'Today Expenses',
                      type: 'Expense',
                      amount: metrics.todayExpenses,
                      isPositive: false,
                      time: 'Today',
                    ),
                    const SizedBox(height: 12),
                    _ActivityItem(
                      label: 'Cash Balance',
                      type: 'Balance',
                      amount: metrics.currentCashBalance,
                      isPositive: metrics.currentCashBalance >= 0,
                      time: 'Current',
                    ),
                  ],
                ),
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                ),
                error: (e, _) => Text(
                  'Error: $e',
                  style: GoogleFonts.inter(color: AppColors.danger),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Revenue Card ──────────────────────────────────────────────────────────────

class _RevenueCard extends StatelessWidget {
  final double todaySales;
  final bool visible;
  final VoidCallback onToggle;

  const _RevenueCard({
    required this.todaySales,
    required this.visible,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.25),
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
                'TOTAL REVENUE',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.08,
                  color: Colors.white.withValues(alpha: 0.7),
                ),
              ),
              GestureDetector(
                onTap: onToggle,
                child: Icon(
                  visible ? LucideIcons.eye : LucideIcons.eyeOff,
                  size: 20,
                  color: Colors.white.withValues(alpha: 0.7),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            visible ? '₹${todaySales.toStringAsFixed(0)}' : '₹ ••••••',
            style: GoogleFonts.hankenGrotesk(
              fontSize: 36,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: () {},
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryContainer,
                    foregroundColor: AppColors.primary,
                    elevation: 0,
                    shape: const StadiumBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    textStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                  child: const Text('New Sale'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton(
                  onPressed: () {},
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white38, width: 1.5),
                    shape: const StadiumBorder(),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  child: const Text('Add Expense'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Quick Action Card ─────────────────────────────────────────────────────────

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String label;

  const _QuickActionCard({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primaryContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: AppColors.primary),
          ),
          const SizedBox(height: 12),
          Text(
            label,
            style: GoogleFonts.hankenGrotesk(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.inkPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Bar chart widget ──────────────────────────────────────────────────────────

class _Bar extends StatelessWidget {
  final double height;
  final bool isHighlight;

  const _Bar({required this.height, this.isHighlight = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: height,
      decoration: BoxDecoration(
        color: isHighlight ? AppColors.primaryContainer : AppColors.primaryContainer.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(6),
      ),
    );
  }
}

// ── Activity Item ─────────────────────────────────────────────────────────────

class _ActivityItem extends StatelessWidget {
  final String label;
  final String type;
  final double amount;
  final bool isPositive;
  final String time;

  const _ActivityItem({
    required this.label,
    required this.type,
    required this.amount,
    required this.isPositive,
    required this.time,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: isPositive ? AppColors.success : AppColors.danger,
              shape: BoxShape.circle,
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
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkPrimary,
                  ),
                ),
                Text(
                  type,
                  style: GoogleFonts.inter(
                    fontSize: 11,
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
                '${isPositive ? '+' : '-'} ₹${amount.abs().toStringAsFixed(0)}',
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: isPositive ? AppColors.success : AppColors.danger,
                ),
              ),
              Text(
                time,
                style: GoogleFonts.inter(
                  fontSize: 10,
                  color: AppColors.inkTertiary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
