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
import 'package:mobile_app/core/utils/payroll_periods.dart';
import 'package:uuid/uuid.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;

class HRScreen extends ConsumerWidget {
  const HRScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 3,
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
                'Payroll',
                style: GoogleFonts.manrope(
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
        toolbarHeight: 0,
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
              Tab(text: 'ATTENDANCE'),
              Tab(text: 'HISTORY'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _EmployeesTab(),
            const _AttendanceTab(),
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
                          style: GoogleFonts.manrope(
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
              style: GoogleFonts.manrope(color: AppColors.danger)),
        ),
      ),
    );
  }

  static String _formatCompact(double value) {
    final whole = value.round();
    final s = whole.abs().toString();
    final grouped = s.length <= 3
        ? s
        : '${s.substring(0, s.length - 3).replaceAllMapped(RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},')},${s.substring(s.length - 3)}';
    return '${whole < 0 ? '-' : ''}$grouped';
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
              style: GoogleFonts.manrope(color: AppColors.danger)),
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
                    style: GoogleFonts.manrope(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkSecondary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Run your first payroll.',
                    style: GoogleFonts.manrope(
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
              style: GoogleFonts.manrope(
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
                  style: GoogleFonts.manrope(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$periodStart – $periodEnd',
                  style: GoogleFonts.manrope(
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
                        style: GoogleFonts.manrope(
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

  /// Has this month already been paid?
  ///
  /// Read straight from the server rather than from whatever the provider last
  /// cached: the phone is the surface most likely to be offline, or to be a
  /// second device running payroll minutes after the desktop did. A stale list
  /// would wave through the exact duplicate this is here to stop.
  ///
  /// The window comparison lives in core/utils/payroll_periods.dart, mirroring
  /// the web rule, because mobile writes 'YYYY-MM' while the desktop also
  /// writes ranges -- a desktop run of 1-8 Aug must block an August run here,
  /// and the two strings share no prefix a comparison would catch.
  Future<List<Map<String, dynamic>>> _alreadyPaid(String tenantId, String period) async {
    final rows = await supabase
        .from('payroll')
        .select('id, period, total_net, processed_at, deleted_at')
        .eq('tenant_id', tenantId)
        .isFilter('deleted_at', null);
    return findOverlappingRuns(period, List<Map<String, dynamic>>.from(rows));
  }

  /// Name what was already paid, then let it through on an explicit choice.
  ///
  /// Deliberately not a bare "are you sure": the cashier needs the amount and
  /// the date to tell a real second payout from a mistaken re-run.
  Future<bool?> _confirmDuplicate(List<Map<String, dynamic>> runs) {
    return showDialog<bool>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: Text(
          runs.length == 1
              ? 'This month has already been paid'
              : 'This month overlaps payments already made',
          style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final r in runs)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  '${describePeriod(r['period'] as String?)} — '
                  '₹${(double.tryParse('${r['total_net'] ?? 0}') ?? 0).toStringAsFixed(0)}'
                  '${r['processed_at'] != null ? ', processed ${'${r['processed_at']}'.substring(0, 10)}' : ''}',
                  style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
            const SizedBox(height: 6),
            Text(
              'Paying again adds a second set of salary expenses, so DayBook, '
              'the P&L and the cash account will all drop again.',
              style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkSecondary),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dctx, true),
            child: Text('Pay again anyway',
                style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.danger)),
          ),
        ],
      ),
    );
  }

  Future<void> _runPayroll() async {
    setState(() => _isRunning = true);
    // Grab this before Navigator.pop -- after the sheet closes this State's
    // context is defunct and ScaffoldMessenger.of(context) would throw, losing
    // the very message that explains what failed.
    final messenger = ScaffoldMessenger.of(context);
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw Exception('Not authenticated');
      final tenantId = ctx.tenantId;

      final now = DateTime.now();
      final monthStr =
          '$_year-${_month.toString().padLeft(2, '0')}';
      final lastDay = DateTime(_year, _month + 1, 0).day;
      final payDate = '$monthStr-${lastDay.toString().padLeft(2, '0')}';

      // Nothing used to ask. Each run posts one Salary expense per employee and
      // trg_expenses_post_ledger turns each into a money-OUT, so a second run
      // pushes a payout that never happened into DayBook, the P&L and the cash
      // account. It warns rather than blocks: a genuine second payout in the
      // same month -- an advance, a correction -- has to stay possible.
      final clashes = await _alreadyPaid(tenantId, monthStr);
      if (clashes.isNotEmpty) {
        if (!mounted) return;
        final proceed = await _confirmDuplicate(clashes);
        if (proceed != true) {
          setState(() => _isRunning = false);
          return;
        }
      }

      // The table is `payroll`, not `payroll_records`, and it holds one row per
      // run with the employee lines in `items` -- the shape web writes. The old
      // insert named a table that does not exist, so running payroll on mobile
      // always threw and nothing was ever recorded.
      final items = <Map<String, dynamic>>[];
      double totalBase = 0, totalBonus = 0, totalDeductions = 0, totalNet = 0;

      for (final entry in _entries) {
        final emp = entry.employee;
        final basePay = double.tryParse(entry.basePayCtrl.text) ?? 0;
        final bonus = double.tryParse(entry.bonusCtrl.text) ?? 0;
        final deductions = double.tryParse(entry.deductionsCtrl.text) ?? 0;
        final netPay = basePay + bonus - deductions;

        totalBase += basePay;
        totalBonus += bonus;
        totalDeductions += deductions;
        totalNet += netPay;

        items.add({
          'employeeId': emp.id,
          'employeeName': emp.name,
          'basePay': basePay,
          'overtime': 0,
          'commission': 0,
          'bonus': bonus,
          'deductions': deductions,
          'netPay': netPay,
        });
      }

      // The run's own id, held so its salary expenses can point back at it.
      // Without that link, deleting the run leaves its money in DayBook and the
      // P&L -- the web side hit exactly this and now stamps expenses.payroll_id.
      final payrollId = const Uuid().v4();

      await supabase.from('payroll').insert({
        'id': payrollId,
        'tenant_id': tenantId,
        'period': monthStr,
        'items': items,
        'total_base': totalBase,
        'total_net': totalNet,
        'total_overtime': 0,
        'total_commission': 0,
        'total_bonus': totalBonus,
        'total_deductions': totalDeductions,
        'processed_at': now.toIso8601String(),
      });

      // One salary expense per employee. That expense is what puts the payout in
      // DayBook and the P&L -- the payroll row alone shows up nowhere else. Web
      // does the same; without it mobile runs would be silently missing from
      // every money report.
      final expenseRows = items
          .where((i) => (i['netPay'] as double) > 0)
          .map((i) => {
                'id': const Uuid().v4(),
                'tenant_id': tenantId,
                'category': 'Salary',
                'amount': i['netPay'],
                'note': 'Payroll $monthStr — ${i['employeeName']}',
                'date': payDate,
                'payment_method': 'CASH',
                'payroll_id': payrollId,
              })
          .toList();
      // The run is saved at this point. If the expenses fail, the run must NOT
      // be reported as a plain error -- that reads as "nothing happened" and
      // invites a re-run, which would write a second payroll row for the same
      // period. Catch it separately and say exactly what did and did not save.
      String? expenseFailure;
      if (expenseRows.isNotEmpty) {
        try {
          await supabase.from('expenses').insert(expenseRows);
        } catch (e) {
          expenseFailure = _reason(e);
        }
      }

      ref.invalidate(payrollRecordsProvider);
      ref.invalidate(employeesProvider);

      if (!mounted) return;
      Navigator.pop(context);

      if (expenseFailure != null) {
        _snack(
          messenger,
          'Payroll saved, but the ${expenseRows.length} salary '
          '${expenseRows.length == 1 ? 'expense' : 'expenses'} '
          '(₹${totalNet.toStringAsFixed(0)}) could not be posted: '
          '$expenseFailure\n\n'
          'DayBook, the P&L and the cash account will not show this payout '
          'until it is entered. Do not run payroll again for this period — '
          'the run itself is already recorded.',
          error: true,
          long: true,
        );
      } else {
        _snack(messenger, 'Payroll processed for ${_entries.length} employees');
      }
    } catch (e) {
      // Nothing was written -- the payroll insert itself failed.
      if (mounted) {
        setState(() => _isRunning = false);
        _snack(messenger, 'Payroll not saved: ${_reason(e)}',
            error: true, long: true);
      }
    }
  }

  /// The real reason, not `Instance of 'PostgrestException'`. A bare message
  /// like "3 failed to save" is how a days-long outage stayed invisible.
  String _reason(Object e) {
    if (e is PostgrestException) {
      final parts = [
        e.message,
        if (e.details != null && '${e.details}'.isNotEmpty) '${e.details}',
        if (e.hint != null && e.hint!.isNotEmpty) e.hint!,
        if (e.code != null && e.code!.isNotEmpty) '(${e.code})',
      ];
      return parts.join(' — ');
    }
    return e.toString();
  }

  void _snack(ScaffoldMessengerState messenger, String msg,
      {bool error = false, bool long = false}) {
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          msg,
          style: GoogleFonts.manrope(
            color: error ? Colors.white : AppColors.inkPrimary,
          ),
        ),
        backgroundColor: error ? AppColors.danger : AppColors.primaryContainer,
        behavior: SnackBarBehavior.floating,
        duration: Duration(seconds: long ? 20 : 4),
        action: long
            ? SnackBarAction(
                label: 'DISMISS',
                textColor: Colors.white,
                onPressed: messenger.hideCurrentSnackBar,
              )
            : null,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
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
                      style: GoogleFonts.manrope(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppColors.inkPrimary,
                        letterSpacing: -0.3,
                      ),
                    ),
                    Text(
                      'Run payroll for all active employees',
                      style: GoogleFonts.manrope(
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
                    style: GoogleFonts.manrope(
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
                style: GoogleFonts.manrope(
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
                                style: GoogleFonts.manrope(
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
                                style: GoogleFonts.manrope(
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
        labelStyle: GoogleFonts.manrope(
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
              style: GoogleFonts.manrope(
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
                  style: GoogleFonts.manrope(
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
                      style: GoogleFonts.manrope(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      role,
                      style: GoogleFonts.manrope(
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
          style: GoogleFonts.manrope(
            fontWeight: FontWeight.w800,
            color: AppColors.inkPrimary,
          ),
        ),
        content: Text(
          'Remove ${emp.name ?? 'this employee'} from the system? This cannot be undone.',
          style: GoogleFonts.manrope(fontSize: 14, color: AppColors.inkSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel',
                style: GoogleFonts.manrope(color: AppColors.inkSecondary)),
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
                style: GoogleFonts.manrope(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _isDeleting = true);
    try {
      await supabase.from('employees').update({'deleted_at': DateTime.now().toUtc().toIso8601String()}).eq('id', emp.id); // soft delete
      if (!mounted) return;
      ref.invalidate(employeesProvider);
      Navigator.pop(context); // close sheet
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${emp.name ?? 'Employee'} deleted',
              style: GoogleFonts.manrope(color: Colors.white)),
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
                style: GoogleFonts.manrope(color: Colors.white)),
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
      // The column is amount_paid. paid_amount does not exist on employees, so
      // this update always failed and marking a salary paid never worked.
      await supabase
          .from('employees')
          .update({'amount_paid': salary}).eq('id', emp.id);
      if (!mounted) return;
      ref.invalidate(employeesProvider);
      Navigator.pop(context); // close sheet — list will refresh
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Salary marked as paid for ${emp.name ?? 'employee'}',
              style: GoogleFonts.manrope(color: AppColors.inkPrimary)),
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
                style: GoogleFonts.manrope(color: Colors.white)),
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
              style: GoogleFonts.manrope(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: AppColors.secondary,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            name,
            style: GoogleFonts.manrope(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.inkPrimary,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            role,
            style: GoogleFonts.manrope(
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
              style: GoogleFonts.manrope(
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


// ─── Attendance ───────────────────────────────────────────────────────────────
// Daily register: every employee gets a status chip row for the selected day.
// Rows upsert into the shared `attendance` table (unique tenant+employee+day),
// which feeds payroll later.

final attendanceProvider = FutureProvider.family<Map<String, Map<String, dynamic>>, String>((ref, day) async {
  final res = await supabase
      .from('attendance')
      .select('employee_id, status, check_in')
      .eq('day', day);
  final map = <String, Map<String, dynamic>>{};
  for (final r in (res as List)) {
    final m = Map<String, dynamic>.from(r as Map);
    map[m['employee_id'] as String] = m;
  }
  return map;
});

class _AttendanceTab extends ConsumerStatefulWidget {
  const _AttendanceTab();

  @override
  ConsumerState<_AttendanceTab> createState() => _AttendanceTabState();
}

class _AttendanceTabState extends ConsumerState<_AttendanceTab> {
  DateTime _day = DateTime.now();

  String get _dayStr =>
      '${_day.year}-${_day.month.toString().padLeft(2, '0')}-${_day.day.toString().padLeft(2, '0')}';

  Future<void> _mark(String employeeId, String status) async {
    final ctx = ref.read(tenantContextProvider).valueOrNull;
    if (ctx == null) return;
    await supabase.from('attendance').upsert({
      'tenant_id': ctx.tenantId,
      'employee_id': employeeId,
      'day': _dayStr,
      'status': status,
      'check_in': status == 'PRESENT' || status == 'HALF_DAY'
          ? DateTime.now().toUtc().toIso8601String()
          : null,
    }, onConflict: 'tenant_id,employee_id,day');
    ref.invalidate(attendanceProvider(_dayStr));
  }

  static const _statuses = [
    ('PRESENT', 'P', Color(0xFF16A34A)),
    ('HALF_DAY', '½', Color(0xFFF59E0B)),
    ('LEAVE', 'L', Color(0xFF2563EB)),
    ('ABSENT', 'A', Color(0xFFDC2626)),
  ];

  @override
  Widget build(BuildContext context) {
    final employeesAsync = ref.watch(employeesProvider);
    final attAsync = ref.watch(attendanceProvider(_dayStr));

    return Column(
      children: [
        // day picker row
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
          child: Row(
            children: [
              IconButton(
                icon: const Icon(LucideIcons.chevronLeft, size: 18),
                onPressed: () => setState(() => _day = _day.subtract(const Duration(days: 1))),
              ),
              Expanded(
                child: Center(
                  child: Text(
                    _dayStr == DateTime.now().toIso8601String().substring(0, 10)
                        ? 'Today · $_dayStr'
                        : _dayStr,
                    style: GoogleFonts.manrope(
                        fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.inkPrimary),
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(LucideIcons.chevronRight, size: 18),
                onPressed: _day.day == DateTime.now().day &&
                        _day.month == DateTime.now().month &&
                        _day.year == DateTime.now().year
                    ? null
                    : () => setState(() => _day = _day.add(const Duration(days: 1))),
              ),
            ],
          ),
        ),
        Expanded(
          child: employeesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (employees) {
              if (employees.isEmpty) {
                return Center(
                  child: Text('No employees yet',
                      style: GoogleFonts.manrope(fontSize: 13, color: AppColors.inkTertiary)),
                );
              }
              final att = attAsync.asData?.value ?? {};
              return ListView.builder(
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 100),
                itemCount: employees.length,
                itemBuilder: (context, i) {
                  final emp = employees[i];
                  final cur = att[emp.id]?['status'] as String?;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.black.withValues(alpha: 0.05)),
                      boxShadow: [AppColors.cardShadow],
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(emp.name ?? 'Employee',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: GoogleFonts.manrope(
                                      fontSize: 14, fontWeight: FontWeight.w700,
                                      color: AppColors.inkPrimary)),
                              Text(cur ?? 'Not marked',
                                  style: GoogleFonts.manrope(
                                      fontSize: 11,
                                      color: cur == null
                                          ? AppColors.inkTertiary
                                          : AppColors.inkSecondary)),
                            ],
                          ),
                        ),
                        ..._statuses.map((st) {
                          final selected = cur == st.$1;
                          return Padding(
                            padding: const EdgeInsets.only(left: 6),
                            child: GestureDetector(
                              onTap: () => _mark(emp.id, st.$1),
                              child: Container(
                                width: 34, height: 34,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: selected ? st.$3 : Colors.white,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                      color: selected ? st.$3 : Colors.black.withValues(alpha: 0.12)),
                                ),
                                child: Text(st.$2,
                                    style: GoogleFonts.manrope(
                                        fontSize: 13, fontWeight: FontWeight.w800,
                                        color: selected ? Colors.white : AppColors.inkSecondary)),
                              ),
                            ),
                          );
                        }),
                      ],
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
