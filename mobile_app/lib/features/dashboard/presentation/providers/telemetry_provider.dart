import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart' as drift;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart' show connectivityProvider;
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

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
  final List<DayTotals> weeklySales;
  final bool fromCache; // true = sourced from local DB

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
    this.fromCache = false,
  });
}

final telemetryProvider = FutureProvider<DashboardMetrics>((ref) async {
  // Watch connectivity — re-runs automatically when online/offline changes
  final conn = ref.watch(connectivityProvider).asData?.value;
  final isOnline = conn != ConnectivityResult.none;

  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return DashboardMetrics();
  final tenantId = ctx.tenantId;

  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final todayStr = '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
  final tomorrow = today.add(const Duration(days: 1));
  final tomorrowStr = '${tomorrow.year}-${tomorrow.month.toString().padLeft(2, '0')}-${tomorrow.day.toString().padLeft(2, '0')}';

  // ── Try Supabase (online path) ─────────────────────────────────────────────
  if (isOnline) {
    try {
      double salesSum = 0, expensesSum = 0, purchasesSum = 0;
      double cashBal = 0, outstandingSum = 0, salariesDebt = 0;
      int productsCount = 0, tripsCount = 0, lowStockCount = 0;

      try {
        final salesData = await supabase
            .from('sales').select('totalAmount')
            .eq('tenant_id', tenantId).gte('date', todayStr).lt('date', tomorrowStr);
        for (var s in salesData) {
          salesSum += double.tryParse(s['totalAmount']?.toString() ?? '0') ?? 0;
        }
      } catch (_) {}

      try {
        final expData = await supabase
            .from('expenses').select('amount')
            .eq('tenant_id', tenantId).gte('date', todayStr).lt('date', tomorrowStr);
        for (var e in expData) {
          expensesSum += double.tryParse(e['amount']?.toString() ?? '0') ?? 0;
        }
      } catch (_) {}

      try {
        final pchData = await supabase
            .from('purchases').select('total_amount')
            .eq('tenant_id', tenantId).gte('date', todayStr).lt('date', tomorrowStr);
        for (var p in pchData) {
          purchasesSum += double.tryParse(p['total_amount']?.toString() ?? '0') ?? 0;
        }
      } catch (_) {}

      try {
        final dbData = await supabase.from('dayBook').select('closing_balance')
            .eq('tenant_id', tenantId).eq('date', todayStr).limit(1);
        if (dbData.isNotEmpty) {
          cashBal = double.tryParse(dbData[0]['closing_balance']?.toString() ?? '0') ?? 0;
        }
      } catch (_) {}

      try {
        final cpData = await supabase.from('clients').select('outstanding_balance').eq('tenant_id', tenantId);
        for (var c in cpData) {
          outstandingSum += double.tryParse(c['outstanding_balance']?.toString() ?? '0') ?? 0;
        }
      } catch (_) {}

      try {
        final emData = await supabase.from('employees')
            .select('daily_rate, days_worked, amount_paid').eq('tenant_id', tenantId);
        for (var e in emData) {
          final rate = double.tryParse(e['daily_rate']?.toString() ?? '500') ?? 500;
          final days = double.tryParse(e['days_worked']?.toString() ?? '0') ?? 0;
          final paid = double.tryParse(e['amount_paid']?.toString() ?? '0') ?? 0;
          final earned = rate * days;
          if (earned > paid) salariesDebt += (earned - paid);
        }
      } catch (_) {}

      try {
        final pData = await supabase.from('products')
            .select('stock, low_stock_threshold').eq('tenant_id', tenantId);
        productsCount = pData.length;
        for (var p in pData) {
          final st = int.tryParse(p['stock']?.toString() ?? '0') ?? 0;
          final th = int.tryParse(p['low_stock_threshold']?.toString() ?? '10') ?? 10;
          if (st < th) lowStockCount++;
        }
      } catch (_) {}

      try {
        final rtData = await supabase.from('routes').select('id')
            .eq('tenant_id', tenantId).eq('status', 'ACTIVE');
        tripsCount = rtData.length;
      } catch (_) {}

      // Weekly sales
      final List<DayTotals> weekly = [];
      try {
        final Map<String, double> byDate = {};
        for (int i = 6; i >= 0; i--) {
          final d = today.subtract(Duration(days: i));
          final key = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
          byDate[key] = 0;
        }
        final sevenAgo = today.subtract(const Duration(days: 6));
        final fromStr = '${sevenAgo.year}-${sevenAgo.month.toString().padLeft(2, '0')}-${sevenAgo.day.toString().padLeft(2, '0')}';
        final rawRows = await supabase.from('sales').select('date, totalAmount')
            .eq('tenant_id', tenantId).gte('date', fromStr).lte('date', todayStr);
        for (final row in rawRows) {
          final key = row['date']?.toString() ?? '';
          if (byDate.containsKey(key)) {
            byDate[key] = (byDate[key] ?? 0) +
                (double.tryParse(row['totalAmount']?.toString() ?? '0') ?? 0);
          }
        }
        for (int i = 6; i >= 0; i--) {
          final d = today.subtract(Duration(days: i));
          final key = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
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
        fromCache: false,
      );
    } catch (_) {
      // Fall through to local DB
    }
  }

  // ── Offline fallback — read from local Drift DB ────────────────────────────
  try {
    final db = ref.read(databaseProvider);

    // Today's sales from local DB
    final todaySalesRows = await (db.select(db.sales)
          ..where((t) =>
              t.tenantId.equals(tenantId) &
              t.date.isBiggerOrEqualValue(today) &
              t.date.isSmallerThanValue(tomorrow)))
        .get();
    final salesSum = todaySalesRows.fold(0.0, (s, r) => s + r.totalAmount);

    // Today's expenses
    final todayExpRows = await (db.select(db.expenses)
          ..where((t) =>
              t.tenantId.equals(tenantId) &
              t.date.isBiggerOrEqualValue(today) &
              t.date.isSmallerThanValue(tomorrow)))
        .get();
    final expensesSum = todayExpRows.fold(0.0, (s, r) => s + r.amount);

    // Products count from local DB
    final allProducts = await (db.select(db.products)
          ..where((t) => t.tenantId.equals(tenantId)))
        .get();
    final productsCount = allProducts.length;

    // Outstanding from local clients
    final allClients = await (db.select(db.clients)
          ..where((t) => t.tenantId.equals(tenantId)))
        .get();
    final outstandingSum = allClients.fold(0.0, (s, c) => s + c.outstandingBalance);

    // Weekly sales from local DB
    final sevenAgo = today.subtract(const Duration(days: 6));
    final weeklySalesRows = await (db.select(db.sales)
          ..where((t) =>
              t.tenantId.equals(tenantId) &
              t.date.isBiggerOrEqualValue(sevenAgo) &
              t.date.isSmallerOrEqualValue(today)))
        .get();
    final Map<String, double> byDate = {};
    for (int i = 6; i >= 0; i--) {
      final d = today.subtract(Duration(days: i));
      final key = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      byDate[key] = 0;
    }
    for (final row in weeklySalesRows) {
      final d = row.date;
      final key = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      if (byDate.containsKey(key)) byDate[key] = (byDate[key] ?? 0) + row.totalAmount;
    }
    final weekly = <DayTotals>[];
    for (int i = 6; i >= 0; i--) {
      final d = today.subtract(Duration(days: i));
      final key = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      weekly.add(DayTotals(date: d, amount: byDate[key] ?? 0));
    }

    return DashboardMetrics(
      todaySales: salesSum,
      todayExpenses: expensesSum,
      totalProducts: productsCount,
      outstandingCollections: outstandingSum,
      weeklySales: weekly,
      fromCache: true,
    );
  } catch (_) {
    return DashboardMetrics();
  }
});
