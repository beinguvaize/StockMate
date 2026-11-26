class Employee {
  final String id;
  final String? name;
  final String? role;
  final double? salary;
  final String? status;
  final double? dailyRate;
  final double? daysWorked;
  final double? amountPaid;
  final String? department;
  final String? email;
  final String? phone;
  final String? position;
  final String? payType;
  final String? bankAccount;
  final String? notes;

  /// Paid leave days allowed in a month. A warning figure on the pay run; it
  /// does not cut pay by itself.
  final int paidLeavePerMonth;

  Employee({
    required this.id,
    this.name,
    this.role,
    this.salary,
    this.status,
    this.dailyRate,
    this.daysWorked,
    this.amountPaid,
    this.department,
    this.email,
    this.phone,
    this.position,
    this.payType,
    this.bankAccount,
    this.notes,
    this.paidLeavePerMonth = 0,
  });

  factory Employee.fromJson(Map<String, dynamic> json) {
    return Employee(
      id: json['id'] as String,
      name: json['name'] as String?,
      role: json['role'] as String?,
      salary: (json['salary'] as num?)?.toDouble(),
      status: json['status'] as String?,
      dailyRate: (json['daily_rate'] as num?)?.toDouble(),
      daysWorked: (json['days_worked'] as num?)?.toDouble(),
      amountPaid: (json['amount_paid'] as num?)?.toDouble(),
      department: json['department'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      position: json['position'] as String?,
      payType: json['pay_type'] as String?,
      bankAccount: json['bank_account'] as String?,
      notes: json['notes'] as String?,
      paidLeavePerMonth: (json['paid_leave_per_month'] as num?)?.toInt() ?? 0,
    );
  }

  /// ACTIVE, ON_LEAVE or INACTIVE, whatever spelling the row carries. Older
  /// phone builds wrote 'Active' / 'On Leave'.
  String get statusKey {
    final s = (status ?? '').trim().toUpperCase().replaceAll(' ', '_');
    if (s == 'ACTIVE' || s == 'ON_LEAVE') return s;
    return 'INACTIVE';
  }

  /// MONTHLY, WEEKLY or DAILY. A legacy HOURLY row is paid by the day, as on web.
  String get payKind {
    final t = (payType ?? '').trim().toUpperCase();
    if (t == 'DAILY' || t == 'HOURLY') return 'DAILY';
    if (t == 'WEEKLY') return 'WEEKLY';
    return 'MONTHLY';
  }

  String get jobTitle {
    final r = (role ?? '').trim();
    if (r.isNotEmpty) return r;
    final p = (position ?? '').trim();
    return p.isNotEmpty ? p : 'Staff';
  }
}
