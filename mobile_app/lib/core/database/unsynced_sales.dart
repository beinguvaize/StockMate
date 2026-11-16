// Sales the phone has made that the server has not confirmed yet, read
// straight from the outbox.
//
// Why from the outbox and not a copy in the local `sales` table: the queued
// job IS the sale until the server accepts it. A copy would need its own
// lifecycle (delete it when refused, replace it when synced) and the two could
// disagree. Reading the job means a refused sale shows as refused, a synced one
// drops out, and there is exactly one record of what the cashier rang.
//
// These rows are DISPLAY ONLY. Totals, stock, ledger and COGS still come from
// the server once the job replays; nothing here is posted anywhere.

import 'dart:convert';

import 'package:drift/drift.dart';

import 'database.dart';
import 'sync_service.dart' show JobStatus;

enum UnsyncedState {
  /// Queued, waiting for the network (or being sent right now).
  pending,

  /// The server refused it. Not in the books; needs the owner.
  refused,

  /// Synced, but the local cache has not pulled it yet (offline views only).
  synced,
}

class UnsyncedOp {
  final int jobId;
  final String rpcName;
  final UnsyncedState state;
  final String? lastError;
  final DateTime createdAt;
  final Map<String, dynamic> payload;

  const UnsyncedOp({
    required this.jobId,
    required this.rpcName,
    required this.state,
    required this.lastError,
    required this.createdAt,
    required this.payload,
  });

  String get opId => (payload['p_id'] ?? '').toString();
  String? get tenantId => payload['p_tenant_id'] as String?;
  String? get date => payload['p_date'] as String?;

  /// The sale in the column names Sale.fromJson / the Day Book read, so a
  /// queued sale drops into the existing lists unchanged.
  Map<String, dynamic> toSaleRow({String? clientName}) {
    final method = (payload['p_payment_method'] ?? 'CASH').toString();
    final total = (payload['p_total_amount'] as num?)?.toDouble() ?? 0;
    final status = (payload['p_payment_status'] ?? 'PAID').toString();
    final paid = (payload['p_paid_amount'] as num?)?.toDouble() ??
        (status == 'PAID' ? total : 0);
    return {
      'id': opId,
      'tenant_id': tenantId,
      'shopId': payload['p_shop_id'],
      'paymentMethod': method,
      'paymentStatus': status,
      'totalAmount': total,
      'paidAmount': paid > total ? total : paid,
      'discount': (payload['p_discount'] as num?)?.toDouble(),
      'date': date,
      'items': payload['p_items'] is List ? payload['p_items'] : const [],
      'created_at': createdAt.toUtc().toIso8601String(),
      if (clientName != null) 'customerInfo': {'name': clientName},
    };
  }
}

UnsyncedState? _stateOf(String status) {
  switch (status) {
    case JobStatus.pending:
    case JobStatus.processing:
      return UnsyncedState.pending;
    case JobStatus.failed:
      return UnsyncedState.refused;
    case JobStatus.success:
      return UnsyncedState.synced;
    default:
      return null; // DISCARDED: the owner withdrew it
  }
}

/// Queued [rpcName] jobs for [tenantId] (null = this phone's, unfiltered),
/// newest first.
///
/// [includeSynced] adds SUCCESS jobs too — only offline views want those, to
/// bridge the gap between "the server has it" and "the cache pulled it".
Future<List<UnsyncedOp>> unsyncedOps(
  AppDatabase db,
  String? tenantId, {
  String rpcName = 'process_sale',
  bool includeSynced = false,
  int limit = 500,
}) async {
  final statuses = [
    ...JobStatus.owed,
    JobStatus.failed,
    if (includeSynced) JobStatus.success,
  ];
  final rows = await (db.select(db.syncMutations)
        ..where((t) => t.rpcName.equals(rpcName) & t.status.isIn(statuses))
        ..orderBy([(t) => OrderingTerm(expression: t.id, mode: OrderingMode.desc)])
        ..limit(limit))
      .get();
  final out = <UnsyncedOp>[];
  for (final r in rows) {
    final state = _stateOf(r.status);
    if (state == null) continue;
    Map<String, dynamic> payload;
    try {
      payload = Map<String, dynamic>.from(jsonDecode(r.payload) as Map);
    } catch (_) {
      continue;
    }
    final op = UnsyncedOp(
      jobId: r.id,
      rpcName: rpcName,
      state: state,
      lastError: r.lastError,
      createdAt: r.createdAt,
      payload: payload,
    );
    // A job queued before the tenant context loaded carries no tenant; it
    // still belongs to whoever is signed in on this phone.
    if (tenantId != null && op.tenantId != null && op.tenantId != tenantId) continue;
    out.add(op);
  }
  return out;
}

/// Overlay queued sales onto [base] (server or cache rows). Rows the base
/// already has win; queued ones are tagged with `_sync` = pending | refused.
/// Refused sales are listed (so the owner sees them) but marked, and callers
/// that total money must skip them.
List<Map<String, dynamic>> overlayUnsyncedSales(
  List<Map<String, dynamic>> base,
  List<UnsyncedOp> ops, {
  Map<String, String> clientNames = const {},
}) {
  final have = {for (final r in base) r['id']};
  final extra = <Map<String, dynamic>>[];
  for (final op in ops) {
    if (have.contains(op.opId)) continue;
    final shop = op.payload['p_shop_id'] as String?;
    extra.add({
      ...op.toSaleRow(clientName: shop == null ? null : clientNames[shop]),
      '_sync': op.state.name,
      '_jobId': op.jobId,
    });
  }
  return [...extra, ...base];
}
