import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart';
import 'package:mobile_app/features/hr/data/pay_run.dart';
import 'package:mobile_app/features/hr/presentation/add_employee_screen.dart';
import 'package:mobile_app/features/hr/presentation/providers/hr_provider.dart';
import 'package:mobile_app/features/hr/presentation/run_payroll_screen.dart';
import 'package:mobile_app/features/hr/presentation/widgets/hr_widgets.dart';
import 'package:uuid/uuid.dart';

const _grey = Color(0xFF7A8088);
const _paidGreen = Color(0xFF17663A);

/// "Payroll" (canvas hr-01 … hr-04): Employees, Attendance, History.
class HRScreen extends ConsumerStatefulWidget {
  const HRScreen({super.key});

  @override
  ConsumerState<HRScreen> createState() => _HRScreenState();
}

class _HRScreenState extends ConsumerState<HRScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final tabs = Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      child: BlSegmented(
        labels: const ['Employees', 'Attendance', 'History'],
        index: _tab,
        onChanged: (i) => setState(() => _tab = i),
      ),
    );
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Payroll'),
            Expanded(
              child: switch (_tab) {
                0 => _EmployeesTab(tabs: tabs),
                1 => _AttendanceTab(tabs: tabs),
                _ => _HistoryTab(tabs: tabs),
              },
            ),
          ],
        ),
      ),
    );
  }
}

String _payOf(Employee e) => switch (e.payKind) {
      'DAILY' => Money.inr(e.dailyRate ?? 0),
      _ => Money.inr(e.salary ?? 0),
    };

String _payUnit(Employee e) => switch (e.payKind) {
      'DAILY' => 'a day',
      'WEEKLY' => 'a week',
      _ => 'a month',
    };

// ── Employees ──────────────────────────────────────────────────────────────

class _EmployeesTab extends ConsumerWidget {
  final Widget tabs;
  const _EmployeesTab({required this.tabs});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employees = ref.watch(employeesProvider);
    final month = ref.watch(monthPayRunProvider);
    final now = DateTime.now();
    final run = month.valueOrNull;
    final list = employees.valueOrNull ?? const <Employee>[];
    final active = list.where((e) => e.statusKey == 'ACTIVE').length;
    final dash = month.isLoading ? '…' : '—';

