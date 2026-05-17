import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart';
import 'package:mobile_app/features/hr/presentation/providers/hr_provider.dart';
import 'package:mobile_app/features/hr/presentation/add_employee_screen.dart';
import 'package:mobile_app/core/supabase/client.dart';

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
        heroTag: null,
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
// Employee card widget — tappable, opens detail bottom sheet
// ---------------------------------------------------------------------------
class _EmployeeCard extends ConsumerWidget {
  final Employee employee;

  const _EmployeeCard({required this.employee});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = employee.name ?? 'Unknown';
    final role = employee.role ?? employee.position ?? 'Employee';
    final status = employee.status ?? '';
    final salary = employee.salary ?? 0.0;

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

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _showDetailSheet(context, ref),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
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

              // Salary + chevron
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '₹${salary.toStringAsFixed(0)}/mo',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Icon(LucideIcons.chevronRight,
                      size: 14, color: AppColors.inkTertiary),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDetailSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EmployeeDetailSheet(employee: employee, ref: ref),
    );
  }
}

// ---------------------------------------------------------------------------
// Employee detail bottom sheet
// ---------------------------------------------------------------------------
class _EmployeeDetailSheet extends StatefulWidget {
  final Employee employee;
  final WidgetRef ref;

  const _EmployeeDetailSheet({required this.employee, required this.ref});

  @override
  State<_EmployeeDetailSheet> createState() => _EmployeeDetailSheetState();
}

class _EmployeeDetailSheetState extends State<_EmployeeDetailSheet> {
  bool _isDeleting = false;
  bool _isPaying = false;

  Employee get emp => widget.employee;
  WidgetRef get ref => widget.ref;

