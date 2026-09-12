import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/daybook/data/daybook_models.dart';
import 'package:mobile_app/features/daybook/data/daybook_repository.dart';
import 'package:mobile_app/main.dart' show databaseProvider;

final selectedDayBookDateProvider = StateProvider<String>((ref) {
  final now = DateTime.now();
  return '${now.year}-${now.month.toString().padLeft(2,'0')}-${now.day.toString().padLeft(2,'0')}';
});

final physicalCashInputProvider = StateProvider.family<String, String>((ref, date) => '');

final daybookRepositoryProvider = Provider<DaybookRepository>((ref) {
  return DaybookRepository(supabase, ref.read(databaseProvider));
});

final dayBookListProvider = FutureProvider.autoDispose<List<DayBookRecord>>((ref) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) return [];
  return ref.read(daybookRepositoryProvider).fetchDayBookList(ctx.tenantId);
});

final dayLedgerProvider = FutureProvider.autoDispose
    .family<DayBookLedger, String>((ref, date) async {
  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) throw StateError('no tenant');
  final list = await ref.watch(dayBookListProvider.future);
  return ref.read(daybookRepositoryProvider).buildLedger(
    tenantId: ctx.tenantId, date: date, dayBookList: list,
  );
});

class DaybookMutations extends AsyncNotifier<void> {
  @override Future<void> build() async {}

  DaybookRepository get _repo => ref.read(daybookRepositoryProvider);

  Future<void> saveOpening({required String date, required double amount}) async {
    final ctx = await ref.read(tenantContextProvider.future);
    if (ctx == null) return;
    final list = await ref.read(dayBookListProvider.future);
    final existing = list.where((r) => r.date == date).firstOrNull;
    await _repo.upsertDayBook(
      tenantId: ctx.tenantId, date: date, existingId: existing?.id,
      payload: {'opening_balance': amount},
    );
    ref.invalidate(dayBookListProvider);
  }

  Future<void> savePhysicalCash({
    required String date, required double physical,
    required double closingBal, required double openingBal,
  }) async {
    final ctx = await ref.read(tenantContextProvider.future);
    if (ctx == null) return;
    final list = await ref.read(dayBookListProvider.future);
    final existing = list.where((r) => r.date == date).firstOrNull;
    final variance = ((physical - closingBal) * 100).round() / 100.0;
    await _repo.upsertDayBook(
      tenantId: ctx.tenantId, date: date, existingId: existing?.id,
      payload: {
        'opening_balance': openingBal,
        'physical_cash': physical,
        'variance': variance,
      },
    );
    ref.invalidate(dayBookListProvider);
  }

  Future<void> closeDay({
    required String date, required DayBookLedger ledger, double? physicalCash,
  }) async {
    final ctx = await ref.read(tenantContextProvider.future);
    if (ctx == null) return;
    final list = await ref.read(dayBookListProvider.future);
    final existing = list.where((r) => r.date == date).firstOrNull;
    final payload = <String, dynamic>{
      'opening_balance': ledger.openingBal,
      'closing_balance': ledger.closingBal,
      'total_sales': ledger.cashSales + ledger.bankSales + ledger.creditSales,
      'total_expenses': ledger.totalExpenses + ledger.totalPurchPaid,
      'is_closed': true,
      'closed_at': DateTime.now().toUtc().toIso8601String(),
    };
    if (physicalCash != null) {
      payload['physical_cash'] = physicalCash;
      payload['variance'] = ((physicalCash - ledger.closingBal) * 100).round() / 100.0;
    }
    await _repo.upsertDayBook(
      tenantId: ctx.tenantId, date: date, existingId: existing?.id, payload: payload,
    );
    ref.invalidate(dayBookListProvider);
  }
}

final daybookMutationsProvider =
    AsyncNotifierProvider<DaybookMutations, void>(DaybookMutations.new);