    return RefreshIndicator(
      color: Bl.ink,
      onRefresh: () async {
        ref.invalidate(employeesProvider);
        ref.invalidate(monthPayRunProvider);
        await ref.read(employeesProvider.future).catchError((_) => <Employee>[]);
      },
      child: ListView(
        padding: const EdgeInsets.only(bottom: 20),
        children: [
          PayHero(
            label: 'Still to pay for ${monthNames[now.month - 1]}',
            figure: run == null ? dash : Money.inr(run.totalNet),
            stats: [
              (value: run == null ? dash : Money.inr(run.totalBase), label: 'Earned', color: null),
              (
                value: run == null ? dash : Money.inr(run.alreadyPaid),
                label: 'Already paid',
                color: _paidGreen
              ),
              (value: '$active', label: 'Active staff', color: null),
            ],
          ),
          if (month.hasError && !month.isLoading)
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
              child: Text(
                  'Pay figures need a connection. (${payrollError(month.error!)})',
                  style: Bl.inter(12, c: Bl.amberDeep)),
            ),
          tabs,
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Semantics(
              button: true,
              label: 'Run payroll',
              excludeSemantics: true,
              child: BlTap(
                onTap: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const RunPayrollScreen())),
                child: DashedOutline(
                  color: Bl.brand,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                    decoration: BoxDecoration(
                        color: const Color(0xFFFFF8EC),
                        borderRadius: BorderRadius.circular(16)),
                    child: Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          alignment: Alignment.center,
                          decoration: const BoxDecoration(
                              color: Bl.brand, shape: BoxShape.circle),
                          child: const BlIcon('<path d="M8 5l11 7-11 7z"/>',
                              size: 17, color: Bl.white),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Run payroll',
                                  style: Bl.tight(14.5, w: FontWeight.w600)),
                              const SizedBox(height: 1),
                              Text('Pick the days you are paying for',
                                  style: Bl.inter(12,
                                      c: const Color(0xFF8A5A00))),
                            ],
                          ),
                        ),
                        const BlIcon(BlIcons.chevronRight,
                            size: 16, color: Color(0xFFB86A0A)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          BlGroupHeader('Employees', trailing: '${list.length}'),
          if (employees.isLoading && list.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 30),
              child: Center(
                  child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.4, color: Bl.ink))),
            )
          else if (employees.hasError && list.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: PayError('Could not load employees. (${employees.error})'),
            )
          else if (list.isEmpty)
            const BlEmpty(
                icon: BlIcons.users,
                title: 'No employees yet',
                message: 'Add the people you pay to start running payroll.'),
          for (final e in list)
            Semantics(
              button: true,
              label: '${e.name ?? 'Employee'}, ${_payOf(e)} ${_payUnit(e)}',
              excludeSemantics: true,
              child: BlTap(
                onTap: () => showBlSheet<void>(
                    context: context,
                    builder: (_) => _EmployeeSheet(employee: e)),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(18, 11, 14, 11),
                  decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Bl.sep))),
                  child: Row(
                    children: [
                      BlTintAvatar(e.name ?? ''),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(e.name ?? 'Unnamed',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Bl.tight(14.5, w: FontWeight.w600)),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                Flexible(
                                  child: Text(e.jobTitle,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Bl.inter(12, c: _grey)),
                                ),
                                const SizedBox(width: 6),
                                StaffStatusPill(e.statusKey),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(_payOf(e),
                              style: Bl.tight(14.5, w: FontWeight.w600)),
                          Text(_payUnit(e), style: Bl.inter(11.5, c: _grey)),
                        ],
                      ),
                      const SizedBox(width: 4),
                      const BlIcon(BlIcons.chevronRight,
                          size: 16, color: Bl.faint),
                    ],
                  ),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: BlButton('Add employee',
                kind: BlButtonKind.soft,
                leading: const BlIcon(BlIcons.plus, size: 16),
                onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const AddEmployeeScreen()))),
          ),
        ],
      ),
    );
  }
}

/// One employee (canvas hr-04): what they are owed this month and why.
class _EmployeeSheet extends ConsumerStatefulWidget {
  final Employee employee;
  const _EmployeeSheet({required this.employee});

  @override
  ConsumerState<_EmployeeSheet> createState() => _EmployeeSheetState();
}

class _EmployeeSheetState extends ConsumerState<_EmployeeSheet> {
  bool _busy = false;
  String? _error;

  /// Kept for the life of the sheet, so a second slide after a lost reply
  /// returns the payment already saved instead of making another.
  final String _runId = const Uuid().v4();

  Employee get emp => widget.employee;

