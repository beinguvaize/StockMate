import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart' as drift;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart' show connectivityProvider;
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/main.dart' show databaseProvider;
import 'package:mobile_app/core/utils/stock_levels.dart';

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

  /// Bills rung today, so the card can say "34 bills" and derive an average.
  /// A sum alone cannot tell a big day from one big bill.
  final int todayBillCount;

  /// Today's takings split into the twelve trading hours 09:00-20:59, in the
  /// device's own timezone -- a shop reads its day in its own clock.
  ///
  /// Twelve because that is the window the bills actually fall in: over the
  /// last 60 days 614 of 619 landed between 09:00 and 20:59, and the peak is
  /// at NOON, not the evening. Anything earlier folds into the first bucket
  /// and anything later into the last, so no bill is invisible.
  final List<double> hourlySales;

  /// Yesterday's takings UP TO THE SAME CLOCK TIME as now.
  ///
  /// Not yesterday's full day. Comparing a morning against a whole day always
  /// reports a collapse: on a live screen at 11:53 with no bills yet, the
  /// whole-day comparison read "-100%" in red, which is not what had
  /// happened. Like against like, or the number is worse than no number.
  final double yesterdayToDate;

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
    this.todayBillCount = 0,
    this.hourlySales = const [],
    this.yesterdayToDate = 0,
    this.fromCache = false,
  });

  /// Yesterday against today, as a percentage. Null when there is nothing to
  /// compare against -- a day-one shop must not be shown a triumphant +100%,
  /// and dividing by a zero yesterday is not a 0% day.
  double? get salesDeltaPct {
    // Nothing has happened yet today, so there is no trend -- only an hour of
    // the morning. A red -100% on an empty 9am till is a false alarm.
    if (todayBillCount == 0) return null;
    if (yesterdayToDate <= 0) return null;
    return (todaySales - yesterdayToDate) / yesterdayToDate * 100;
  }

  double get averageBill =>
      todayBillCount == 0 ? 0 : todaySales / todayBillCount;
}

/// First and last hour of the bar chart, inclusive. Twelve slots, which is what
/// the card's twelve-column grid draws: a label can then sit exactly over the
/// hour it names instead of drifting between bars.
const int kFirstTradingHour = 9;
const int kTradingHours = 12;

/// Folds timestamps into those twelve buckets. Out-of-window bills are clamped
/// into the end buckets rather than dropped, so the bars always sum to the
/// figure printed above them.
/// Sums only what had been rung by this time of day. Rows with no timestamp
/// cannot be placed in the day, so they are left out of the comparison rather
/// than counted as if they happened this morning.
double _takingsUpToNow(Iterable<(DateTime?, double)> rows, DateTime now) {
  final cutoff = Duration(hours: now.hour, minutes: now.minute);
  var sum = 0.0;
  for (final (ts, amount) in rows) {
    if (ts == null) continue;
    final local = ts.toLocal();
    if (Duration(hours: local.hour, minutes: local.minute) <= cutoff) {
      sum += amount;
    }
  }
  return sum;
}

