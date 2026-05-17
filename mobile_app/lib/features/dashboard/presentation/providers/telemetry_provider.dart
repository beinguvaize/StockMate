import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';

class DayTotals {
  final DateTime date;
  final double amount;
  const DayTotals({required this.date, required this.amount});
}

class DashboardMetrics {
  final double todaySales;
  final double todayExpenses;
  final double todayPurchases;
  final double currentCashBalance;
  final double outstandingCollections;
  final double salariesPending;
  final int totalProducts;
  final int activeTrips;
  final int lowStockItems;
  /// Last 7 days (oldest → newest). Empty list = no data yet.
  final List<DayTotals> weeklySales;

  DashboardMetrics({
    this.todaySales = 0,
    this.todayExpenses = 0,
    this.todayPurchases = 0,
    this.currentCashBalance = 0,
    this.outstandingCollections = 0,
    this.salariesPending = 0,
    this.totalProducts = 0,
    this.activeTrips = 0,
    this.lowStockItems = 0,
    this.weeklySales = const [],
  });
}

final telemetryProvider = FutureProvider<DashboardMetrics>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return DashboardMetrics();
  final tenantId = ctx.tenantId;

  final now = DateTime.now();
  final todayStr = "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";
  final tomorrow = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
  final tomorrowStr = "${tomorrow.year}-${tomorrow.month.toString().padLeft(2, '0')}-${tomorrow.day.toString().padLeft(2, '0')}";

  try {
    double salesSum = 0;
    double expensesSum = 0;
    double purchasesSum = 0;
    double cashBal = 0;
    double outstandingSum = 0;
    double salariesDebt = 0;
    int productsCount = 0;
    int tripsCount = 0;
    int lowStockCount = 0;

    // 1. Sales — range filter handles both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:...' formats
    try {
      final salesData = await supabase
          .from('sales')
          .select('totalAmount')
          .eq('tenant_id', tenantId)
          .gte('date', todayStr)
          .lt('date', tomorrowStr);
      for (var s in salesData) {
        if (s['totalAmount'] != null) {
          salesSum += double.parse(s['totalAmount'].toString());
        }
      }
    } catch (_) {}

    // 2. Expenses
    try {
      final expData = await supabase
          .from('expenses')
          .select('amount')
          .eq('tenant_id', tenantId)
          .gte('date', todayStr)
          .lt('date', tomorrowStr);
      for (var e in expData) {
        if (e['amount'] != null) {
          expensesSum += double.parse(e['amount'].toString());
        }
      }
    } catch (_) {}

    // 3. Purchases — web writes total_amount (not total_cost)
    try {
      final pchData = await supabase
          .from('purchases')
          .select('total_amount')
          .eq('tenant_id', tenantId)
          .gte('date', todayStr)
          .lt('date', tomorrowStr);
      for (var p in pchData) {
        if (p['total_amount'] != null) {
          purchasesSum += double.parse(p['total_amount'].toString());
        }
      }
    } catch (_) {}

    // 4. DayBook
    try {
      final dbData = await supabase.from('dayBook').select('closing_balance').eq('tenant_id', tenantId).eq('date', todayStr).limit(1);
      if (dbData.isNotEmpty && dbData[0]['closing_balance'] != null) {
        cashBal = double.parse(dbData[0]['closing_balance'].toString());
      }
    } catch (_) {}

    // 5. Clients
    try {
      final cpData = await supabase.from('clients').select('outstanding_balance').eq('tenant_id', tenantId);
      for (var c in cpData) {
        if (c['outstanding_balance'] != null) {
          outstandingSum += double.parse(c['outstanding_balance'].toString());
        }
      }
    } catch (_) {}

    // 6. Employees — DB uses snake_case: daily_rate, days_worked, amount_paid
    try {
      final emData = await supabase.from('employees').select('daily_rate, days_worked, amount_paid').eq('tenant_id', tenantId);
      for (var e in emData) {
        final rate = double.tryParse(e['daily_rate']?.toString() ?? '500') ?? 500.0;
        final days = double.tryParse(e['days_worked']?.toString() ?? '0') ?? 0.0;
        final paid = double.tryParse(e['amount_paid']?.toString() ?? '0') ?? 0.0;
        final earned = rate * days;
        if (earned > paid) {
          salariesDebt += (earned - paid);
        }
      }
    } catch (_) {}

    // 7. Operations Info
    try {
      final pData = await supabase.from('products').select('stock, low_stock_threshold').eq('tenant_id', tenantId);
      productsCount = pData.length;
      for (var p in pData) {
        final st = int.tryParse(p['stock']?.toString() ?? '0') ?? 0;
        final th = int.tryParse(p['low_stock_threshold']?.toString() ?? '10') ?? 10;
        if (st < th) { // web uses strict < (not <=)
          lowStockCount++;
        }
      }
    } catch (_) {}

    try {
      final rtData = await supabase.from('routes').select('id').eq('tenant_id', tenantId).eq('status', 'ACTIVE');
      tripsCount = rtData.length;
    } catch (_) {}

    // 8. Weekly sales — last 7 days grouped by date
    final List<DayTotals> weekly = [];
    try {
      final today = DateTime(now.year, now.month, now.day);
      // Build a map: dateStr → total
      final Map<String, double> byDate = {};
      for (int i = 6; i >= 0; i--) {
        final d = today.subtract(Duration(days: i));
        final key = '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';
        byDate[key] = 0;
      }
      final sevenDaysAgo = today.subtract(const Duration(days: 6));
      final fromStr = '${sevenDaysAgo.year}-${sevenDaysAgo.month.toString().padLeft(2,'0')}-${sevenDaysAgo.day.toString().padLeft(2,'0')}';
      final rawRows = await supabase
          .from('sales')
          .select('date, totalAmount')
          .eq('tenant_id', tenantId)
          .gte('date', fromStr)
          .lte('date', todayStr);
      for (final row in rawRows) {
        final dateKey = row['date']?.toString() ?? '';
        if (byDate.containsKey(dateKey)) {
          byDate[dateKey] = (byDate[dateKey] ?? 0) +
              (double.tryParse(row['totalAmount']?.toString() ?? '0') ?? 0);
        }
      }
      for (int i = 6; i >= 0; i--) {
        final d = today.subtract(Duration(days: i));
        final key = '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';
        weekly.add(DayTotals(date: d, amount: byDate[key] ?? 0));
      }
    } catch (_) {}

    return DashboardMetrics(
      todaySales: salesSum,
      todayExpenses: expensesSum,
      todayPurchases: purchasesSum,
      currentCashBalance: cashBal,
      outstandingCollections: outstandingSum,
      salariesPending: salariesDebt,
      totalProducts: productsCount,
      activeTrips: tripsCount,
      lowStockItems: lowStockCount,
      weeklySales: weekly,
    );
  } catch (e) {
    return DashboardMetrics(); // return empty fallbacks gracefully
  }
});
