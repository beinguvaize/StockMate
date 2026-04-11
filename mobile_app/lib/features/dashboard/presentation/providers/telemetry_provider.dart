import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';

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
  });
}

final telemetryProvider = FutureProvider<DashboardMetrics>((ref) async {
  final now = DateTime.now();
  final todayStr = "${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}";

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

    // 1. Sales
    try {
      final salesData = await supabase.from('sales').select('totalAmount').eq('date', todayStr);
      for (var s in salesData) {
        if (s['totalAmount'] != null) {
          salesSum += double.parse(s['totalAmount'].toString());
        }
      }
    } catch (_) {}

    // 2. Expenses
    try {
      final expData = await supabase.from('expenses').select('amount').eq('date', todayStr);
      for (var e in expData) {
        if (e['amount'] != null) {
          expensesSum += double.parse(e['amount'].toString());
        }
      }
    } catch (_) {}

    // 3. Purchases
    try {
      final pchData = await supabase.from('purchases').select('total_cost').eq('date', todayStr);
      for (var p in pchData) {
        if (p['total_cost'] != null) {
          purchasesSum += double.parse(p['total_cost'].toString());
        }
      }
    } catch (_) {}

    // 4. DayBook
    try {
      final dbData = await supabase.from('dayBook').select('closing_balance').eq('date', todayStr).limit(1);
      if (dbData.isNotEmpty && dbData[0]['closing_balance'] != null) {
        cashBal = double.parse(dbData[0]['closing_balance'].toString());
      }
    } catch (_) {}

    // 5. Clients
    try {
      final cpData = await supabase.from('clients').select('outstanding_balance');
      for (var c in cpData) {
        if (c['outstanding_balance'] != null) {
          outstandingSum += double.parse(c['outstanding_balance'].toString());
        }
      }
    } catch (_) {}

    // 6. Employees
    try {
      final emData = await supabase.from('employees').select('dailyRate, daysWorked, amountPaid');
      for (var e in emData) {
        final rate = double.tryParse(e['dailyRate']?.toString() ?? '500') ?? 500.0;
        final days = double.tryParse(e['daysWorked']?.toString() ?? '0') ?? 0.0;
        final paid = double.tryParse(e['amountPaid']?.toString() ?? '0') ?? 0.0;
        final earned = rate * days;
        if (earned > paid) {
          salariesDebt += (earned - paid);
        }
      }
    } catch (_) {}

    // 7. Operations Info
    try {
      final pData = await supabase.from('products').select('stock, low_stock_threshold');
      productsCount = pData.length;
      for (var p in pData) {
        final st = int.tryParse(p['stock']?.toString() ?? '0') ?? 0;
        final th = int.tryParse(p['low_stock_threshold']?.toString() ?? '10') ?? 10;
        if (st <= th) {
          lowStockCount++;
        }
      }
    } catch (_) {}

    try {
      final rtData = await supabase.from('routes').select('id').eq('status', 'ACTIVE');
      tripsCount = rtData.length;
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
    );
  } catch (e) {
    return DashboardMetrics(); // return empty fallbacks gracefully
  }
});
