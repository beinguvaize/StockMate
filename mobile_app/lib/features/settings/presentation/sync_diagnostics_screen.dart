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
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/main.dart' show databaseProvider, syncServiceProvider;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

class SyncDiagnosticsScreen extends ConsumerStatefulWidget {
  const SyncDiagnosticsScreen({super.key});

  @override
  ConsumerState<SyncDiagnosticsScreen> createState() => _SyncDiagnosticsScreenState();
}

class _SyncDiagnosticsScreenState extends ConsumerState<SyncDiagnosticsScreen> {
  bool _busy = false;
  String? _statusMsg;

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
      setState(() => _statusMsg = 'Retry triggered. Pull-to-refresh to see updated status.');
    } catch (e) {
      setState(() => _statusMsg = 'Retry error: $e');
    } finally {
      setState(() => _busy = false);
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
        subject: 'StockMate sync queue export — ${jobs.length} jobs',
        text: 'Pending/failed sync queue from mobile device. '
              'Forward to admin for server-side replay.',
      );
      setState(() => _statusMsg = 'Exported ${jobs.length} jobs.');
    } catch (e) {
      setState(() => _statusMsg = 'Export error: $e');
    } finally {
      setState(() => _busy = false);
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'FAILED': return Colors.red;
      case 'PROCESSING': return Colors.orange;
      case 'PENDING': return Colors.amber;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        title: Text(
          'Sync Diagnostics',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
          ),
        ),
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Action buttons
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _busy ? null : _retryAll,
                      icon: const Icon(LucideIcons.refreshCw, size: 16),
                      label: const Text('Retry All'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _busy ? null : _exportShare,
                      icon: const Icon(LucideIcons.share2, size: 16),
                      label: const Text('Export & Share'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.surface,
                        foregroundColor: AppColors.inkPrimary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            if (_statusMsg != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Text(
                  _statusMsg!,
                  style: GoogleFonts.inter(fontSize: 13, color: AppColors.inkSecondary),
                ),
              ),

            // Jobs list
            Expanded(
              child: FutureBuilder<List<SyncMutation>>(
                future: _loadJobs(),
                builder: (context, snap) {
                  if (!snap.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final jobs = snap.data!;
                  if (jobs.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(LucideIcons.checkCircle2, size: 48, color: Colors.green.shade400),
                          const SizedBox(height: 12),
                          Text(
                            'No pending or failed jobs',
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              color: AppColors.inkSecondary,
                            ),
                          ),
                        ],
                      ),
                    );
                  }
                  return RefreshIndicator(
                    onRefresh: () async { setState(() {}); },
                    child: ListView.separated(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: jobs.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final j = jobs[i];
                        return Container(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.inkTertiary.withValues(alpha: 0.15)),
                          ),
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: _statusColor(j.status).withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      j.status,
                                      style: GoogleFonts.jetBrainsMono(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: _statusColor(j.status),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '#${j.id}',
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 12,
                                      color: AppColors.inkTertiary,
                                    ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    '${j.attempts} attempt${j.attempts == 1 ? '' : 's'}',
                                    style: GoogleFonts.inter(
                                      fontSize: 11,
                                      color: AppColors.inkTertiary,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                j.action == 'rpc'
                                    ? 'RPC: ${j.rpcName ?? '?'}'
                                    : '${j.action.toUpperCase()} ${j.targetTable}',
                                style: GoogleFonts.inter(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.inkPrimary,
                                ),
                              ),
                              if (j.lastError != null) ...[
                                const SizedBox(height: 6),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: Colors.red.shade50,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    j.lastError!,
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 11,
                                      color: Colors.red.shade900,
                                    ),
                                    maxLines: 4,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 6),
                              Text(
                                'Created ${j.createdAt.toLocal().toString().substring(0, 19)}',
                                style: GoogleFonts.inter(
                                  fontSize: 11,
                                  color: AppColors.inkTertiary,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
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