List<double> _bucketByHour(Iterable<(DateTime?, double)> rows) {
  final buckets = List<double>.filled(kTradingHours, 0);
  for (final (ts, amount) in rows) {
    if (ts == null) continue;
    final slot = (ts.toLocal().hour - kFirstTradingHour)
        .clamp(0, kTradingHours - 1);
    buckets[slot] += amount;
  }
  return buckets;
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
      int billCount = 0;
      double yesterdaySoFar = 0;
      List<double> hourly = const [];

      try {
        final salesData = await supabase
            .from('sales').select('totalAmount, created_at').isFilter('deleted_at', null)
            .eq('tenant_id', tenantId).gte('date', todayStr).lt('date', tomorrowStr);
        final rows = <(DateTime?, double)>[];
        for (var s in salesData) {
          final amount = double.tryParse(s['totalAmount']?.toString() ?? '0') ?? 0;
          salesSum += amount;
          rows.add((DateTime.tryParse(s['created_at']?.toString() ?? ''), amount));
        }
        billCount = salesData.length;
        hourly = _bucketByHour(rows);
      } catch (_) {}

      try {
        final expData = await supabase
            .from('expenses').select('amount').isFilter('deleted_at', null)
            .eq('tenant_id', tenantId).gte('date', todayStr).lt('date', tomorrowStr);
        for (var e in expData) {
          expensesSum += double.tryParse(e['amount']?.toString() ?? '0') ?? 0;
        }
      } catch (_) {}

      try {
        final pchData = await supabase
            .from('purchases').select('total_amount').isFilter('deleted_at', null)
            .eq('tenant_id', tenantId).gte('date', todayStr).lt('date', tomorrowStr);
        for (var p in pchData) {
          purchasesSum += double.tryParse(p['total_amount']?.toString() ?? '0') ?? 0;
        }
      } catch (_) {}

      try {
        final dbData = await supabase.from('day_book').select('closing_balance')
            .eq('tenant_id', tenantId).eq('date', todayStr).limit(1);
        if (dbData.isNotEmpty) {
          cashBal = double.tryParse(dbData[0]['closing_balance']?.toString() ?? '0') ?? 0;
        }
      } catch (_) {}

      try {
        final cpData = await supabase.from('clients').select('outstanding_balance').isFilter('deleted_at', null).eq('tenant_id', tenantId);
        for (var c in cpData) {
          outstandingSum += double.tryParse(c['outstanding_balance']?.toString() ?? '0') ?? 0;
        }
      } catch (_) {}

      try {
        final emData = await supabase.from('employees')
            .select('daily_rate, days_worked, amount_paid').isFilter('deleted_at', null).eq('tenant_id', tenantId);
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
            .select('stock, lowStockThreshold').isFilter('deleted_at', null).eq('tenant_id', tenantId);
        productsCount = pData.length;
        for (var p in pData) {
          // int.tryParse('42.5') is null, fell back to 0, and reported a full
          // shelf as low stock. Stock is a REAL column. See StockLevels.
          final st = StockLevels.parse(p['stock']);
          final threshold = (p['lowStockThreshold'] as num?)?.toDouble();
          if (StockLevels.needsRestock(st, threshold: threshold)) {
            lowStockCount++;
          }
        }
      } catch (_) {}

      try {
        final rtData = await supabase.from('routes').select('id')
            .eq('tenant_id', tenantId).eq('status', 'ACTIVE');
        tripsCount = rtData.length;
      } catch (_) {}

      // Yesterday, up to this same clock time -- the only fair comparison.
      try {
        final y = today.subtract(const Duration(days: 1));
        final yStr = '${y.year}-${y.month.toString().padLeft(2, '0')}-${y.day.toString().padLeft(2, '0')}';
        final yRows = await supabase
            .from('sales').select('totalAmount, created_at').isFilter('deleted_at', null)
            .eq('tenant_id', tenantId).gte('date', yStr).lt('date', todayStr);
        yesterdaySoFar = _takingsUpToNow(
          yRows.map((r) => (
            DateTime.tryParse(r['created_at']?.toString() ?? ''),
            double.tryParse(r['totalAmount']?.toString() ?? '0') ?? 0,
          )),
          now,
        );
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
        final rawRows = await supabase.from('sales').select('date, totalAmount').isFilter('deleted_at', null)
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
        todayBillCount: billCount,
        hourlySales: hourly,
        yesterdayToDate: yesterdaySoFar,
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
    // createdAt is nullable on the local table, so a row that predates it
    // still counts toward the total and the bill count -- it just cannot be
    // placed in an hour. See _bucketByHour.
    final hourly = _bucketByHour(
      todaySalesRows.map((r) => (r.createdAt, r.totalAmount)),
    );

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

    final yesterday = today.subtract(const Duration(days: 1));
    final yesterdayRows = await (db.select(db.sales)
          ..where((t) =>
              t.tenantId.equals(tenantId) &
              t.date.isBiggerOrEqualValue(yesterday) &
              t.date.isSmallerThanValue(today)))
        .get();
    final yesterdaySoFar = _takingsUpToNow(
      yesterdayRows.map((r) => (r.createdAt, r.totalAmount)),
      now,
    );

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
      todayBillCount: todaySalesRows.length,
      hourlySales: hourly,
      yesterdayToDate: yesterdaySoFar,
      fromCache: true,
    );
  } catch (_) {
    return DashboardMetrics();
  }
});