  Future<void> _pay() async {
    if (_busy) return;
    final how = await showBlPicker(context,
        title: 'Paid by', options: const ['Cash', 'Bank', 'UPI']);
    if (how == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw Exception('Could not tell which shop this is. Sign in again.');
      final now = DateTime.now();
      // Costed again at the moment of paying, with this person switched in
      // even when on leave: sliding here is the decision to pay them.
      final run = await fetchPayRun(
        tenantId: ctx.tenantId,
        from: isoDay(DateTime(now.year, now.month, 1)),
        to: isoDay(DateTime(now.year, now.month + 1, 0)),
        includeOnLeave: [emp.id],
      );
      PayLine? line;
      for (final l in run.items) {
        if (l.employeeId == emp.id) line = l;
      }
      if (line == null || line.netPay <= 0) {
        ref.invalidate(monthPayRunProvider);
        if (mounted) {
          setState(() {
            _busy = false;
            _error = 'Nothing is left to pay ${emp.name ?? 'them'} for this month.';
          });
        }
        return;
      }
      await savePayRun(
        tenantId: ctx.tenantId,
        runId: _runId,
        period: run.period,
        paymentMethod: how.toUpperCase(),
        lines: [line],
      );
      ref.invalidate(monthPayRunProvider);
      ref.invalidate(payrollRecordsProvider);
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context);
      messenger.showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        content: Text('Paid ${Money.inr(line.netPay)} to ${emp.name ?? 'employee'}'),
      ));
    } catch (e) {
      debugPrint('[payroll] single payment failed: $e');
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'May not have saved. Slide again: if it did go through, '
            'they are not paid twice. (${payrollError(e)})';
      });
    }
  }

  Future<void> _delete() async {
    final yes = await showBlDialog<bool>(
      context: context,
      title: 'Delete ${emp.name ?? 'this employee'}?',
      message:
          'They leave the staff list and future pay runs. What they were already paid stays in History.',
      actions: (ctx) => [
        BlButton('Delete',
            kind: BlButtonKind.danger, onTap: () => Navigator.pop(ctx, true)),
        const SizedBox(height: 6),
        BlButton('Cancel',
            kind: BlButtonKind.soft, onTap: () => Navigator.pop(ctx, false)),
      ],
    );
    if (yes != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw Exception('Could not tell which shop this is. Sign in again.');
      await supabase
          .from('employees')
          .update({'deleted_at': DateTime.now().toUtc().toIso8601String()})
          .eq('id', emp.id)
          .eq('tenant_id', ctx.tenantId);
      ref.invalidate(employeesProvider);
      ref.invalidate(monthPayRunProvider);
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context);
      messenger.showSnackBar(SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text('${emp.name ?? 'Employee'} deleted')));
    } catch (e) {
      debugPrint('[payroll] employee delete failed: $e');
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error =
            'May not have been deleted. Check the staff list before trying again. (${payrollError(e)})';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final month = ref.watch(monthPayRunProvider);
    final line = month.valueOrNull?.lineFor(emp.id);
    final now = DateTime.now();
    final span = (
      from: isoDay(DateTime(now.year, now.month, 1)),
      to: isoDay(DateTime(now.year, now.month + 1, 0))
    );
    final marks = ref.watch(attendanceRangeProvider(span)).valueOrNull?[emp.id];
    double worked = 0;
    for (final m in (marks ?? const <String, Map<String, dynamic>>{}).values) {
      final s = '${m['status']}'.toUpperCase();
      if (s == 'PRESENT' || s == 'OT') worked += 1;
      if (s == 'HALF_DAY') worked += 0.5;
    }
    final dash = month.isLoading ? '…' : '—';
    final toPay = line?.netPay ?? 0;
    final inactive = emp.statusKey == 'INACTIVE';

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            BlTintAvatar(emp.name ?? '', size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(emp.name ?? 'Unnamed',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(17, w: FontWeight.w700, ls: -0.02)),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Flexible(
                        child: Text(emp.jobTitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.inter(12, c: _grey)),
                      ),
                      const SizedBox(width: 6),
                      StaffStatusPill(emp.statusKey),
                    ],
                  ),
                ],
              ),
            ),
            if (!inactive)
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(line == null ? dash : Money.inr(toPay),
                      style: Bl.tight(17, w: FontWeight.w700, ls: -0.02)),
                  Text('to pay', style: Bl.inter(11.5, c: _grey)),
                ],
              ),
          ],
        ),
        const SizedBox(height: 8),
        PayFact(
            'Pay type',
            switch (emp.payKind) {
              'DAILY' => 'Day rate',
              'WEEKLY' => 'Weekly salary',
              _ => 'Monthly salary',
            }),
        PayFact(emp.payKind == 'DAILY' ? 'Rate' : 'Salary',
            '${_payOf(emp)} ${_payUnit(emp)}'),
        PayFact('Days worked', marks == null && line == null ? dash : daysLabel(worked)),
        if (emp.payKind != 'DAILY')
          PayFact(
              'Leave this month',
              line == null
                  ? dash
                  : line.leaveAllowed > 0
                      ? '${line.leaveUsed} of ${line.leaveAllowed} days'
                      : '${line.leaveUsed} ${line.leaveUsed == 1 ? 'day' : 'days'}',
              valueColor: line?.leaveExceeded == true ? Bl.amberDeep : null),
        PayFact(
            'Sick this month',
            line == null
                ? dash
                : '${line.sickDays} ${line.sickDays == 1 ? 'day' : 'days'}'),
        PayFact('Already paid', line == null ? dash : Money.inr(line.alreadyPaid),
            valueColor: (line?.alreadyPaid ?? 0) > 0 ? _paidGreen : null),
        PayFact('Still to pay', line == null ? dash : Money.inr(toPay),
            strong: true, last: true),
        if (month.hasError && !month.isLoading) ...[
          const SizedBox(height: 4),
          Text('Pay figures need a connection.',
              style: Bl.inter(12, c: Bl.amberDeep)),
        ],
        if (_error != null) ...[
          const SizedBox(height: 10),
          PayError(_error!),
        ],
        const SizedBox(height: 12),
        if (!inactive)
          BlSlide(
            toPay > 0
                ? 'Slide to mark ${Money.inr(toPay)} paid'
                : 'Nothing to pay this month',
            enabled: toPay > 0 && !_busy,
            onConfirmed: _pay,
          ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: BlButton('Edit',
                  kind: BlButtonKind.soft,
                  onTap: _busy
                      ? null
                      : () {
                          Navigator.pop(context);
                          Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (_) =>
                                      AddEmployeeScreen(employee: emp)));
                        }),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Delete',
                  kind: BlButtonKind.danger,
                  loading: _busy,
                  onTap: _busy ? null : _delete),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Attendance ─────────────────────────────────────────────────────────────

