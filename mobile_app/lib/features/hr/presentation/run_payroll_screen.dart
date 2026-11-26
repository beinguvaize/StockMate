import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/utils/payroll_periods.dart' show describePeriod;
import 'package:mobile_app/features/hr/data/models/employee.dart';
import 'package:mobile_app/features/hr/data/pay_run.dart';
import 'package:mobile_app/features/hr/presentation/providers/hr_provider.dart';
import 'package:mobile_app/features/hr/presentation/widgets/hr_widgets.dart';
import 'package:uuid/uuid.dart';

/// "Run Payroll" (canvas hr-05 … hr-11).
///
/// Pick the days, see what each person is owed, slide to pay. Every figure on
/// this screen comes from the server (the web's own rules); the save writes the
/// run and its salary expenses together in the database.
class RunPayrollScreen extends ConsumerStatefulWidget {
  const RunPayrollScreen({super.key});

  @override
  ConsumerState<RunPayrollScreen> createState() => _RunPayrollScreenState();
}

class _RunPayrollScreenState extends ConsumerState<RunPayrollScreen> {
  static const _methods = ['CASH', 'BANK', 'UPI'];
  static const _methodLabels = ['Cash', 'Bank', 'UPI'];

  late final DateTime _today;
  int _mode = 0; // 0 month · 1 week · 2 custom dates
  late DateTime _month; // 1st of the month
  late DateTime _week; // Monday
  late DateTime _from;
  late DateTime _to;
  String _method = 'CASH';

  final Set<String> _include = {};
  final Map<String, Map<String, num>> _adjust = {};

  PayRun? _run;
  bool _loading = true;
  String? _loadError;
  bool _saving = false;
  String? _saveError;
  int _seq = 0;

