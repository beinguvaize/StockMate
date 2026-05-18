import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart';
import 'package:mobile_app/features/hr/presentation/providers/hr_provider.dart';
import 'package:mobile_app/features/hr/presentation/add_employee_screen.dart';
import 'package:mobile_app/core/supabase/client.dart';

class HRScreen extends ConsumerWidget {
  const HRScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
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
          actions: const [],
          bottom: TabBar(
            indicatorColor: AppColors.primary,
            indicatorWeight: 2,
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.inkTertiary,
            labelStyle: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
            unselectedLabelStyle: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.5,
            ),
            tabs: const [
              Tab(text: 'EMPLOYEES'),
              Tab(text: 'HISTORY'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _EmployeesTab(),
            _PayrollHistoryTab(),
          ],
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
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Tab 1 — Employees
// ---------------------------------------------------------------------------
class _EmployeesTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeesAsync = ref.watch(employeesProvider);

    return SafeArea(
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

              // Section header with Process Payroll chip
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
                      const Spacer(),
                      GestureDetector(
                        onTap: () => _openProcessPayroll(context, ref, employees),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer.withValues(alpha: 0.6),
                            borderRadius: BorderRadius.circular(100),
                            border: Border.all(
                              color: AppColors.primary.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(LucideIcons.play,
                                  size: 11, color: AppColors.primary),
                              const SizedBox(width: 5),
                              Text(
                                'PROCESS PAYROLL',
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 1.0,
                                  color: AppColors.primary,
                                ),
                              ),
                            ],
                          ),
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

  void _openProcessPayroll(
      BuildContext context, WidgetRef ref, List<Employee> employees) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ProcessPayrollSheet(employees: employees, ref: ref),
    );
  }
}

