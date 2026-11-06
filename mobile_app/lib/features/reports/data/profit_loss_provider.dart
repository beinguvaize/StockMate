import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/core/database/sync_status_pill.dart' show connectivityProvider;
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/reports/data/profit_loss.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;

/// The phone cannot reach the server. Screens say "Needs internet". There is no
/// Drift fallback: profit is never worked out from the local copy.
class ProfitOffline implements Exception {
  const ProfitOffline();
}

class ProfitLoadFailed implements Exception {
  final String message;
  const ProfitLoadFailed(this.message);
  @override
  String toString() => message;
}

/// A failure that means no connection, rather than a refusal from the server.
bool isConnectionError(Object e) =>
    e is SocketException || e is TimeoutException || e is http.ClientException;

class PlSource {
  const PlSource();

  Future<List<dynamic>> call(Map<String, dynamic> params) async {
    final res = await supabase
        .rpc(plRangedRpc, params: params)
        .timeout(const Duration(seconds: 15));
    return res as List<dynamic>;
  }
}

final plSourceProvider = Provider<PlSource>((ref) => const PlSource());

final profitLossProvider =
    FutureProvider.autoDispose.family<ProfitLoss, PlQuery>((ref, q) async {
  final conn = await ref.watch(connectivityProvider.future);
  if (conn == ConnectivityResult.none) throw const ProfitOffline();

  try {
    final rows = await ref.watch(plSourceProvider).call(plParams(q));
    if (rows.isEmpty) throw const FormatException('get_pl_ranged returned no row');
    return ProfitLoss.fromRow(Map<String, dynamic>.from(rows.first as Map));
  } on PostgrestException catch (e) {
    debugPrint('[profit] server refused: $e');
    throw ProfitLoadFailed(e.message);
  } catch (e) {
    debugPrint('[profit] load failed: $e');
    if (isConnectionError(e)) throw const ProfitOffline();
    throw ProfitLoadFailed('$e');
  }
});