  /// One id per set of days on screen. Sent with the save, so sliding again
  /// after a lost reply returns the run already saved instead of paying twice.
  String _runId = const Uuid().v4();

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    _today = DateTime(n.year, n.month, n.day);
    _month = DateTime(_today.year, _today.month, 1);
    _week = weekStart(_today);
    _from = _today;
    _to = _today;
    _load();
  }

  DateTime get _start => switch (_mode) {
        0 => _month,
        1 => _week,
        _ => _from,
      };
  DateTime get _end => switch (_mode) {
        0 => DateTime(_month.year, _month.month + 1, 0),
        1 => addDays(_week, 6),
        _ => _to,
      };

  /// The days changed: a different payout. Typed bonuses and deductions are
  /// dropped with it -- carrying an amount typed for one window into another is
  /// how someone gets paid twice.
  void _periodChanged() {
    _adjust.clear();
    _runId = const Uuid().v4();
    _saveError = null;
    _load();
  }

  Future<PayRun?> _load() async {
    final seq = ++_seq;
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw Exception('Could not tell which shop this is. Sign in again.');
      final run = await fetchPayRun(
        tenantId: ctx.tenantId,
        from: isoDay(_start),
        to: isoDay(_end),
        includeOnLeave: _include,
        adjustments: _adjust,
      );
      if (!mounted || seq != _seq) return run;
      setState(() {
        _run = run;
        _loading = false;
      });
      return run;
    } catch (e) {
      debugPrint('[payroll] costing the run failed: $e');
      if (!mounted || seq != _seq) return null;
      setState(() {
        _loading = false;
        _loadError = payrollError(e);
      });
      return null;
    }
  }

  // ── Saving ───────────────────────────────────────────────────────────────

  Future<void> _slide() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _saveError = null;
    });
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw Exception('Could not tell which shop this is. Sign in again.');

      // Cost it again at the moment of paying: another device may have run
      // payroll, or marked attendance, since this screen was opened.
      final run = await fetchPayRun(
        tenantId: ctx.tenantId,
        from: isoDay(_start),
        to: isoDay(_end),
        includeOnLeave: _include,
        adjustments: _adjust,
      );
      if (!mounted) return;
      setState(() => _run = run);
      if (run.totalNet <= 0) {
        setState(() => _saving = false);
        return;
      }
      if (run.mustConfirm) {
        final again = await _confirmPaidBefore(run);
        if (again != true) {
          if (mounted) setState(() => _saving = false);
          return;
        }
      }

      await savePayRun(
        tenantId: ctx.tenantId,
        runId: _runId,
        period: run.period,
        paymentMethod: _method,
        lines: run.items,
      );
      ref.invalidate(payrollRecordsProvider);
      ref.invalidate(monthPayRunProvider);
      ref.invalidate(employeesProvider);
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context);
      messenger.showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        content: Text(
            'Paid ${Money.inr(run.totalNet)} to ${run.items.where((i) => i.netPay > 0).length} staff'),
      ));
    } catch (e) {
      debugPrint('[payroll] run save failed: $e');
      if (!mounted) return;
      setState(() {
        _saving = false;
        // A lost connection can fail AFTER the database saved. Never claim it
        // was not saved. The same run id goes with the next try, so sliding
        // again cannot pay twice.
        _saveError = 'May not have saved. Slide again: if it did go through, '
            'nobody is paid twice. (${payrollError(e)})';
      });
    }
  }

  Future<bool?> _confirmPaidBefore(PayRun run) => showBlCustomDialog<bool>(
        context: context,
        builder: (ctx) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 46,
                height: 46,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                    color: Color(0xFFFFF1C9), shape: BoxShape.circle),
                child: const BlIcon(
                    '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
                    size: 22,
                    color: Color(0xFFB86A0A)),
              ),
            ),
            const SizedBox(height: 12),
            Text('Some of these days were paid before',
                textAlign: TextAlign.center,
                style: Bl.tight(17, w: FontWeight.w700, ls: -0.02)),
            const SizedBox(height: 6),
            Text(
                'Paying again adds a second set of salary expenses for the same days.',
                textAlign: TextAlign.center,
                style: Bl.inter(13, c: const Color(0xFF55595F), h: 1.45)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                  color: Bl.tile, borderRadius: BorderRadius.circular(14)),
              child: Column(
                children: [
                  for (final r in run.earlierRuns)
                    PayFact('Earlier run · ${describePeriod(r.period)}',
                        Money.inr(r.totalNet)),
                  PayFact('This run would add', Money.inr(run.totalNet),
                      last: true),
                ],
              ),
            ),
            const SizedBox(height: 14),
            BlButton('Pay again anyway',
                kind: BlButtonKind.danger,
                onTap: () => Navigator.pop(ctx, true)),
            const SizedBox(height: 6),
            BlButton('Cancel',
                kind: BlButtonKind.soft,
                onTap: () => Navigator.pop(ctx, false)),
          ],
        ),
      );

  // ── Period controls ──────────────────────────────────────────────────────

  bool get _canGoNext => switch (_mode) {
        0 => DateTime(_month.year, _month.month + 1, 1)
            .isBefore(addDays(_today, 1)),
        _ => !addDays(_week, 7).isAfter(_today),
      };

  void _step(int by) {
    if (by > 0 && !_canGoNext) return;
    setState(() {
      if (_mode == 0) {
        _month = DateTime(_month.year, _month.month + by, 1);
      } else {
        _week = addDays(_week, 7 * by);
      }
    });
    _periodChanged();
  }

  Future<void> _pick(bool isFrom) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isFrom ? _from : _to,
      firstDate: DateTime(2020),
      lastDate: _today,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
            colorScheme: const ColorScheme.light(
                primary: Bl.ink, onPrimary: Bl.white, onSurface: Bl.ink)),
        child: child!,
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (isFrom) {
        _from = picked;
        if (_to.isBefore(_from)) _to = _from;
      } else {
        _to = picked;
        if (_from.isAfter(_to)) _from = _to;
      }
    });
    _periodChanged();
  }

  Widget _stepper(String label) => Container(
        height: 50,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
            color: Bl.wellSoft, borderRadius: BorderRadius.circular(14)),
        child: Row(
          children: [
            _roundStep(BlIcons.back, 'Earlier', () => _step(-1), true),
            Expanded(
              child: Text(label,
                  textAlign: TextAlign.center,
                  style: Bl.tight(15, w: FontWeight.w600)),
            ),
            _roundStep(BlIcons.chevronRight, 'Later', () => _step(1), _canGoNext),
          ],
        ),
      );

  Widget _roundStep(String icon, String label, VoidCallback onTap, bool on) =>
      Semantics(
        button: true,
        enabled: on,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: on ? onTap : null,
          child: Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration:
                const BoxDecoration(color: Bl.white, shape: BoxShape.circle),
            child: BlIcon(icon, size: 16, color: on ? Bl.ink : Bl.faint),
          ),
        ),
      );

  Widget _dateWell(String label, DateTime d, VoidCallback onTap) => Expanded(
        child: Semantics(
          button: true,
          label: '$label ${dayLabel(d)}',
          excludeSemantics: true,
          child: BlTap(
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 9),
              decoration: BoxDecoration(
                  color: Bl.wellSoft, borderRadius: BorderRadius.circular(14)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: Bl.inter(11.5, w: FontWeight.w500, c: Bl.mute)),
                  const SizedBox(height: 2),
                  Text(dayLabel(d), style: Bl.tight(14.5, w: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ),
      );

  // ── Rows ─────────────────────────────────────────────────────────────────

  Widget _lineRow(PayLine l) {
    final note = payLineNote(l);
    return Semantics(
      button: true,
      label: '${l.name}, ${Money.inr(l.netPay)}',
      excludeSemantics: true,
      child: BlTap(
        onTap: () => _openPerson(l),
        child: Container(
          padding: const EdgeInsets.fromLTRB(18, 11, 14, 11),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Bl.sep))),
          child: Row(
            children: [
              BlTintAvatar(l.name),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(14.5, w: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text.rich(
                      TextSpan(children: [
                        TextSpan(text: note.text),
                        if (note.cut != null) ...[
                          const TextSpan(text: ' · '),
                          TextSpan(
                              text: note.cut,
                              style: Bl.inter(12,
                                  w: FontWeight.w500, c: Bl.redDeep)),
                        ],
                        if (l.leaveExceeded)
                          TextSpan(
                              text: ' · over leave allowed',
                              style: Bl.inter(12,
                                  w: FontWeight.w500, c: Bl.amberDeep)),
                      ]),
                      style: Bl.inter(12, c: const Color(0xFF7A8088)),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(Money.inr(l.netPay),
                  style: Bl.tight(14.5, w: FontWeight.w600)),
              const SizedBox(width: 4),
              const BlIcon(BlIcons.chevronRight, size: 16, color: Bl.faint),
            ],
          ),
        ),
      ),
    );
  }

  Widget _onLeaveRow(PayLine l, bool on) => Container(
        margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        decoration: BoxDecoration(
            color: const Color(0xFFFAFAF9),
            borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: [
            BlTintAvatar(l.name),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(l.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.tight(14.5, w: FontWeight.w600)),
                      ),
                      const SizedBox(width: 6),
                      const StaffStatusPill('ON_LEAVE'),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                      on
                          ? 'In this run · ${Money.inr(l.netPay)}'
                          : 'Not in this run · turn on to pay',
                      style: Bl.inter(12, c: const Color(0xFF7A8088))),
                ],
              ),
            ),
            BlToggle(
              value: on,
              label: 'Pay ${l.name} in this run',
              onChanged: _saving
                  ? null
                  : (v) {
                      setState(() =>
                          v ? _include.add(l.employeeId) : _include.remove(l.employeeId));
                      _load();
                    },
            ),
          ],
        ),
      );

  Future<void> _openPerson(PayLine line) async {
    final ctx = await ref.read(tenantContextProvider.future);
    if (ctx == null || !mounted) return;
    final employees = ref.read(employeesProvider).valueOrNull ?? const <Employee>[];
    Employee? emp;
    for (final e in employees) {
      if (e.id == line.employeeId) emp = e;
    }
    final from = isoDay(_start), to = isoDay(_end);
    Map<String, Map<String, dynamic>> marks = {};
    String? marksError;
    try {
      ref.invalidate(attendanceRangeProvider((from: from, to: to)));
      final all =
          await ref.read(attendanceRangeProvider((from: from, to: to)).future);
      marks = Map.of(all[line.employeeId] ?? const {});
    } catch (e) {
      marksError = payrollError(e);
    }
    if (!mounted) return;
    await showBlSheet<void>(
      context: context,
      builder: (_) => _OnePersonSheet(
        line: line,
        role: emp?.jobTitle ?? 'Staff',
        start: _start,
        end: _end,
        today: _today,
        tenantId: ctx.tenantId,
        marks: marks,
        marksError: marksError,
        onAdjust: (bonus, deductions) {
          if (bonus == 0 && deductions == 0) {
            _adjust.remove(line.employeeId);
          } else {
            _adjust[line.employeeId] = {'bonus': bonus, 'deductions': deductions};
          }
        },
        reload: () async => (await _load())?.lineFor(line.employeeId),
      ),
    );
    // Attendance may have changed in the sheet: the month figure on the
    // Payroll screen is now stale.
    ref.invalidate(monthPayRunProvider);
  }

  @override
  Widget build(BuildContext context) {
    final run = _run;
    final days = daysInclusive(_start, _end);
    final shown = run == null
        ? const <PayLine>[]
        : run.items.where((l) => !_include.contains(l.employeeId)).toList();
    final switchedIn = run == null
        ? const <PayLine>[]
        : run.items.where((l) => _include.contains(l.employeeId)).toList();
    final paying = run?.items.where((i) => i.netPay > 0).length ?? 0;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(7, 1, 7, 0),
              child: Row(
                children: [
                  BlRoundButton(BlIcons.close,
                      label: 'Close', onTap: () => Navigator.pop(context)),
                  Expanded(
                    child: Text('Run Payroll',
                        textAlign: TextAlign.center,
                        style: Bl.tight(16, w: FontWeight.w600)),
                  ),
                  const SizedBox(width: 34),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(bottom: 16),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
                    child: Text('Which days are you paying?',
                        style: Bl.tight(24, w: FontWeight.w700, ls: -0.03)),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: BlSegmented(
                      labels: const ['Month', 'Week', 'Custom dates'],
                      index: _mode,
                      onChanged: _saving
                          ? (_) {}
                          : (i) {
                              if (i == _mode) return;
                              setState(() => _mode = i);
                              _periodChanged();
                            },
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                    child: _mode == 2
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  _dateWell('From', _from, () => _pick(true)),
                                  const SizedBox(width: 8),
                                  _dateWell('To', _to, () => _pick(false)),
                                ],
                              ),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(2, 6, 0, 0),
                                child: Text('$days ${days == 1 ? 'day' : 'days'}',
                                    style: Bl.inter(12,
                                        w: FontWeight.w500,
                                        c: const Color(0xFF7A8088))),
                              ),
                            ],
                          )
                        : _stepper(_mode == 0
                            ? '${monthNames[_month.month - 1]} ${_month.year}'
                            : rangeLabel(_start, _end)),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 14, 18, 6),
                    child: Text('Paid by',
                        style: Bl.tight(13, w: FontWeight.w600, c: Bl.ink3)),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: BlChoicePills(
                      options: _methodLabels,
                      selected: _methodLabels[_methods.indexOf(_method)],
                      onChanged: (v) => setState(
                          () => _method = _methods[_methodLabels.indexOf(v)]),
                    ),
                  ),
                  if (_loadError != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          PayError(
                              'Could not work out the pay for these days. Payroll needs a connection. ($_loadError)'),
                          const SizedBox(height: 10),
                          BlButton('Try again',
                              kind: BlButtonKind.soft, onTap: _load),
                        ],
                      ),
                    )
                  else if (run == null)
                    const Padding(
                      padding: EdgeInsets.only(top: 48),
                      child: Center(
                          child: SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2.4, color: Bl.ink))),
                    )
                  else ...[
                    BlGroupHeader('Active staff',
                        trailing: '${shown.length}'),
                    if (shown.isEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 6, 18, 6),
                        child: Text('No active staff. Add an employee first.',
                            style: Bl.inter(13)),
                      ),
                    AnimatedOpacity(
                      opacity: _loading ? 0.45 : 1,
                      duration: const Duration(milliseconds: 150),
                      child: Column(
                        children: [
                          for (final l in shown) _lineRow(l),
                          for (final l in switchedIn) _onLeaveRow(l, true),
                          for (final l in run.held) _onLeaveRow(l, false),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (run != null && _loadError == null)
              Container(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                decoration: const BoxDecoration(
                    color: Bl.white,
                    border: Border(top: BorderSide(color: Bl.sep))),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_saveError != null) ...[
                      PayError(_saveError!),
                      const SizedBox(height: 8),
                    ],
                    Padding(
                      padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text('To pay · $paying staff',
                                style: Bl.inter(13, w: FontWeight.w500)),
                          ),
                          Text(Money.inr(run.totalNet),
                              style:
                                  Bl.tight(20, w: FontWeight.w700, ls: -0.02)),
                        ],
                      ),
                    ),
                    BlSlide(
                      run.totalNet > 0
                          ? 'Slide to run payroll'
                          : 'Nothing to pay for these days',
                      enabled: run.totalNet > 0 && !_loading && !_saving,
                      onConfirmed: _slide,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// One person inside a run (canvas hr-11): the days, a bonus, a deduction, and
/// what that comes to. Tapping a day changes attendance itself, then the
/// server costs the line again.
class _OnePersonSheet extends StatefulWidget {
  final PayLine line;
  final String role;
  final DateTime start;
  final DateTime end;
  final DateTime today;
  final String tenantId;
  final Map<String, Map<String, dynamic>> marks;
  final String? marksError;
  final void Function(num bonus, num deductions) onAdjust;
  final Future<PayLine?> Function() reload;

  const _OnePersonSheet({
    required this.line,
    required this.role,
    required this.start,
    required this.end,
    required this.today,
    required this.tenantId,
    required this.marks,
    required this.marksError,
    required this.onAdjust,
    required this.reload,
  });

  @override
  State<_OnePersonSheet> createState() => _OnePersonSheetState();
}

class _OnePersonSheetState extends State<_OnePersonSheet> {
  static const _cycle = ['PRESENT', 'HALF_DAY', 'LEAVE', 'SICK', 'ABSENT'];
  static const _weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  late PayLine _line = widget.line;
  late final Map<String, Map<String, dynamic>> _marks = Map.of(widget.marks);
  late final _bonus = TextEditingController(
      text: widget.line.bonus > 0 ? widget.line.bonus.toStringAsFixed(0) : '');
  late final _deductions = TextEditingController(
      text: widget.line.deductions > 0
          ? widget.line.deductions.toStringAsFixed(0)
          : '');
  Timer? _debounce;
  bool _busy = false;
  late String? _error = widget.marksError == null
      ? null
      : 'Could not read attendance for these days. (${widget.marksError})';

  @override
  void dispose() {
    _debounce?.cancel();
    _bonus.dispose();
    _deductions.dispose();
    super.dispose();
  }

  Future<void> _recost() async {
    final fresh = await widget.reload();
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (fresh != null) {
        _line = fresh;
      } else {
        _error = 'Could not work out the pay again. Check the connection.';
      }
    });
  }

  Future<void> _write(String day, String? status,
      {double? rate, bool keepRate = false}) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await writeAttendance(
        tenantId: widget.tenantId,
        employeeId: _line.employeeId,
        day: day,
        status: status,
        customRate: rate,
        keepRate: keepRate,
      );
      if (status == null) {
        _marks.remove(day);
      } else {
        _marks[day] = {
          ...?_marks[day],
          'status': status,
          if (!keepRate) 'custom_rate': rate,
        };
      }
      await _recost();
    } catch (e) {
      debugPrint('[payroll] attendance write failed: $e');
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error =
            'May not have saved. Close and open this person again to check. (${payrollError(e)})';
      });
    }
  }

  void _tapDay(String day) {
    final now = '${_marks[day]?['status'] ?? ''}'.toUpperCase();
    final at = _cycle.indexOf(now);
    // Unmarked → Present → Half day → Leave → Sick → Absent → unmarked.
    final next = at < 0
        ? _cycle.first
        : (at + 1 < _cycle.length ? _cycle[at + 1] : null);
    _write(day, next, keepRate: true);
  }

  Future<void> _ownRate(String day) async {
    if (!_line.isDayRate) return;
    final current = _marks[day]?['custom_rate'];
    final ctrl = TextEditingController(
        text: current == null ? '' : (current as num).toStringAsFixed(0));
    final entered = await showBlCustomDialog<String>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Rate for this day', style: Bl.tight(16, w: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
              'Leave empty to use the usual ${Money.inr(_line.dailyRate)} a day.',
              style: Bl.inter(13)),
          BlField(
            label: 'Rate',
            prefix: '₹',
            hint: _line.dailyRate.toStringAsFixed(0),
            controller: ctrl,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          ),
          const SizedBox(height: 14),
          BlButton('Save', onTap: () => Navigator.pop(ctx, ctrl.text.trim())),
          const SizedBox(height: 6),
          BlButton('Cancel',
              kind: BlButtonKind.soft, onTap: () => Navigator.pop(ctx)),
        ],
      ),
    );
    if (entered == null) return;
    final status = '${_marks[day]?['status'] ?? ''}'.toUpperCase();
    // A rate only means something on a day that was worked.
    final worked = status == 'HALF_DAY' ? 'HALF_DAY' : 'PRESENT';
    await _write(day, worked, rate: double.tryParse(entered));
  }

  void _typed() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      widget.onAdjust(double.tryParse(_bonus.text) ?? 0,
          double.tryParse(_deductions.text) ?? 0);
      setState(() => _busy = true);
      _recost();
    });
  }

  ({Color bg, Color fg}) _look(String status) => switch (status) {
        'PRESENT' => (bg: const Color(0xFF1E9E5A), fg: Bl.white),
        'HALF_DAY' => (bg: Bl.brand, fg: Bl.white),
        'LEAVE' => (bg: const Color(0xFF3B82F6), fg: Bl.white),
        'SICK' => (bg: const Color(0xFF8B5CF6), fg: Bl.white),
        'ABSENT' => (bg: Bl.redSoft, fg: Bl.redDeep),
        _ => (bg: Bl.wellSoft, fg: Bl.ink),
      };

  String _spoken(String status) => switch (status) {
        'PRESENT' => 'present',
        'HALF_DAY' => 'half day',
        'LEAVE' => 'leave',
        'SICK' => 'sick',
        'ABSENT' => 'absent',
        _ => 'not marked',
      };

  @override
  Widget build(BuildContext context) {
    final l = _line;
    final dayCount = daysInclusive(widget.start, widget.end);
    final days = [
      for (var i = 0; i < dayCount; i++) addDays(widget.start, i)
    ];
    final note = payLineNote(l);
    final pay = l.isDayRate
        ? '${Money.inr(l.dailyRate)} a day'
        : '${Money.inr((l.raw['salary'] as num?) ?? 0)} a ${l.isWeekly ? 'week' : 'month'}';

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            BlTintAvatar(l.name, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.name,
                      style: Bl.tight(17, w: FontWeight.w700, ls: -0.02)),
                  const SizedBox(height: 1),
                  Text(
                      '${widget.role} · $pay · ${rangeLabel(widget.start, widget.end, year: false)}',
                      style: Bl.inter(12, c: const Color(0xFF7A8088))),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Text(l.isDayRate ? 'Days worked' : 'Attendance',
            style: Bl.tight(13, w: FontWeight.w600, c: Bl.ink3)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 8,
          children: [
            for (final d in days)
              Builder(builder: (_) {
                final key = isoDay(d);
                final status = '${_marks[key]?['status'] ?? ''}'.toUpperCase();
                final look = _look(status);
                final future = d.isAfter(widget.today);
                final ownRate = _marks[key]?['custom_rate'] != null;
                return SizedBox(
                  width: 40,
                  child: Semantics(
                    button: true,
                    enabled: !future,
                    label: '${dayLabel(d)}, ${_spoken(status)}',
                    excludeSemantics: true,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: future || _busy ? null : () => _tapDay(key),
                      onLongPress:
                          future || _busy ? null : () => _ownRate(key),
                      child: Column(
                        children: [
                          Text(_weekdays[d.weekday - 1],
                              style: Bl.inter(11.5,
                                  w: FontWeight.w500, c: Bl.mute)),
                          const SizedBox(height: 5),
                          Container(
                            width: 36,
                            height: 36,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                                color: future ? Bl.white : look.bg,
                                shape: BoxShape.circle,
                                border: ownRate
                                    ? Border.all(color: Bl.ink, width: 1.5)
                                    : null),
                            child: Text(status == 'HALF_DAY' ? '½' : '${d.day}',
                                style: Bl.tight(14,
                                    w: FontWeight.w600,
                                    c: future ? Bl.faint : look.fg)),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
          ],
        ),
        const SizedBox(height: 10),
        Text(
            'Tap a day to change it. Attendance updates too.'
            '${l.isDayRate ? ' Hold a day to give it its own rate.' : ' A day with no mark is paid.'}',
            style: Bl.inter(12, c: const Color(0xFF7A8088), h: 1.4)),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: BlField(
                label: 'Bonus',
                prefix: '₹',
                hint: '0',
                controller: _bonus,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: (_) => _typed(),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: BlField(
                label: 'Deductions',
                prefix: '₹',
                hint: '0',
                controller: _deductions,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: (_) => _typed(),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        AnimatedOpacity(
          opacity: _busy ? 0.45 : 1,
          duration: const Duration(milliseconds: 150),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
                color: Bl.tile, borderRadius: BorderRadius.circular(14)),
            child: Column(
              children: [
                PayFact(
                    note.cut == null
                        ? payLineNote(PayLine({...l.raw, 'alreadyPaid': 0})).text
                        : '${payLineNote(PayLine({...l.raw, 'alreadyPaid': 0})).text} · ${note.cut}',
                    Money.inr(l.basePay)),
                if (l.bonus > 0) PayFact('Bonus', '+ ${Money.inr(l.bonus)}'),
                if (l.deductions > 0)
                  PayFact('Deductions', '− ${Money.inr(l.deductions)}'),
                if (l.statutoryTotal > 0)
                  PayFact('PF, ESI and tax', '− ${Money.inr(l.statutoryTotal)}'),
                if (l.alreadyPaid > 0)
                  PayFact('Already paid for these days',
                      '− ${Money.inr(l.alreadyPaid)}',
                      valueColor: const Color(0xFF17663A)),
                PayFact('To pay', Money.inr(l.netPay), strong: true, last: true),
              ],
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          PayError(_error!),
        ],
        const SizedBox(height: 14),
        BlButton('Done', onTap: () => Navigator.pop(context)),
      ],
    );
  }
}
