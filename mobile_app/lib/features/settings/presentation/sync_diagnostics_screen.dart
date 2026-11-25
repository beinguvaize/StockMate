// SyncDiagnosticsScreen
//
// Remote-support tool. Sales / RPCs that failed to reach Supabase sit in the
// local `sync_mutations` table (Drift). When a client is in a remote location
// and ADB is not an option, this screen lets them:
//
//   1. See every PENDING / PROCESSING / FAILED job + its last_error.
//   2. Force a retry (resets FAILED → PENDING, calls sync()).
//   3. Export the queue as JSON and share via WhatsApp / Gmail / etc. so an
//      admin can replay the calls server-side.
//
// All work is read-only on the queue except the "Retry All" action.

import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' as drift;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/main.dart' show databaseProvider, syncServiceProvider;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

const _grey = Color(0xFF7A8088);

/// What a queued change is, in the owner's words.
String syncJobTitle(String action, String targetTable, String? rpcName) {
  final key = (action == 'rpc' ? (rpcName ?? '') : targetTable).toLowerCase();
  if (key.contains('sale')) return 'Sale';
  if (key.contains('settle') || key.contains('payment')) return 'Payment';
  if (key.contains('expense')) return 'Expense';
  if (key.contains('purchase')) return 'Purchase';
  if (key.contains('client')) return 'Client';
  if (key.contains('supplier')) return 'Supplier';
  if (key.contains('product') || key.contains('inventory')) return 'Product';
  if (key.contains('vehicle')) return 'Vehicle';
  if (key.contains('day_book')) return 'Day Book';
  return 'Change';
}

class SyncDiagnosticsScreen extends ConsumerStatefulWidget {
  const SyncDiagnosticsScreen({super.key});

  @override
  ConsumerState<SyncDiagnosticsScreen> createState() => _SyncDiagnosticsScreenState();
}

class _SyncDiagnosticsScreenState extends ConsumerState<SyncDiagnosticsScreen> {
  bool _busy = false;
  String? _statusMsg;
  late Future<List<SyncMutation>> _jobs = _loadJobs();

  void _reload() => setState(() => _jobs = _loadJobs());

  Future<List<SyncMutation>> _loadJobs() async {
    final db = ref.read(databaseProvider);
    return (db.select(db.syncMutations)
          ..where((t) => t.status.isIn(const ['PENDING', 'PROCESSING', 'FAILED']))
          ..orderBy([(t) => drift.OrderingTerm(expression: t.id, mode: drift.OrderingMode.desc)])
          ..limit(500))
        .get();
  }

