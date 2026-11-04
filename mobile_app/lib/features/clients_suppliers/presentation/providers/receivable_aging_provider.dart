import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart' show connectivityProvider;
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/receivable_aging.dart';
import 'package:mobile_app/features/finance/data/recurring.dart' show todayIst;
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;

/// The phone cannot reach the server. The screens say "Needs internet". There
/// is deliberately no Drift fallback: the local copy can be partial, and a
/// wrong total looks exactly like a right one.
class AgingOffline implements Exception {
  const AgingOffline();
}

/// The server answered with a refusal, or the answer could not be used.
class AgingLoadFailed implements Exception {
  final String message;
  const AgingLoadFailed(this.message);
  @override
  String toString() => message;
}

class AgingSource {
  const AgingSource();
  static const _timeout = Duration(seconds: 15);

  Future<List<Map<String, dynamic>>> unpaidSales(String tenantId) => fetchAllPages(
        (from, to) => supabase
            .rpc('get_unpaid_sales', params: {'p_tenant_id': tenantId})
            .order('sale_id')
            .range(from, to)
            .timeout(_timeout)
            .then((v) => v as List<dynamic>),
      );

  Future<List<Map<String, dynamic>>> clients(String tenantId) => fetchAllPages(
        (from, to) => supabase
            .from('clients')
            .select()
            .isFilter('deleted_at', null)
            .eq('tenant_id', tenantId)
            .order('id')
            .range(from, to)
            .timeout(_timeout),
      );
}

final agingSourceProvider = Provider<AgingSource>((ref) => const AgingSource());

class ReceivableAgingData {
  final ReceivableAging aging;
  final Map<String, Client> clientsById;
  const ReceivableAgingData(this.aging, this.clientsById);
}

/// What customers owe, from get_unpaid_sales. Both aging screens read this, so
/// they cannot disagree. Both calls must succeed: without the balances the
/// tie-out would state a false gap.
final receivableAgingProvider =
    FutureProvider.autoDispose<ReceivableAgingData>((ref) async {
  final conn = await ref.watch(connectivityProvider.future);
  if (conn == ConnectivityResult.none) throw const AgingOffline();

  final ctx = await ref.watch(tenantContextProvider.future);
  if (ctx == null) throw const AgingLoadFailed('No shop on this account.');
  final source = ref.watch(agingSourceProvider);

  try {
    final results = await Future.wait([
      source.unpaidSales(ctx.tenantId),
      source.clients(ctx.tenantId),
    ]);
    final clientRows = results[1];
    return ReceivableAgingData(
      buildAging(results[0], clientRows.map((c) => c['outstanding_balance']), todayIst()),
      {for (final c in clientRows) c['id'] as String: Client.fromJson(c)},
    );
  } on PostgrestException catch (e) {
    debugPrint('[aging] server refused: $e');
    throw AgingLoadFailed(e.message);
  } on SocketException catch (e) {
    debugPrint('[aging] no connection: $e');
    throw const AgingOffline();
  } on TimeoutException catch (e) {
    debugPrint('[aging] timed out: $e');
    throw const AgingOffline();
  } on http.ClientException catch (e) {
    debugPrint('[aging] no connection: $e');
    throw const AgingOffline();
  } catch (e) {
    debugPrint('[aging] load failed: $e');
    throw AgingLoadFailed('$e');
  }
});
