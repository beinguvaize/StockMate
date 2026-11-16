// A stand-in for Supabase + connectivity, so "the shop has no internet" is a
// flag in a test rather than airplane mode on a phone.
//
// It models the parts of the server the offline design leans on:
//   • process_sale's replay guard: a p_id it has already recorded is a no-op;
//   • a refusal (stock, credit limit) answered as a PostgrestException;
//   • the nasty case: the server COMMITS, then the reply is lost (timeout).

import 'dart:async';
import 'dart:io';

import 'package:mobile_app/core/database/sync_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;

class FakeSyncTransport implements SyncTransport {
  bool online;
  FakeSyncTransport({this.online = false});

  final _changes = StreamController<bool>.broadcast();

  /// Every call that reached the "server", in order: 'rpc_name:p_id'.
  final calls = <String>[];

  /// p_id → rows the server holds (one per distinct sale, whatever the replays).
  final recorded = <String, Map<String, dynamic>>{};

  /// p_id → refusal message the server answers with.
  final refuse = <String, String>{};

  /// p_ids whose next call commits and then loses the reply.
  final commitThenTimeout = <String>{};

  final updates = <String>[];

  void goOnline() {
    online = true;
    _changes.add(true);
  }

  void goOffline() {
    online = false;
    _changes.add(false);
  }

  Future<void> _wire() async {
    if (!online) throw const SocketException('Failed host lookup (airplane mode)');
  }

  @override
  Future<bool> isOnline() async => online;

  @override
  Stream<bool> get onlineChanges => _changes.stream;

  @override
  Future<dynamic> rpc(String name, Map<String, dynamic> params) async {
    await _wire();
    final id = (params['p_id'] ?? '').toString();
    calls.add('$name:$id');
    final msg = refuse[id];
    if (msg != null) {
      throw PostgrestException(message: msg, code: 'P0001');
    }
    // Replay guard: a sale that already exists returns without a second write.
    recorded.putIfAbsent(id, () => Map<String, dynamic>.from(params));
    if (commitThenTimeout.remove(id)) {
      throw TimeoutException('reply lost after commit');
    }
    return null;
  }

  @override
  Future<void> upsert(String table, Map<String, dynamic> row) async {
    await _wire();
    updates.add('upsert:$table:${row['id']}');
  }

  @override
  Future<void> update(String table, String id, Map<String, dynamic> fields) async {
    await _wire();
    updates.add('update:$table:$id:${fields.keys.join(',')}');
    calls.add('update:$id');
  }

  @override
  Future<void> softDelete(String table, String id) async {
    await _wire();
    updates.add('delete:$table:$id');
  }
}

Map<String, dynamic> saleParams(String id, {double total = 100, String method = 'CASH'}) => {
      'p_id': id,
      'p_shop_id': null,
      'p_items': [
        {'id': 'P1', 'quantity': 1, 'name': 'Salt', 'rate': total, 'taxRate': 0}
      ],
      'p_total_amount': total,
      'p_discount': 0,
      'p_payment_method': method,
      'p_payment_status': method == 'CREDIT' ? 'UNPAID' : 'PAID',
      'p_date': '2026-11-16',
      'p_user_id': 'U1',
      'p_location_id': null,
      'p_route_id': null,
      'p_tenant_id': 'T1',
      'p_delivery_method': 'PICKUP',
      'p_source_app': 'MOBILE',
    };
