// What the cashier and the owner see of the offline sale queue:
//
//   OfflineSalesBanner   one line at the top of the till and the sales list:
//                        offline / N sales not synced / N refused. Tap → sheet.
//   UnsyncedSalesSheet   every sale and collection still on this phone, with
//                        Sync now, and for each refused one the bill, the
//                        server's reason, what to do, Retry and Discard.
//
// Nothing here computes money. Amounts shown are the bill as rung, labelled as
// not synced; the books are whatever the server makes of the replay.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_errors.dart';
import 'package:mobile_app/core/database/unsynced_sales.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider, databaseProvider;

/// Online as the outbox's own transport sees it (so tests can fake it).
final syncOnlineProvider = StreamProvider<bool>((ref) async* {
  final t = ref.watch(syncServiceProvider).transport;
  yield await t.isOnline();
  yield* t.onlineChanges;
});

final unsyncedSaleCountProvider = StreamProvider<int>(
    (ref) => ref.watch(syncServiceProvider).watchUnsyncedSaleCount());

final refusedJobCountProvider = StreamProvider<int>(
    (ref) => ref.watch(syncServiceProvider).watchFailedCount());

/// Sales and collections still on this phone, refused first, then oldest
/// first (the order they will replay in).
final outboxSalesProvider = StreamProvider<List<UnsyncedOp>>((ref) {
  final db = ref.watch(databaseProvider);
  final tenantId = ref.watch(tenantContextProvider).valueOrNull?.tenantId;
  return db.select(db.syncMutations).watch().asyncMap((_) async {
    final sales = await unsyncedOps(db, tenantId);
    final pays = await unsyncedOps(db, tenantId, rpcName: 'settle_client_payment');
    final all = [...sales, ...pays]
      ..sort((a, b) {
        final ra = a.state == UnsyncedState.refused ? 0 : 1;
        final rb = b.state == UnsyncedState.refused ? 0 : 1;
        if (ra != rb) return ra - rb;
        return a.jobId - b.jobId;
      });
    return all;
  });
});

class OfflineSalesBanner extends ConsumerWidget {
  final EdgeInsets padding;
  const OfflineSalesBanner({super.key, this.padding = EdgeInsets.zero});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(syncOnlineProvider).valueOrNull ?? true;
    final unsynced = ref.watch(unsyncedSaleCountProvider).valueOrNull ?? 0;
    final refused = ref.watch(refusedJobCountProvider).valueOrNull ?? 0;
    if (online && unsynced == 0 && refused == 0) return const SizedBox.shrink();

    final String text;
    final Color fg, bg;
    final IconData icon;
    final plural = unsynced == 1 ? '' : 's';
    if (refused > 0) {
      text = '$refused refused by the server — tap to fix';
      fg = AppColors.onErrorContainer;
      bg = AppColors.errorContainer;
      icon = Icons.error_outline;
    } else if (!online) {
      text = unsynced == 0
          ? 'Offline — sales are saved on this phone'
          : 'Offline — $unsynced sale$plural saved on this phone, not synced';
      fg = AppColors.onWarningContainer;
      bg = AppColors.warningContainer;
      icon = Icons.cloud_off;
    } else {
      text = '$unsynced sale$plural not synced yet — tap to sync';
      fg = AppColors.onInfoContainer;
      bg = AppColors.infoContainer;
      icon = Icons.cloud_upload_outlined;
    }

    return Padding(
      padding: padding,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          key: const Key('offline-sales-banner'),
          borderRadius: BorderRadius.circular(12),
          onTap: () => UnsyncedSalesSheet.show(context),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(children: [
              Icon(icon, size: 18, color: fg),
              const SizedBox(width: 8),
              Expanded(
                child: Text(text,
                    style: AppText.label.copyWith(color: fg, fontWeight: FontWeight.w700)),
              ),
              Icon(Icons.chevron_right, size: 18, color: fg),
            ]),
          ),
        ),
      ),
    );
  }
}

class UnsyncedSalesSheet extends ConsumerStatefulWidget {
  const UnsyncedSalesSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useRootNavigator: true,
        backgroundColor: AppColors.canvas,
        shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (_) => const UnsyncedSalesSheet(),
      );

  @override
  ConsumerState<UnsyncedSalesSheet> createState() => _UnsyncedSalesSheetState();
}

class _UnsyncedSalesSheetState extends ConsumerState<UnsyncedSalesSheet> {
  bool _syncing = false;