class _AttendanceTab extends ConsumerStatefulWidget {
  final Widget tabs;
  const _AttendanceTab({required this.tabs});

  @override
  ConsumerState<_AttendanceTab> createState() => _AttendanceTabState();
}

class _AttendanceTabState extends ConsumerState<_AttendanceTab> {
  static const _marks = [
    ('PRESENT', 'P', 'Present', Color(0xFF1E9E5A)),
    ('HALF_DAY', '½', 'Half day', Color(0xFFF09935)),
    ('LEAVE', 'L', 'Leave', Color(0xFF3B82F6)),
    ('SICK', 'S', 'Sick', Color(0xFF8B5CF6)),
    ('ABSENT', 'A', 'Absent', Color(0xFFDC2626)),
  ];
  static const _weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  late final DateTime _today;
  late DateTime _day;
  String? _error;

  /// Marks tapped but not yet confirmed by the server, so a tap shows at once.
  final Map<String, String?> _pending = {};

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    _today = DateTime(n.year, n.month, n.day);
    _day = _today;
  }

  ({String from, String to}) get _span {
    final d = isoDay(_day);
    return (from: d, to: d);
  }

  Future<void> _mark(Employee e, String status, String? current) async {
    final next = current == status ? null : status; // same mark again clears it
    setState(() {
      _pending[e.id] = next;
      _error = null;
    });
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw Exception('Could not tell which shop this is. Sign in again.');
      await writeAttendance(
        tenantId: ctx.tenantId,
        employeeId: e.id,
        day: isoDay(_day),
        status: next,
        keepRate: true,
      );
      ref.invalidate(attendanceRangeProvider(_span));
      ref.invalidate(monthPayRunProvider);
      await ref.read(attendanceRangeProvider(_span).future);
    } catch (err) {
      debugPrint('[payroll] attendance mark failed: $err');
      if (mounted) {
        setState(() => _error =
            'May not have saved the mark for ${e.name ?? 'this person'}. Pull down to check. (${payrollError(err)})');
      }
    } finally {
      if (mounted) setState(() => _pending.remove(e.id));
    }
  }

  void _go(DateTime d) {
    if (d.isAfter(_today)) return;
    setState(() {
      _day = d;
      _pending.clear();
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final staff = (ref.watch(employeesProvider).valueOrNull ?? const <Employee>[])
        .where((e) => e.statusKey != 'INACTIVE')
        .toList();
    final att = ref.watch(attendanceRangeProvider(_span));
    final dayKey = isoDay(_day);
    String? statusOf(Employee e) => _pending.containsKey(e.id)
        ? _pending[e.id]
        : att.valueOrNull?[e.id]?[dayKey]?['status']?.toString().toUpperCase();

    final counts = {for (final m in _marks) m.$1: 0};
    for (final e in staff) {
      final s = statusOf(e);
      if (s != null && counts.containsKey(s)) counts[s] = counts[s]! + 1;
    }
    final marked = _marks.where((m) => counts[m.$1]! > 0).toList();
    final monday = weekStart(_day);
    final isToday = _day == _today;

    return RefreshIndicator(
      color: Bl.ink,
      onRefresh: () async {
        ref.invalidate(attendanceRangeProvider(_span));
        await ref
            .read(attendanceRangeProvider(_span).future)
            .catchError((_) => <String, Map<String, Map<String, dynamic>>>{});
      },
      child: ListView(
        padding: const EdgeInsets.only(bottom: 20),
        children: [
          widget.tabs,
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                      '${isToday ? 'Today · ' : ''}${dayLabel(_day)}',
                      style: Bl.tight(17, w: FontWeight.w700, ls: -0.02)),
                ),
                _step(BlIcons.back, 'Day before',
                    () => _go(addDays(_day, -1)), true),
                const SizedBox(width: 6),
                _step(BlIcons.chevronRight, 'Day after',
                    () => _go(addDays(_day, 1)), !isToday),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (var i = 0; i < 7; i++)
                  Builder(builder: (_) {
                    final d = addDays(monday, i);
                    final on = d == _day;
                    final future = d.isAfter(_today);
                    return Semantics(
                      button: true,
                      selected: on,
                      enabled: !future,
                      label: dayLabel(d),
                      excludeSemantics: true,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: future ? null : () => _go(d),
                        child: SizedBox(
                          width: 40,
                          child: Column(
                            children: [
                              Text(_weekdays[i],
                                  style: Bl.inter(11.5,
                                      w: FontWeight.w500, c: Bl.mute)),
                              const SizedBox(height: 5),
                              Container(
                                width: 34,
                                height: 34,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                    color: on ? Bl.ink : null,
                                    shape: BoxShape.circle),
                                child: Text('${d.day}',
                                    style: Bl.tight(14,
                                        w: FontWeight.w600,
                                        c: on
                                            ? Bl.white
                                            : future
                                                ? Bl.faint
                                                : Bl.ink)),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: SizedBox(
                    height: 6,
                    child: marked.isEmpty
                        ? Container(color: Bl.well)
                        : Row(
                            children: [
                              for (var i = 0; i < marked.length; i++) ...[
                                if (i > 0) const SizedBox(width: 3),
                                Expanded(
                                  flex: counts[marked[i].$1]!,
                                  child: Container(
                                      decoration: BoxDecoration(
                                          color: marked[i].$4,
                                          borderRadius:
                                              BorderRadius.circular(3))),
                                ),
                              ],
                            ],
                          ),
                  ),
                ),
                const SizedBox(height: 9),
                marked.isEmpty
                    ? Text(
                        att.isLoading ? 'Loading…' : 'Nobody marked for this day yet',
                        style: Bl.inter(11.5, w: FontWeight.w500))
                    : Wrap(
                        spacing: 12,
                        runSpacing: 4,
                        children: [
                          for (final m in marked)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                    width: 7,
                                    height: 7,
                                    decoration: BoxDecoration(
                                        color: m.$4, shape: BoxShape.circle)),
                                const SizedBox(width: 5),
                                Text('${m.$3} ${counts[m.$1]}',
                                    style:
                                        Bl.inter(11.5, w: FontWeight.w500)),
                              ],
                            ),
                        ],
                      ),
              ],
            ),
          ),
          if (att.hasError && !att.isLoading)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: PayError(
                  'Could not load attendance. (${payrollError(att.error!)})'),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: PayError(_error!),
            ),
          BlGroupHeader('Staff', trailing: '${staff.length}'),
          if (staff.isEmpty)
            const BlEmpty(
                icon: BlIcons.users,
                title: 'No staff to mark',
                message: 'Add an employee on the Employees tab first.'),
          for (final e in staff)
            Builder(builder: (_) {
              final s = statusOf(e);
              String word = 'Not marked';
              for (final m in _marks) {
                if (m.$1 == s) word = m.$3;
              }
              return Container(
                padding: const EdgeInsets.fromLTRB(18, 10, 14, 10),
                decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Bl.sep))),
                child: Row(
                  children: [
                    BlTintAvatar(e.name ?? ''),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(e.name ?? 'Unnamed',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Bl.tight(14.5, w: FontWeight.w600)),
                          const SizedBox(height: 1),
                          Text(word, style: Bl.inter(12, c: _grey)),
                        ],
                      ),
                    ),
                    for (final m in _marks)
                      Padding(
                        padding: const EdgeInsets.only(left: 4),
                        child: Semantics(
                          button: true,
                          selected: s == m.$1,
                          label: '${m.$3}, ${e.name ?? ''}',
                          excludeSemantics: true,
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: _pending.containsKey(e.id)
                                ? null
                                : () => _mark(e, m.$1, s),
                            child: Container(
                              width: 32,
                              height: 36,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                  color: s == m.$1 ? m.$4 : Bl.wellSoft,
                                  borderRadius: BorderRadius.circular(10)),
                              child: Text(m.$2,
                                  style: Bl.tight(13.5,
                                      w: FontWeight.w600,
                                      ls: 0,
                                      c: s == m.$1 ? Bl.white : Bl.body)),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              );
            }),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
            child: Text(
                'P present · ½ half day · L leave · S sick · A absent',
                textAlign: TextAlign.center,
                style: Bl.inter(11.5, c: Bl.mute)),
          ),
        ],
      ),
    );
  }

  Widget _step(String icon, String label, VoidCallback onTap, bool on) =>
      Semantics(
        button: true,
        enabled: on,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: on ? onTap : null,
          child: Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration:
                const BoxDecoration(color: Bl.well, shape: BoxShape.circle),
            child: BlIcon(icon, size: 16, color: on ? Bl.ink : Bl.faint),
          ),
        ),
      );
}