  Future<void> _retryAll() async {
    setState(() { _busy = true; _statusMsg = null; });
    try {
      final svc = ref.read(syncServiceProvider);
      await svc.retryFailed();
      await svc.sync();
      if (mounted) setState(() => _statusMsg = 'Tried again.');
    } catch (e) {
      debugPrint('[sync diagnostics] retry all failed: $e');
      if (mounted) setState(() => _statusMsg = 'Could not retry. ($e)');
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        _reload();
      }
    }
  }

  Future<void> _retryOne(SyncMutation j) async {
    setState(() { _busy = true; _statusMsg = null; });
    try {
      final svc = ref.read(syncServiceProvider);
      await svc.retryJob(j.id);
      await svc.sync();
    } catch (e) {
      debugPrint('[sync diagnostics] retry ${j.id} failed: $e');
      if (mounted) setState(() => _statusMsg = 'Could not retry. ($e)');
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        _reload();
      }
    }
  }

  Future<void> _discard(SyncMutation j) async {
    final what = syncJobTitle(j.action, j.targetTable, j.rpcName).toLowerCase();
    final ok = await showBlDialog<bool>(
      context: context,
      title: 'Discard this $what?',
      message:
          'It will not be sent to the server and will not appear in your books. If it may already have been saved, tap Retry instead to check. This cannot be undone.',
      actions: (ctx) => [
        Row(
          children: [
            Expanded(
              child: BlButton('Keep it',
                  kind: BlButtonKind.soft,
                  onTap: () => Navigator.pop(ctx, false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Discard',
                  kind: BlButtonKind.danger,
                  onTap: () => Navigator.pop(ctx, true)),
            ),
          ],
        ),
      ],
    );
    if (ok != true || !mounted) return;
    setState(() { _busy = true; _statusMsg = null; });
    try {
      await ref.read(syncServiceProvider).discardJob(j.id);
    } catch (e) {
      debugPrint('[sync diagnostics] discard ${j.id} failed: $e');
      if (mounted) setState(() => _statusMsg = 'Could not discard. ($e)');
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        _reload();
      }
    }
  }

  Future<void> _exportShare() async {
    setState(() { _busy = true; _statusMsg = null; });
    try {
      final jobs = await _loadJobs();
      final exportJson = {
        'exported_at': DateTime.now().toIso8601String(),
        'count': jobs.length,
        'jobs': jobs.map((j) => {
          'id': j.id,
          'target_table': j.targetTable,
          'action': j.action,
          'rpc_name': j.rpcName,
          'status': j.status,
          'attempts': j.attempts,
          'created_at': j.createdAt.toIso8601String(),
          'last_attempt_at': j.lastAttemptAt?.toIso8601String(),
          'last_error': j.lastError,
          'payload': jsonDecode(j.payload),
        }).toList(),
      };

      final dir = await getTemporaryDirectory();
      final ts = DateTime.now().millisecondsSinceEpoch;
      final file = File('${dir.path}/sync_queue_$ts.json');
      await file.writeAsString(const JsonEncoder.withIndent('  ').convert(exportJson));

      await Share.shareXFiles(
        [XFile(file.path)],
        subject: 'bookledger sync queue export — ${jobs.length} jobs',
        text: 'Pending/failed sync queue from mobile device. '
              'Forward to admin for server-side replay.',
      );
      if (mounted) {
        setState(() => _statusMsg =
            'Exported ${jobs.length} change${jobs.length == 1 ? '' : 's'}.');
      }
    } catch (e) {
      debugPrint('[sync diagnostics] export failed: $e');
      if (mounted) setState(() => _statusMsg = 'Could not export. ($e)');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _small(String label, VoidCallback? onTap, {bool danger = false}) =>
      Semantics(
        button: true,
        enabled: onTap != null,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: onTap,
          child: Opacity(
            opacity: onTap == null ? 0.5 : 1,
            child: Container(
              height: 34,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: danger ? const Color(0xFFFEF2F2) : Bl.white,
                  borderRadius: BorderRadius.circular(999)),
              child: Text(label,
                  style: Bl.tight(13,
                      w: FontWeight.w600,
                      ls: 0,
                      c: danger ? Bl.redDeep : Bl.ink)),
            ),
          ),
        ),
      );

  Widget _jobCard(SyncMutation j) {
    final failed = j.status == 'FAILED';
    final tint = failed ? const Color(0xFFFDE2E2) : const Color(0xFFFFF1C9);
    final ink = failed ? Bl.redDeep : const Color(0xFF8A5A00);
    final what = j.action == 'rpc'
        ? 'RPC: ${j.rpcName ?? '?'}'
        : '${j.action.toUpperCase()} ${j.targetTable}';
    final note = (j.lastError ?? '').trim().isNotEmpty
        ? j.lastError!.trim()
        : j.status == 'PROCESSING'
            ? 'Sending now.'
            : 'Waiting for internet.';
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: Bl.tile, borderRadius: BorderRadius.circular(18)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: tint, shape: BoxShape.circle),
                child: BlIcon(
                    failed ? '<path d="M12 6v7M12 17v.500"/>' : BlIcons.sync,
                    size: 16,
                    color: ink,
                    stroke: failed ? 2.6 : 2),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(syncJobTitle(j.action, j.targetTable, j.rpcName),
                        style: Bl.tight(14.5, w: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text(
                        '$what · ${j.attempts} attempt${j.attempts == 1 ? '' : 's'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(12, c: _grey)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(note,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: Bl.inter(12.5,
                  w: FontWeight.w500, c: failed ? Bl.redDeep : Bl.ink3, h: 1.4)),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              // Only a change the server refused can be discarded. One that is
              // still waiting may already have been saved, so it is kept and
              // sent again.
              if (failed) ...[
                _small('Discard', _busy ? null : () => _discard(j),
                    danger: true),
                const SizedBox(width: 8),
              ],
              _small('Retry', _busy ? null : () => _retryOne(j)),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Sync Diagnostics'),
            Expanded(
              child: FutureBuilder<List<SyncMutation>>(
                future: _jobs,
                builder: (context, snap) {
                  if (snap.hasError) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                            'Could not read the waiting changes. (${snap.error})',
                            textAlign: TextAlign.center,
                            style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                      ),
                    );
                  }
                  if (!snap.hasData) {
                    return const Center(
                        child: CircularProgressIndicator(
                            color: Bl.amber, strokeWidth: 2));
                  }
                  final jobs = snap.data!;
                  if (jobs.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 64,
                            height: 64,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                                color: Color(0xFFE3F5EA),
                                shape: BoxShape.circle),
                            child: const BlIcon(BlIcons.check,
                                size: 28,
                                color: Color(0xFF17663A),
                                stroke: 2.6),
                          ),
                          const SizedBox(height: 14),
                          Text('Everything is synced',
                              style: Bl.tight(19,
                                  w: FontWeight.w700, ls: -0.02)),
                          const SizedBox(height: 6),
                          Text('No pending or failed jobs.',
                              style: Bl.inter(13.5, c: _grey)),
                          const SizedBox(height: 80),
                        ],
                      ),
                    );
                  }
                  return RefreshIndicator(
                    color: Bl.amber,
                    onRefresh: () async => _reload(),
                    child: ListView(
                      padding: const EdgeInsets.only(bottom: 24),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Waiting to sync',
                                  style: Bl.inter(13,
                                      w: FontWeight.w500, c: Bl.body)),
                              const SizedBox(height: 6),
                              Text(
                                  '${jobs.length} change${jobs.length == 1 ? '' : 's'}',
                                  style: Bl.tight(36,
                                      w: FontWeight.w700,
                                      ls: -0.04,
                                      h: 1.05)),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                          child: Row(
                            children: [
                              Expanded(
                                child: BlButton('Export and share',
                                    kind: BlButtonKind.soft,
                                    fontSize: 14,
                                    onTap: _busy ? null : _exportShare),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: BlButton('Retry all',
                                    loading: _busy,
                                    onTap: _busy ? null : _retryAll),
                              ),
                            ],
                          ),
                        ),
                        if (_statusMsg != null)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
                            child: Text(_statusMsg!,
                                style: Bl.inter(12.5, c: Bl.ink3)),
                          ),
                        BlGroupHeader('Changes', trailing: '${jobs.length}'),
                        for (final j in jobs) _jobCard(j),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