  Future<void> _syncNow() async {
    setState(() => _syncing = true);
    try {
      await ref.read(syncServiceProvider).sync(force: true);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _discard(UnsyncedOp op) async {
    final isSale = op.rpcName == 'process_sale';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isSale ? 'Discard bill ${op.opId}?' : 'Discard this collection?'),
        content: Text(isSale
            ? 'This sale will NOT be recorded: no stock moves and the customer\'s '
                'account is not changed. If the customer took the goods, ring the '
                'bill again. The refused bill stays in Sync diagnostics for audit.'
            : 'This payment will NOT be recorded against the customer. Record it '
                'again once the cause is fixed. It stays in Sync diagnostics for audit.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Discard', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(syncServiceProvider).discardJob(op.jobId);
  }

  @override
  Widget build(BuildContext context) {
    final online = ref.watch(syncOnlineProvider).valueOrNull ?? true;
    final ops = ref.watch(outboxSalesProvider).valueOrNull ?? const <UnsyncedOp>[];
    final refused = ops.where((o) => o.state == UnsyncedState.refused).toList();
    final pending = ops.where((o) => o.state == UnsyncedState.pending).toList();
    final otherRefused = (ref.watch(refusedJobCountProvider).valueOrNull ?? 0) - refused.length;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      builder: (_, ctrl) => ListView(
        controller: ctrl,
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          Center(
            child: Container(width: 40, height: 4,
                decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(2))),
          ),
          const SizedBox(height: 16),
          Text('Sales on this phone', style: AppText.title),
          const SizedBox(height: 4),
          Text(
            online
                ? (pending.isEmpty
                    ? 'Online. Everything rung on this phone has reached the server.'
                    : 'Online. ${pending.length} waiting to send, in the order they were made.')
                : 'Offline. Keep selling: bills are saved on this phone and sent '
                    'automatically when the internet is back.',
            style: AppText.caption,
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              key: const Key('sync-now'),
              onPressed: (!online || _syncing || pending.isEmpty) ? null : _syncNow,
              icon: _syncing
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.sync, size: 18),
              label: Text(online ? 'Sync now' : 'Sync now (needs internet)'),
            ),
          ),
          if (refused.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text('Refused by the server — not in the books',
                style: AppText.label.copyWith(color: AppColors.error, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            for (final op in refused)
              _RefusedCard(
                op: op,
                onRetry: online ? () => ref.read(syncServiceProvider).retryJob(op.jobId) : null,
                onDiscard: () => _discard(op),
              ),
          ],
          if (otherRefused > 0) ...[
            const SizedBox(height: 8),
            Text('$otherRefused other change${otherRefused == 1 ? '' : 's'} refused — '
                'see Settings › Sync diagnostics.',
                style: AppText.caption.copyWith(color: AppColors.error)),
          ],
          if (pending.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text('Waiting to sync', style: AppText.label.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            for (final op in pending) _PendingRow(op: op),
          ],
          if (ops.isEmpty) ...[
            const SizedBox(height: 24),
            Center(child: Text('Nothing waiting.', style: AppText.caption)),
          ],
        ],
      ),
    );
  }
}

String _what(UnsyncedOp op) => op.rpcName == 'process_sale' ? 'Bill ${op.opId}' : 'Collection ${op.opId}';

double _amount(UnsyncedOp op) =>
    ((op.payload['p_total_amount'] ?? op.payload['p_amount']) as num?)?.toDouble() ?? 0;

String _when(DateTime d) {
  final l = d.toLocal();
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(l.day)}/${two(l.month)} ${two(l.hour)}:${two(l.minute)}';
}

class _RefusedCard extends StatelessWidget {
  final UnsyncedOp op;
  final VoidCallback? onRetry;
  final VoidCallback onDiscard;
  const _RefusedCard({required this.op, required this.onRetry, required this.onDiscard});

  @override
  Widget build(BuildContext context) {
    final info = describeRefusal(op.lastError);
    return Container(
      key: Key('refused-${op.jobId}'),
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(_what(op), style: AppText.bodyStrong)),
          Text(Money.inrExact(_amount(op)), style: AppText.money),
        ]),
        Text('Rung ${_when(op.createdAt)}', style: AppText.caption),
        const SizedBox(height: 8),
        Text(info.title,
            style: AppText.label.copyWith(color: AppColors.onErrorContainer, fontWeight: FontWeight.w800)),
        Text(info.reason, style: AppText.caption.copyWith(color: AppColors.onErrorContainer)),
        const SizedBox(height: 6),
        Text(info.whatToDo, style: AppText.caption),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: onDiscard,
              child: const Text('Discard'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton(
              onPressed: onRetry,
              child: Text(onRetry == null ? 'Retry (offline)' : 'Retry'),
            ),
          ),
        ]),
      ]),
    );
  }
}

class _PendingRow extends StatelessWidget {
  final UnsyncedOp op;
  const _PendingRow({required this.op});

  @override
  Widget build(BuildContext context) {
    final err = op.lastError;
    return Padding(
      key: Key('pending-${op.jobId}'),
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        const Icon(Icons.schedule, size: 18, color: AppColors.warning),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_what(op), style: AppText.bodyStrong),
            Text(
              err != null && err.startsWith('Sign in again')
                  ? 'Rung ${_when(op.createdAt)} · sign in again to send'
                  : 'Rung ${_when(op.createdAt)} · not synced yet',
              style: AppText.caption,
            ),
          ]),
        ),
        Text(Money.inrExact(_amount(op)), style: AppText.money),
      ]),
    );
  }
}

/// Kicks a replay when the till opens, so a backlog does not wait for the
/// minute timer. Harmless when there is nothing to send.
void nudgeSync(WidgetRef ref) {
  unawaited(ref.read(syncServiceProvider).sync());
}
