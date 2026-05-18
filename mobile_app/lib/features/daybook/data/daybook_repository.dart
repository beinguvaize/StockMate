import 'package:supabase_flutter/supabase_flutter.dart';
import 'daybook_models.dart';

class DaybookRepository {
  final SupabaseClient _client;
  DaybookRepository(this._client);

  Future<List<DayBookRecord>> fetchDayBookList(String tenantId) async {
    final data = await _client.from('day_book')
        .select()
        .eq('tenant_id', tenantId)
        .order('date', ascending: false)
        .limit(60);
    return (data as List).map((m) => DayBookRecord.fromMap(m as Map<String, dynamic>)).toList();
  }

  Future<DayBookLedger> buildLedger({
    required String tenantId, required String date,
    required List<DayBookRecord> dayBookList,
  }) async {
    // Find day_book record for this date
    final rec = dayBookList.where((r) => r.date == date).firstOrNull;
    final hasOpening = rec != null;
    final openingBal = rec?.openingBalance ?? 0.0;
    final isLocked = rec?.isClosed ?? false;

    // prevClosing: most recent day_book before this date
    final sorted = [...dayBookList]..sort((a, b) => b.date.compareTo(a.date));
    final prev = sorted.where((r) => r.date.compareTo(date) < 0).firstOrNull;
    final prevClosing = prev?.closingBalance;

    // Fetch all transactions for this date in parallel
    final results = await Future.wait([
      _client.from('sales').select('id, totalAmount, paymentMethod, customerInfo, items, created_at')
          .eq('tenant_id', tenantId).eq('date', date),
      _client.from('expenses').select('id, amount, category, note, payment_method, created_at')
          .eq('tenant_id', tenantId).eq('date', date),
      _client.from('client_payments').select('id, amount, payment_method, notes, client_id, created_at')
          .eq('tenant_id', tenantId).eq('date', date),
      _client.from('purchases').select('id, total_amount, payment_type, supplier_id, created_at')
          .eq('tenant_id', tenantId).eq('date', date),
    ]);

    final sales = (results[0] as List).cast<Map<String, dynamic>>();
    final expenses = (results[1] as List).cast<Map<String, dynamic>>();
    final collections = (results[2] as List).cast<Map<String, dynamic>>();
    final purchases = (results[3] as List).cast<Map<String, dynamic>>();

    const bankMethods = ['BANK', 'UPI', 'TRANSFER', 'NEFT', 'RTGS'];

    // Compute aggregates
    double cashSales = 0, bankSales = 0, creditSales = 0;
    for (final s in sales) {
      final method = ((s['paymentMethod'] as String?) ?? '').toUpperCase();
      final amt = (s['totalAmount'] as num?)?.toDouble() ?? 0;
      if (method == 'CREDIT') { creditSales += amt; }
      else if (bankMethods.contains(method)) { bankSales += amt; }
      else { cashSales += amt; }
    }

    double cashCollect = 0, bankCollect = 0;
    for (final p in collections) {
      final method = ((p['payment_method'] as String?) ?? '').toUpperCase();
      final amt = (p['amount'] as num?)?.toDouble() ?? 0;
      if (bankMethods.contains(method)) { bankCollect += amt; }
      else { cashCollect += amt; }
    }

    double totalExpenses = 0;
    for (final e in expenses) {
      totalExpenses += (e['amount'] as num?)?.toDouble() ?? 0;
    }

    double cashPurchPaid = 0, bankPurchPaid = 0;
    for (final p in purchases) {
      final method = ((p['payment_type'] as String?) ?? '').toUpperCase();
      final amt = (p['total_amount'] as num?)?.toDouble() ?? 0;
      if (bankMethods.contains(method)) { bankPurchPaid += amt; }
      else { cashPurchPaid += amt; }
    }

    final cashIn = cashSales + cashCollect;
    final bankIn = bankSales + bankCollect;
    final cashOut = totalExpenses + cashPurchPaid;
    final totalPurchPaid = cashPurchPaid + bankPurchPaid;
    final closingBal = openingBal + cashIn - cashOut;

    // Build entries list sorted by createdAt
    final entries = <DayBookEntry>[];

    for (final s in sales) {
      final method = ((s['paymentMethod'] as String?) ?? 'CASH').toUpperCase();
      final isCredit = method == 'CREDIT';
      final amt = (s['totalAmount'] as num?)?.toDouble() ?? 0;
      final custInfo = s['customerInfo'] as Map?;
      final custName = custInfo?['name'] as String? ?? custInfo?['customerName'] as String?;
      final items = s['items'] as List?;
      final itemSummary = items != null && items.isNotEmpty
          ? (items.take(2).map((i) => (i as Map?)?['name'] ?? '').where((n) => n.isNotEmpty).join(', '))
          : null;
      entries.add(DayBookEntry(
        id: s['id'] as String? ?? '',
        type: isCredit ? EntryType.creditSale : EntryType.income,
        category: 'Sale',
        title: custName != null ? 'Sale to $custName' : 'Sale',
        note: itemSummary,
        method: methodKindFromString(method),
        methodLabel: method,
        amount: amt,
        createdAt: DateTime.tryParse(s['created_at'] as String? ?? '') ?? DateTime.now(),
      ));
    }

    for (final e in expenses) {
      entries.add(DayBookEntry(
        id: e['id'] as String? ?? '',
        type: EntryType.expense,
        category: (e['category'] as String?) ?? 'Expense',
        title: (e['category'] as String?) ?? 'Expense',
        note: e['note'] as String?,
        method: methodKindFromString(e['payment_method'] as String?),
        methodLabel: ((e['payment_method'] as String?) ?? 'CASH').toUpperCase(),
        amount: (e['amount'] as num?)?.toDouble() ?? 0,
        createdAt: DateTime.tryParse(e['created_at'] as String? ?? '') ?? DateTime.now(),
      ));
    }

    for (final p in collections) {
      entries.add(DayBookEntry(
        id: p['id'] as String? ?? '',
        type: EntryType.income,
        category: 'Collection',
        title: 'Payment Received',
        note: p['notes'] as String?,
        method: methodKindFromString(p['payment_method'] as String?),
        methodLabel: ((p['payment_method'] as String?) ?? 'CASH').toUpperCase(),
        amount: (p['amount'] as num?)?.toDouble() ?? 0,
        createdAt: DateTime.tryParse(p['created_at'] as String? ?? '') ?? DateTime.now(),
      ));
    }

    for (final p in purchases) {
      entries.add(DayBookEntry(
        id: p['id'] as String? ?? '',
        type: EntryType.expense,
        category: 'Purchase',
        title: 'Purchase Payment',
        note: null,
        method: methodKindFromString(p['payment_type'] as String?),
        methodLabel: ((p['payment_type'] as String?) ?? 'CASH').toUpperCase(),
        amount: (p['total_amount'] as num?)?.toDouble() ?? 0,
        createdAt: DateTime.tryParse(p['created_at'] as String? ?? '') ?? DateTime.now(),
      ));
    }

    entries.sort((a, b) => a.createdAt.compareTo(b.createdAt));

    // Compute running balance (skip credit sales)
    double running = openingBal;
    for (final e in entries) {
      if (e.type == EntryType.creditSale) { e.runningBalance = running; continue; }
      if (e.type == EntryType.income) { running += e.amount; }
      else { running -= e.amount; }
      e.runningBalance = running;
    }

    return DayBookLedger(
      date: date,
      openingBal: openingBal,
      cashSales: cashSales, bankSales: bankSales, creditSales: creditSales,
      cashCollect: cashCollect, bankCollect: bankCollect,
      cashIn: cashIn, bankIn: bankIn,
      totalExpenses: totalExpenses,
      cashPurchPaid: cashPurchPaid, bankPurchPaid: bankPurchPaid,
      totalPurchPaid: totalPurchPaid, cashOut: cashOut,
      closingBal: closingBal,
      isLocked: isLocked, closedAt: rec?.closedAt,
      hasOpening: hasOpening,
      savedPhysicalCash: rec?.physicalCash,
      savedVariance: rec?.variance,
      prevClosing: prevClosing,
      entries: entries,
    );
  }

  Future<void> upsertDayBook({
    required String tenantId,
    required String date,
    String? existingId,
    required Map<String, dynamic> payload,
  }) async {
    final raw = 'DB-$date-$tenantId';
    final id = existingId ?? (raw.length > 40 ? raw.substring(0, 40) : raw);
    await _client.from('day_book').upsert({
      'id': id,
      'tenant_id': tenantId,
      'date': date,
      ...payload,
    }, onConflict: 'tenant_id,date');
  }
}
