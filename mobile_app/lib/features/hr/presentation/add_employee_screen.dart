import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/hr/data/models/employee.dart';
import 'package:mobile_app/features/hr/data/pay_run.dart' show payrollError;
import 'package:mobile_app/features/hr/presentation/providers/hr_provider.dart';
import 'package:mobile_app/features/hr/presentation/widgets/hr_widgets.dart';
import 'package:uuid/uuid.dart';

/// "Add Employee" (canvas hr-07, hr-10). The same screen edits one.
class AddEmployeeScreen extends ConsumerStatefulWidget {
  /// Non-null = edit this employee.
  final Employee? employee;

  const AddEmployeeScreen({super.key, this.employee});

  @override
  ConsumerState<AddEmployeeScreen> createState() => _AddEmployeeScreenState();
}

class _AddEmployeeScreenState extends ConsumerState<AddEmployeeScreen> {
  static const _payKinds = ['MONTHLY', 'WEEKLY', 'DAILY'];
  static const _statuses = ['ACTIVE', 'ON_LEAVE', 'INACTIVE'];

  final _name = TextEditingController();
  final _role = TextEditingController();
  final _amount = TextEditingController();
  String _payKind = 'MONTHLY';
  String _status = 'ACTIVE';
  int _leave = 0;
  bool _saving = false;
  String? _error;

  bool get _isEditing => widget.employee != null;

  @override
  void initState() {
    super.initState();
    final e = widget.employee;
    if (e == null) return;
    _name.text = e.name ?? '';
    _role.text = (e.role ?? '').trim().isNotEmpty ? e.role! : (e.position ?? '');
    _payKind = e.payKind;
    _status = e.statusKey;
    _leave = e.paidLeavePerMonth.clamp(0, 31);
    final amount = _payKind == 'DAILY' ? e.dailyRate : e.salary;
    if (amount != null && amount > 0) _amount.text = amount.toStringAsFixed(0);
  }

  @override
  void dispose() {
    _name.dispose();
    _role.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    final role = _role.text.trim();
    final amount = double.tryParse(_amount.text.trim()) ?? 0;
    if (name.isEmpty) {
      setState(() => _error = 'Enter the name.');
      return;
    }
    if (amount <= 0) {
      setState(() => _error = _payKind == 'DAILY'
          ? 'Enter the rate for one day.'
          : 'Enter the salary.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final ctx = await ref.read(tenantContextProvider.future);
      if (ctx == null) throw Exception('Could not tell which shop this is. Sign in again.');
      final daily = _payKind == 'DAILY';
      final payload = <String, dynamic>{
        'name': name,
        // The web reads `position`, older phone builds wrote `role`. Both are
        // kept in step so the job shows on either.
        'role': role.isEmpty ? null : role,
        'position': role.isEmpty ? null : role,
        'pay_type': _payKind,
        // One figure per pay type. The other is left as it was on an edit, so
        // switching someone to a day rate and back does not lose their salary.
        if (daily) 'daily_rate': amount else 'salary': amount,
        'paid_leave_per_month': daily ? 0 : _leave,
        'status': _status,
      };

      if (_isEditing) {
        await supabase
            .from('employees')
            .update(payload)
            .eq('id', widget.employee!.id)
            .eq('tenant_id', ctx.tenantId);
      } else {
        // employees.id is text NOT NULL with no database default, so every
        // client has to mint one.
        await supabase.from('employees').insert({
          'id': const Uuid().v4(),
          ...payload,
          'tenant_id': ctx.tenantId,
        });
      }

      ref.invalidate(employeesProvider);
      ref.invalidate(monthPayRunProvider);
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context);
      messenger.showSnackBar(SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text(_isEditing ? 'Employee updated' : 'Employee added')));
    } catch (e) {
      debugPrint('[payroll] employee save failed: $e');
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error =
            'May not have saved. Check the staff list before trying again. (${payrollError(e)})';
      });
    }
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(top: 12, bottom: 6),
        child: Text(text, style: Bl.tight(13, w: FontWeight.w600, c: Bl.ink3)),
      );

  Widget _stepButton(String sign, String label, VoidCallback? onTap) =>
      Semantics(
        button: true,
        enabled: onTap != null,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: onTap,
          child: Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration:
                const BoxDecoration(color: Bl.white, shape: BoxShape.circle),
            child: Text(sign,
                style: Bl.tight(18,
                    w: FontWeight.w600, c: onTap == null ? Bl.faint : Bl.ink)),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final daily = _payKind == 'DAILY';
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(title: _isEditing ? 'Edit Employee' : 'Add Employee'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(18, 4, 18, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 8),
                    Text(_isEditing ? 'Who is this?' : 'Who are you adding?',
                        style: Bl.tight(24, w: FontWeight.w700, ls: -0.03)),
                    BlField(
                      label: 'Full name',
                      hint: 'e.g. Ravi Kumar',
                      controller: _name,
                      capitalization: TextCapitalization.words,
                    ),
                    BlField(
                      label: 'Job role',
                      hint: 'e.g. Sales Executive',
                      controller: _role,
                      capitalization: TextCapitalization.words,
                    ),
                    _label('Pay type'),
                    PayChoice(
                      labels: const ['Monthly salary', 'Weekly salary', 'Day rate'],
                      index: _payKinds.indexOf(_payKind),
                      onChanged: (i) {
                        if (_payKinds[i] == _payKind) return;
                        final e = widget.employee;
                        setState(() {
                          _payKind = _payKinds[i];
                          // Show the figure that pay type already has, if any.
                          final kept =
                              _payKind == 'DAILY' ? e?.dailyRate : e?.salary;
                          _amount.text = kept != null && kept > 0
                              ? kept.toStringAsFixed(0)
                              : '';
                        });
                      },
                    ),
                    BlField(
                      label: switch (_payKind) {
                        'DAILY' => 'Rate per day',
                        'WEEKLY' => 'Salary per week',
                        _ => 'Salary per month',
                      },
                      prefix: '₹',
                      hint: '0',
                      controller: _amount,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      helper: daily
                          ? 'Paid for days worked. Half day pays half. You pick the dates each time you run payroll.'
                          : 'Full pay unless a day is marked Absent. Leave is paid.',
                    ),
                    if (!daily) ...[
                      _label('Paid leave allowed a month'),
                      Container(
                        height: 50,
                        padding: const EdgeInsets.fromLTRB(14, 0, 7, 0),
                        decoration: BoxDecoration(
                            color: Bl.wellSoft,
                            borderRadius: BorderRadius.circular(14)),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                  '$_leave ${_leave == 1 ? 'day' : 'days'}',
                                  style: Bl.tight(15, w: FontWeight.w600)),
                            ),
                            _stepButton(
                                '−',
                                'One day less',
                                _leave > 0
                                    ? () => setState(() => _leave -= 1)
                                    : null),
                            const SizedBox(width: 6),
                            _stepButton(
                                '+',
                                'One day more',
                                _leave < 31
                                    ? () => setState(() => _leave += 1)
                                    : null),
                          ],
                        ),
                      ),
                    ],
                    _label('Status'),
                    PayChoice(
                      labels: const ['Active', 'On leave', 'Inactive'],
                      index: _statuses.indexOf(_status),
                      onChanged: (i) => setState(() => _status = _statuses[i]),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      PayError(_error!),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: BlButton(_isEditing ? 'Save changes' : 'Add employee',
                  loading: _saving, onTap: _saving ? null : _submit),
            ),
          ],
        ),
      ),
    );
  }
}