// ── History ────────────────────────────────────────────────────────────────

/// 'just now', '2 days ago', … for a paid-at time.
String paidAgo(String? iso, DateTime now) {
  final at = DateTime.tryParse(iso ?? '')?.toLocal();
  if (at == null) return '';
  final diff = now.difference(at);
  if (diff.inMinutes < 2) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} minutes ago';
  if (diff.inHours < 24) return '${diff.inHours} ${diff.inHours == 1 ? 'hour' : 'hours'} ago';
  final days = daysInclusive(at, now) - 1;
  if (days <= 1) return 'yesterday';
  if (days < 60) return '$days days ago';
  return dayLabel(at);
}

class _HistoryTab extends ConsumerWidget {
  final Widget tabs;
  const _HistoryTab({required this.tabs});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(payrollRecordsProvider);
    final rows = async.valueOrNull ?? const <Map<String, dynamic>>[];
    final now = DateTime.now();
    double n(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;

    // Grouped by the month the pay period ENDS in -- the same day the salary
    // expense is dated, so a month here matches Salary on that month's P&L.
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final r in rows) {
      final end = '${r['pay_period_end'] ?? ''}';
      final key = end.length >= 7 ? end.substring(0, 7) : '';
      (groups[key] ??= []).add(r);
    }
    final keys = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    final total = rows.fold<double>(0, (t, r) => t + n(r['net_pay']));
    final thisKey = '${now.year}-${now.month.toString().padLeft(2, '0')}';
    final thisMonth =
        (groups[thisKey] ?? const []).fold<double>(0, (t, r) => t + n(r['net_pay']));