// ---------------------------------------------------------------------------
// Tab 2 — Payroll History
// ---------------------------------------------------------------------------
class _PayrollHistoryTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payrollAsync = ref.watch(payrollRecordsProvider);
    final employeesAsync = ref.watch(employeesProvider);

    return SafeArea(
      child: payrollAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(
          child: Text('Error: $err',
              style: GoogleFonts.inter(color: AppColors.danger)),
        ),
        data: (records) {
          // Build employee name lookup map
          final Map<String, String> empNames = {};
          if (employeesAsync.hasValue) {
            for (final emp in employeesAsync.value!) {
              empNames[emp.id] = emp.name ?? 'Unknown';
            }
          }

          if (records.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(LucideIcons.banknote,
                      size: 48, color: AppColors.inkTertiary),
                  const SizedBox(height: 12),
                  Text(
                    'No payroll records yet.',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkSecondary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Run your first payroll.',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      color: AppColors.inkTertiary,
                    ),
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            itemCount: records.length,
            itemBuilder: (context, index) {
              final record = records[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _PayrollRecordCard(record: record, empNames: empNames),
              );
            },
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Payroll record card
// ---------------------------------------------------------------------------
class _PayrollRecordCard extends StatelessWidget {
  final Map<String, dynamic> record;
  final Map<String, String> empNames;

  const _PayrollRecordCard({required this.record, required this.empNames});

  String _formatPeriodDate(String? dateStr) {
    if (dateStr == null) return '';
    try {
      final dt = DateTime.parse(dateStr);
      const months = [
        '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      return '${dt.day} ${months[dt.month]} ${dt.year}';
    } catch (_) {
      return dateStr;
    }
  }

  String _relativeTime(String? isoStr) {
    if (isoStr == null) return '';
    try {
      final dt = DateTime.parse(isoStr).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.inSeconds < 60) return 'just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays == 1) return '1 day ago';
      if (diff.inDays < 30) return '${diff.inDays} days ago';
      const months = [
        '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      return '${dt.day} ${months[dt.month]} ${dt.year}';
    } catch (_) {
      return isoStr;
    }
  }

  @override
  Widget build(BuildContext context) {
    final employeeId = record['employee_id'] as String? ?? '';
    final name = record['employee_name'] as String? ??
        empNames[employeeId] ??
        'Unknown';
    final avatarLetter = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final netPay = (record['net_pay'] as num?)?.toDouble() ?? 0.0;
    final status = (record['status'] as String? ?? 'PENDING').toUpperCase();
    final periodStart = _formatPeriodDate(record['pay_period_start'] as String?);
    final periodEnd = _formatPeriodDate(record['pay_period_end'] as String?);
    final paidAt = _relativeTime(record['paid_at'] as String?);

    final Color statusBg;
    final Color statusFg;
    final String statusLabel;
    if (status == 'PAID') {
      statusBg = AppColors.success.withValues(alpha: 0.12);
      statusFg = AppColors.success;
      statusLabel = 'PAID';
    } else {
      statusBg = AppColors.warning.withValues(alpha: 0.12);
      statusFg = AppColors.warning;
      statusLabel = 'PENDING';
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

          // Details
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
                const SizedBox(height: 2),
                Text(
                  '$periodStart – $periodEnd',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: AppColors.inkSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
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
                    if (paidAt.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Text(
                        paidAt,
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          color: AppColors.inkTertiary,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(width: 10),

          // Net pay
          Text(
            '₹${netPay.toStringAsFixed(2)}',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.success,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Process Payroll bottom sheet
// ---------------------------------------------------------------------------
class _ProcessPayrollSheet extends StatefulWidget {
  final List<Employee> employees;
  final WidgetRef ref;

  const _ProcessPayrollSheet({required this.employees, required this.ref});

  @override
  State<_ProcessPayrollSheet> createState() => _ProcessPayrollSheetState();
}

class _ProcessPayrollSheetState extends State<_ProcessPayrollSheet> {
  int _month = DateTime.now().month;
  int _year = DateTime.now().year;
  bool _isRunning = false;

  late final List<_EmpPayEntry> _entries;

  WidgetRef get ref => widget.ref;

  static const _monthNames = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  @override
  void initState() {
    super.initState();
    _entries = widget.employees
        .where((e) =>
            e.status == 'ACTIVE' || e.status == 'Active')
        .map((e) => _EmpPayEntry(
              employee: e,
              basePayCtrl:
                  TextEditingController(text: (e.salary ?? 0).toStringAsFixed(0)),
              bonusCtrl: TextEditingController(text: '0'),
              deductionsCtrl: TextEditingController(text: '0'),
            ))
        .toList();
    for (final entry in _entries) {
      entry.basePayCtrl.addListener(() => setState(() {}));
      entry.bonusCtrl.addListener(() => setState(() {}));
      entry.deductionsCtrl.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    for (final e in _entries) {
      e.basePayCtrl.dispose();
      e.bonusCtrl.dispose();
      e.deductionsCtrl.dispose();
    }
    super.dispose();
  }

  void _prevMonth() {
    setState(() {
      if (_month == 1) {
        _month = 12;
        _year -= 1;
      } else {
        _month -= 1;
      }
    });
  }

  void _nextMonth() {
    setState(() {
      if (_month == 12) {
        _month = 1;
        _year += 1;
      } else {
        _month += 1;
      }
    });
  }

  double _net(_EmpPayEntry entry) {
    final base = double.tryParse(entry.basePayCtrl.text) ?? 0;
    final bonus = double.tryParse(entry.bonusCtrl.text) ?? 0;
    final deductions = double.tryParse(entry.deductionsCtrl.text) ?? 0;
    return base + bonus - deductions;
  }

  Future<void> _runPayroll() async {
    setState(() => _isRunning = true);
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw Exception('Not authenticated');
      final tenantId = ctx.tenantId;

      final now = DateTime.now();
      final monthStr =
          '$_year-${_month.toString().padLeft(2, '0')}';
      final lastDay = DateTime(_year, _month + 1, 0).day;

      for (final entry in _entries) {
        final emp = entry.employee;
        final basePay = double.tryParse(entry.basePayCtrl.text) ?? 0;
        final bonus = double.tryParse(entry.bonusCtrl.text) ?? 0;
        final deductions = double.tryParse(entry.deductionsCtrl.text) ?? 0;
        final netPay = basePay + bonus - deductions;

        await supabase.from('payroll_records').insert({
          'id': 'PR-${now.millisecondsSinceEpoch}-${emp.id.substring(0, 6)}',
          'tenant_id': tenantId,
          'employee_id': emp.id,
          'employee_name': emp.name,
          'pay_period_start': '$monthStr-01',
          'pay_period_end': '$monthStr-$lastDay',
          'base_pay': basePay,
          'bonus': bonus,
          'deductions': deductions,
          'net_pay': netPay,
          'status': 'PAID',
          'paid_at': now.toIso8601String(),
        });
      }

      ref.invalidate(payrollRecordsProvider);
      ref.invalidate(employeesProvider);

      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Payroll processed for ${_entries.length} employees',
            style: GoogleFonts.inter(color: AppColors.inkPrimary),
          ),
          backgroundColor: AppColors.primaryContainer,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12)),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() => _isRunning = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e',
                style: GoogleFonts.inter(color: Colors.white)),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.88,
      ),
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
          const SizedBox(height: 20),

          // Title
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                const Icon(LucideIcons.banknote,
                    size: 20, color: AppColors.primary),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Process Payroll',
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppColors.inkPrimary,
                        letterSpacing: -0.3,
                      ),
                    ),
                    Text(
                      'Run payroll for all active employees',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: AppColors.inkSecondary,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Month selector
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
              decoration: BoxDecoration(
                color: AppColors.canvas,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    icon: const Icon(LucideIcons.chevronLeft,
                        size: 18, color: AppColors.inkSecondary),
                    onPressed: _prevMonth,
                    splashRadius: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${_monthNames[_month]} $_year',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(LucideIcons.chevronRight,
                        size: 18, color: AppColors.inkSecondary),
                    onPressed: _nextMonth,
                    splashRadius: 20,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Employee entries
          if (_entries.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'No active employees found.',
                style: GoogleFonts.inter(
                    fontSize: 14, color: AppColors.inkSecondary),
              ),
            )
          else
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                itemCount: _entries.length,
                itemBuilder: (context, index) {
                  final entry = _entries[index];
                  final net = _net(entry);
                  final name = entry.employee.name ?? 'Unknown';
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.canvas,
                      borderRadius: BorderRadius.circular(16),
                      border:
                          Border.all(color: Colors.black.withValues(alpha: 0.06)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              decoration: const BoxDecoration(
                                color: AppColors.secondaryContainer,
                                shape: BoxShape.circle,
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                name.isNotEmpty ? name[0].toUpperCase() : '?',
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.secondary,
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                name,
                                style: GoogleFonts.hankenGrotesk(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.inkPrimary,
                                ),
                              ),
                            ),
                            Text(
                              'Net: ₹${net.toStringAsFixed(2)}',
                              style: GoogleFonts.jetBrainsMono(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: AppColors.success,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: _PayField(
                                label: 'Base Pay',
                                controller: entry.basePayCtrl,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _PayField(
                                label: 'Bonus',
                                controller: entry.bonusCtrl,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _PayField(
                                label: 'Deductions',
                                controller: entry.deductionsCtrl,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),

          const SizedBox(height: 16),

          // Run Payroll button
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: SizedBox(
              width: double.infinity,
              child: Material(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: (_isRunning || _entries.isEmpty) ? null : _runPayroll,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Center(
                      child: _isRunning
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(LucideIcons.play,
                                    size: 16, color: Colors.white),
                                const SizedBox(width: 8),
                                Text(
                                  'RUN PAYROLL',
                                  style: GoogleFonts.jetBrainsMono(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 1.0,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                    ),
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

class _EmpPayEntry {
  final Employee employee;
  final TextEditingController basePayCtrl;
  final TextEditingController bonusCtrl;
  final TextEditingController deductionsCtrl;

  _EmpPayEntry({
    required this.employee,
    required this.basePayCtrl,
    required this.bonusCtrl,
    required this.deductionsCtrl,
  });
}

class _PayField extends StatelessWidget {
  final String label;
  final TextEditingController controller;

  const _PayField({required this.label, required this.controller});

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      style: GoogleFonts.jetBrainsMono(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: AppColors.inkPrimary,
      ),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.inter(
          fontSize: 11,
          color: AppColors.inkTertiary,
        ),
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide:
              BorderSide(color: Colors.black.withValues(alpha: 0.1)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide:
              BorderSide(color: Colors.black.withValues(alpha: 0.1)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        filled: true,
        fillColor: AppColors.surface,
      ),
    );
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
                      padding:
                          const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
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
                    valueColor:
                        outstanding > 0 ? AppColors.danger : AppColors.success,
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
                  backgroundColor:
                      AppColors.primaryContainer.withValues(alpha: 0.5),
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
