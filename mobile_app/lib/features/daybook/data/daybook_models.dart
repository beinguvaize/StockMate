enum MethodKind { cash, bank, credit, other }

MethodKind methodKindFromString(String? s) {
  final v = (s ?? '').toUpperCase();
  if (['BANK', 'UPI', 'TRANSFER', 'NEFT', 'RTGS'].contains(v)) return MethodKind.bank;
  if (v == 'CREDIT') return MethodKind.credit;
  if (v == 'CASH') return MethodKind.cash;
  return MethodKind.other;
}

class DayBookRecord {
  final String id;
  final String tenantId;
  final String date;
  final double openingBalance;
  final double closingBalance;
  final double totalSales;
  final double totalExpenses;
  final double? physicalCash;
  final double? variance;
  final bool isClosed;
  final DateTime? closedAt;

  DayBookRecord({
    required this.id, required this.tenantId, required this.date,
    required this.openingBalance, required this.closingBalance,
    required this.totalSales, required this.totalExpenses,
    this.physicalCash, this.variance,
    required this.isClosed, this.closedAt,
  });

  factory DayBookRecord.fromMap(Map<String, dynamic> m) => DayBookRecord(
    id: m['id'] as String,
    tenantId: (m['tenant_id'] ?? '') as String,
    date: (m['date'] ?? '') as String,
    openingBalance: (m['opening_balance'] as num?)?.toDouble() ?? 0,
    closingBalance: (m['closing_balance'] as num?)?.toDouble() ?? 0,
    totalSales: (m['total_sales'] as num?)?.toDouble() ?? 0,
    totalExpenses: (m['total_expenses'] as num?)?.toDouble() ?? 0,
    physicalCash: (m['physical_cash'] as num?)?.toDouble(),
    variance: (m['variance'] as num?)?.toDouble(),
    isClosed: (m['is_closed'] as bool?) ?? false,
    closedAt: m['closed_at'] != null ? DateTime.tryParse(m['closed_at'] as String) : null,
  );
}

enum EntryType { income, expense, creditSale }

class DayBookEntry {
  final String id;
  final EntryType type;
  final String category;
  final String title;
  final String? note;
  final MethodKind method;
  final String methodLabel;
  final double amount;
  final DateTime createdAt;
  double runningBalance;

  DayBookEntry({
    required this.id, required this.type, required this.category,
    required this.title, this.note, required this.method,
    required this.methodLabel, required this.amount,
    required this.createdAt, this.runningBalance = 0,
  });
}

class DayBookLedger {
  final String date;
  final double openingBal;
  final double cashSales;
  final double bankSales;
  final double creditSales;
  final double cashCollect;
  final double bankCollect;
  final double cashIn;
  final double bankIn;
  final double totalExpenses;
  final double cashPurchPaid;
  final double bankPurchPaid;
  final double totalPurchPaid;
  final double cashOut;
  final double closingBal;
  final bool isLocked;
  final DateTime? closedAt;
  final bool hasOpening;
  final double? savedPhysicalCash;
  final double? savedVariance;
  final double? prevClosing;
  final List<DayBookEntry> entries;

  DayBookLedger({
    required this.date,
    required this.openingBal,
    this.cashSales = 0, this.bankSales = 0, this.creditSales = 0,
    this.cashCollect = 0, this.bankCollect = 0,
    this.cashIn = 0, this.bankIn = 0,
    this.totalExpenses = 0, this.cashPurchPaid = 0, this.bankPurchPaid = 0,
    this.totalPurchPaid = 0, this.cashOut = 0,
    required this.closingBal,
    required this.isLocked,
    this.closedAt,
    required this.hasOpening,
    this.savedPhysicalCash,
    this.savedVariance,
    this.prevClosing,
    this.entries = const [],
  });

  int get txCount => entries.length;
  bool get isDeficit => closingBal < 0;
  double get totalCashReceipts => cashSales + cashCollect;
  double get totalBankReceipts => bankSales + bankCollect;
}
