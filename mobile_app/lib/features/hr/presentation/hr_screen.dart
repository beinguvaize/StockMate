import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/hr/presentation/providers/hr_provider.dart';
import 'package:mobile_app/features/hr/presentation/add_employee_screen.dart';

class HRScreen extends ConsumerWidget {
  const HRScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeesAsync = ref.watch(employeesProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'HR & Payroll',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'WORKFORCE MANAGEMENT',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.inkSecondary,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: employeesAsync.when(
          data: (employees) {
            final activeCount =
                employees.where((e) => e.status == 'ACTIVE' || e.status == 'Active').length;
            final totalPayroll = employees.fold<double>(
              0,
              (sum, e) => sum + (e.salary ?? 0),
            );

            return CustomScrollView(
              slivers: [
                // Stats row
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                    child: Row(
                      children: [
                        _StatCard(
                          label: 'TOTAL STAFF',
                          value: '${employees.length}',
                          color: AppColors.primary,
                        ),
                        const SizedBox(width: 10),
                        _StatCard(
                          label: 'ACTIVE',
                          value: '$activeCount',
                          color: AppColors.success,
                        ),
                        const SizedBox(width: 10),
                        _StatCard(
                          label: 'MONTHLY PAYROLL',
                          value: '₹${_formatCompact(totalPayroll)}',
                          color: AppColors.secondary,
                        ),
                      ],
                    ),
                  ),
                ),

                // Section header
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 28, 16, 12),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.users, size: 14, color: AppColors.primary),
                        const SizedBox(width: 6),
                        Text(
                          'EMPLOYEES',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.5,
                            color: AppColors.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // Employee list or empty state
                if (employees.isEmpty)
                  SliverFillRemaining(
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(LucideIcons.users,
                              size: 48, color: AppColors.inkTertiary),
                          const SizedBox(height: 12),
                          Text(
                            'No employees yet',
                            style: GoogleFonts.inter(
                              fontSize: 15,
                              color: AppColors.inkSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final employee = employees[index];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _EmployeeCard(employee: employee),
                          );
                        },
                        childCount: employees.length,
                      ),
                    ),
                  ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, stack) => Center(
            child: Text('Error: $err',
                style: GoogleFonts.inter(color: AppColors.danger)),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(
              context, MaterialPageRoute(builder: (_) => const AddEmployeeScreen()));
        },
        backgroundColor: AppColors.primaryContainer,
        shape: const StadiumBorder(),
        child: const Icon(LucideIcons.userPlus, color: AppColors.inkPrimary),
      ),
    );
  }

  static String _formatCompact(double value) {
    if (value >= 100000) {
      return '${(value / 100000).toStringAsFixed(1)}L';
    } else if (value >= 1000) {
      return '${(value / 1000).toStringAsFixed(1)}K';
    }
    return value.toStringAsFixed(0);
  }
}

// ---------------------------------------------------------------------------
// Stat card widget
// ---------------------------------------------------------------------------
class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
          boxShadow: [AppColors.cardShadow],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
                color: color,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: AppColors.inkPrimary,
                letterSpacing: -0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Employee card widget
// ---------------------------------------------------------------------------
class _EmployeeCard extends StatelessWidget {
  final dynamic employee;

  const _EmployeeCard({required this.employee});

  @override
  Widget build(BuildContext context) {
    final name = employee.name ?? 'Unknown';
    final role = employee.role ?? employee.position ?? 'Employee';
    final status = employee.status ?? '';
    final salary = employee.salary ?? 0;

    final avatarLetter = name.isNotEmpty ? name[0].toUpperCase() : '?';

    Color statusBg;
    Color statusFg;
    String statusLabel;

    switch (status.toUpperCase()) {
      case 'ACTIVE':
        statusBg = AppColors.success.withValues(alpha: 0.12);
        statusFg = AppColors.success;
        statusLabel = 'Active';
        break;
      case 'ON LEAVE':
      case 'ON_LEAVE':
        statusBg = AppColors.warning.withValues(alpha: 0.12);
        statusFg = AppColors.warning;
        statusLabel = 'On Leave';
        break;
      default:
        statusBg = AppColors.danger.withValues(alpha: 0.12);
        statusFg = AppColors.danger;
        statusLabel = status.isEmpty ? 'Inactive' : status;
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: AppColors.secondaryContainer,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              avatarLetter,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.secondary,
              ),
            ),
          ),
          const SizedBox(width: 14),

          // Name + role + badge
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  role,
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: AppColors.inkSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                // Status badge pill
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusBg,
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Text(
                    statusLabel,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: statusFg,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 10),

          // Salary
          Text(
            '₹${(salary as num).toStringAsFixed(0)}/mo',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
        ],
      ),
    );
  }
}