  String _formatCurrency(double? value) =>
      '₹${(value ?? 0).toStringAsFixed(0)}';

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          'Delete Employee',
          style: GoogleFonts.hankenGrotesk(
            fontWeight: FontWeight.w800,
            color: AppColors.inkPrimary,
          ),
        ),
        content: Text(
          'Remove ${emp.name ?? 'this employee'} from the system? This cannot be undone.',
          style: GoogleFonts.inter(fontSize: 14, color: AppColors.inkSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel',
                style: GoogleFonts.inter(color: AppColors.inkSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
              elevation: 0,
              shape: const StadiumBorder(),
            ),
            child: Text('Delete',
                style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _isDeleting = true);
    try {
      await supabase.from('employees').delete().eq('id', emp.id);
      if (!mounted) return;
      ref.invalidate(employeesProvider);
      Navigator.pop(context); // close sheet
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${emp.name ?? 'Employee'} deleted',
              style: GoogleFonts.inter(color: Colors.white)),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() => _isDeleting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e',
                style: GoogleFonts.inter(color: Colors.white)),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  Future<void> _markSalaryPaid() async {
    final salary = emp.salary ?? 0;
    final amountPaid = emp.amountPaid ?? 0;
    if (salary <= 0 || amountPaid >= salary) return;

    setState(() => _isPaying = true);
    try {
      await supabase
          .from('employees')
          .update({'paid_amount': salary}).eq('id', emp.id);
      if (!mounted) return;
      ref.invalidate(employeesProvider);
      Navigator.pop(context); // close sheet — list will refresh
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Salary marked as paid for ${emp.name ?? 'employee'}',
              style: GoogleFonts.inter(color: AppColors.inkPrimary)),
          backgroundColor: AppColors.primaryContainer,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() => _isPaying = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e',
                style: GoogleFonts.inter(color: Colors.white)),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final salary = emp.salary ?? 0.0;
    final amountPaid = emp.amountPaid ?? 0.0;
    final daysWorked = emp.daysWorked ?? 0.0;
    final outstanding = (salary - amountPaid).clamp(0.0, double.infinity);
    final canMarkPaid = salary > 0 && amountPaid < salary;

    final name = emp.name ?? 'Unknown';
    final role = emp.role ?? emp.position ?? 'Employee';
    final status = emp.status ?? '';
    final avatarLetter = name.isNotEmpty ? name[0].toUpperCase() : '?';

    Color statusFg;
    String statusLabel;
    switch (status.toUpperCase()) {
      case 'ACTIVE':
        statusFg = AppColors.success;
        statusLabel = 'Active';
        break;
      case 'ON LEAVE':
      case 'ON_LEAVE':
        statusFg = AppColors.warning;
        statusLabel = 'On Leave';
        break;
      default:
        statusFg = AppColors.danger;
        statusLabel = status.isEmpty ? 'Inactive' : status;
    }

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          const SizedBox(height: 12),
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.inkTertiary.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 24),

          // Avatar + name
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              color: AppColors.secondaryContainer,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              avatarLetter,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: AppColors.secondary,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            name,
            style: GoogleFonts.hankenGrotesk(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.inkPrimary,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            role,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.inkSecondary,
            ),
          ),
          const SizedBox(height: 8),
          // Status pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: statusFg.withValues(alpha: 0.1),
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

          const SizedBox(height: 24),

          // Info grid
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.canvas,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
              ),
              child: Column(
                children: [
                  _InfoRow(
                    icon: LucideIcons.indianRupee,
                    label: 'Monthly Salary',
                    value: _formatCurrency(salary),
                    valueColor: AppColors.primary,
                  ),
                  _Divider(),
                  _InfoRow(
                    icon: LucideIcons.calendarDays,
                    label: 'Days Worked',
                    value: daysWorked.toStringAsFixed(0),
                  ),
                  _Divider(),
                  _InfoRow(
                    icon: LucideIcons.checkCircle,
                    label: 'Amount Paid',
                    value: _formatCurrency(amountPaid),
                    valueColor: AppColors.success,
                  ),
                  _Divider(),
                  _InfoRow(
                    icon: LucideIcons.alertCircle,
                    label: 'Outstanding',
                    value: _formatCurrency(outstanding),
                    valueColor: outstanding > 0 ? AppColors.danger : AppColors.success,
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Action buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              children: [
                // Mark Salary Paid
                if (canMarkPaid)
                  _ActionButton(
                    label: 'MARK SALARY PAID',
                    icon: LucideIcons.badgeCheck,
                    backgroundColor: AppColors.success.withValues(alpha: 0.12),
                    foregroundColor: AppColors.success,
                    isLoading: _isPaying,
                    onTap: _markSalaryPaid,
                  ),
                if (canMarkPaid) const SizedBox(height: 10),

                // Edit
                _ActionButton(
                  label: 'EDIT EMPLOYEE',
                  icon: LucideIcons.pencil,
                  backgroundColor: AppColors.primaryContainer.withValues(alpha: 0.5),
                  foregroundColor: AppColors.primary,
                  onTap: () {
                    Navigator.pop(context); // close sheet first
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => AddEmployeeScreen(employee: emp),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 10),

                // Delete
                _ActionButton(
                  label: 'DELETE EMPLOYEE',
                  icon: LucideIcons.trash2,
                  backgroundColor: AppColors.danger.withValues(alpha: 0.1),
                  foregroundColor: AppColors.danger,
                  isLoading: _isDeleting,
                  onTap: _delete,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Helper widgets for the bottom sheet
// ---------------------------------------------------------------------------
class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 15, color: AppColors.inkSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.inkSecondary,
              ),
            ),
          ),
          Text(
            value,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: valueColor ?? AppColors.inkPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 1,
      thickness: 1,
      color: Colors.black.withValues(alpha: 0.05),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color backgroundColor;
  final Color foregroundColor;
  final bool isLoading;
  final VoidCallback? onTap;

  const _ActionButton({
    required this.label,
    required this.icon,
    required this.backgroundColor,
    required this.foregroundColor,
    this.isLoading = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: backgroundColor,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: isLoading ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (isLoading)
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    color: foregroundColor,
                    strokeWidth: 2,
                  ),
                )
              else
                Icon(icon, size: 16, color: foregroundColor),
              const SizedBox(width: 8),
              Text(
                label,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: foregroundColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