    String monthTitle(String key) {
      final y = int.tryParse(key.length >= 4 ? key.substring(0, 4) : '');
      final m = int.tryParse(key.length >= 7 ? key.substring(5, 7) : '');
      if (y == null || m == null || m < 1 || m > 12) return 'Other';
      return '${monthNames[m - 1]} $y';
    }

    String periodOf(Map<String, dynamic> r) {
      final a = DateTime.tryParse('${r['pay_period_start']}');
      final b = DateTime.tryParse('${r['pay_period_end']}');
      if (a == null || b == null) return '';
      final wholeMonth = a.day == 1 &&
          a.year == b.year &&
          a.month == b.month &&
          b.day == DateTime(b.year, b.month + 1, 0).day;
      return wholeMonth
          ? '${monthNames[b.month - 1]} ${b.year}'
          : rangeLabel(a, b, year: false);
    }

    return RefreshIndicator(
      color: Bl.ink,
      onRefresh: () async {
        ref.invalidate(payrollRecordsProvider);
        await ref
            .read(payrollRecordsProvider.future)
            .catchError((_) => <Map<String, dynamic>>[]);
      },
      child: ListView(
        padding: const EdgeInsets.only(bottom: 20),
        children: [
          PayHero(
            label: 'Paid in salaries so far',
            figure: async.isLoading && rows.isEmpty ? '…' : Money.inr(total),
            stats: [
              (value: Money.inr(thisMonth), label: 'This month', color: null),
              (value: '${rows.length}', label: 'Payslips', color: null),
              (value: '${keys.length}', label: 'Months', color: null),
            ],
          ),
          tabs,
          if (async.hasError && rows.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: PayError(
                  'Could not load pay history. (${payrollError(async.error!)})'),
            )
          else if (!async.isLoading && rows.isEmpty)
            const BlEmpty(
                icon: BlIcons.receipt,
                title: 'Nothing paid yet',
                message: 'Each payroll you run shows here, person by person.'),
          for (final k in keys) ...[
            BlGroupHeader(monthTitle(k),
                trailing: Money.inr(
                    groups[k]!.fold<double>(0, (t, r) => t + n(r['net_pay'])))),
            for (final r in groups[k]!)
              Container(
                padding: const EdgeInsets.fromLTRB(18, 11, 18, 11),
                decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Bl.sep))),
                child: Row(
                  children: [
                    BlTintAvatar('${r['employee_name'] ?? ''}'),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${r['employee_name'] ?? 'Employee'}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Bl.tight(14.5, w: FontWeight.w600)),
                          const SizedBox(height: 1),
                          Text(
                              [
                                periodOf(r),
                                paidAgo(r['paid_at'] as String?, now)
                              ].where((s) => s.isNotEmpty).join(' · '),
                              style: Bl.inter(12, c: _grey)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(Money.inr(n(r['net_pay'])),
                            style: Bl.tight(14.5, w: FontWeight.w600)),
                        const SizedBox(height: 3),
                        const BlStatusPill('Paid',
                            fg: _paidGreen, bg: Color(0xFFE3F5EA)),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}
