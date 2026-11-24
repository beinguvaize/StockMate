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
import 'package:mobile_app/features/dashboard/presentation/widgets/dash_common.dart';
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
        // The sheet floats, rounded on all corners, and draws its own card.
        backgroundColor: Colors.transparent,
        elevation: 0,
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

  // Laid out to the approved board "Sales on this phone" (sales-11).
  @override
  Widget build(BuildContext context) {
    final online = ref.watch(syncOnlineProvider).valueOrNull ?? true;
    final ops = ref.watch(outboxSalesProvider).valueOrNull ?? const <UnsyncedOp>[];
    final refused = ops.where((o) => o.state == UnsyncedState.refused).toList();
    final pending = ops.where((o) => o.state == UnsyncedState.pending).toList();
    final otherRefused = (ref.watch(refusedJobCountProvider).valueOrNull ?? 0) - refused.length;
    final mq = MediaQuery.of(context);
    final canSync = online && !_syncing && pending.isNotEmpty;

    final status = online
        ? (pending.isEmpty
            ? 'Online · everything rung on this phone has reached the server'
            : 'Online · ${pending.length} waiting to send, in the order they were made')
        : 'Offline · keep selling. Bills are saved on this phone and sent '
            'automatically when the internet is back';

    return Container(
      margin: EdgeInsets.fromLTRB(8, 0, 8, 8 + mq.padding.bottom),
      constraints: BoxConstraints(
          maxHeight: mq.size.height - mq.padding.top - mq.padding.bottom - 24),
      decoration: BoxDecoration(
        color: DashColors.card,
        borderRadius: BorderRadius.circular(30),
      ),
      clipBehavior: Clip.antiAlias,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Sales on this phone', style: DashText.tight(19, ls: -0.02)),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 5),
                child: Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: online
                        ? const Color(0xFF1E9E5A)
                        : const Color(0xFF8A9099),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(status,
                    style: DashText.inter(12.5, c: const Color(0xFF6E737A))),
              ),
            ],
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.only(top: 12),
              children: [
                for (final op in refused)
                  _RefusedCard(
                    op: op,
                    onRetry: online
                        ? () => ref.read(syncServiceProvider).retryJob(op.jobId)
                        : null,
                    onDiscard: () => _discard(op),
                  ),
                if (otherRefused > 0)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      '$otherRefused other change${otherRefused == 1 ? '' : 's'} refused. '
                      'See Settings › Sync diagnostics.',
                      style: DashText.inter(12, c: const Color(0xFFB91C1C)),
                    ),
                  ),
                if (pending.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.only(top: 6, bottom: 8),
                    child: Text('Waiting to sync',
                        style: DashText.tight(12.5, w: FontWeight.w600, ls: 0)),
                  ),
                  for (final op in pending) _PendingRow(op: op),
                ],
                if (ops.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    child: Center(
                        child: Text('Nothing waiting.',
                            style: DashText.inter(13))),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Opacity(
            opacity: canSync ? 1 : 0.45,
            child: GestureDetector(
              key: const Key('sync-now'),
              behavior: HitTestBehavior.opaque,
              onTap: canSync ? _syncNow : null,
              child: Container(
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: DashColors.amber,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_syncing) ...[
                      const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white)),
                      const SizedBox(width: 8),
                    ],
                    Text(online ? 'Sync now' : 'Sync now (needs internet)',
                        style: DashText.tight(15.5, c: Colors.white)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _what(UnsyncedOp op) => op.rpcName == 'process_sale' ? 'Bill ${op.opId}' : 'Collection ${op.opId}';

double _amount(UnsyncedOp op) =>
    ((op.payload['p_total_amount'] ?? op.payload['p_amount']) as num?)?.toDouble() ?? 0;

/// "22 Nov, 4:10 pm", the one date form the app uses.
String _when(DateTime d) {
  final l = d.toLocal();
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final h12 = l.hour % 12 == 0 ? 12 : l.hour % 12;
  final min = l.minute.toString().padLeft(2, '0');
  return '${l.day} ${m[l.month - 1]}, $h12:$min ${l.hour < 12 ? 'am' : 'pm'}';
}

class _RefusedCard extends StatelessWidget {
  final UnsyncedOp op;
  final VoidCallback? onRetry;
  final VoidCallback onDiscard;
  const _RefusedCard({required this.op, required this.onRetry, required this.onDiscard});

  Widget _button(String label,
      {required VoidCallback? onTap, required Color fill, required Color ink}) {
    return Opacity(
      opacity: onTap == null ? 0.45 : 1,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: fill, borderRadius: BorderRadius.circular(999)),
          child: Text(label,
              style: DashText.tight(14.5, w: FontWeight.w600, c: ink, ls: 0)),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final info = describeRefusal(op.lastError, rpcName: op.rpcName);
    const red = Color(0xFFB91C1C);
    return Container(
      key: Key('refused-${op.jobId}'),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7F7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF5C2C2)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
                color: const Color(0xFFFDE2E2),
                borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.warning_amber_rounded, size: 18, color: red),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Refused by the server · not in the books',
                  style: DashText.tight(14.5, w: FontWeight.w600, c: red, ls: 0)),
              const SizedBox(height: 6),
              Row(children: [
                Expanded(
                    child: Text(_what(op),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: DashText.tight(13.5, w: FontWeight.w600, ls: 0))),
                const SizedBox(width: 8),
                Text(Money.inrExact(_amount(op)),
                    style: DashText.tight(13.5, w: FontWeight.w600, ls: 0)),
              ]),
              const SizedBox(height: 4),
              Text(info.title,
                  style: DashText.inter(13,
                      w: FontWeight.w600, c: const Color(0xFF30343A))),
              const SizedBox(height: 1),
              Text(info.reason,
                  style: DashText.inter(13, c: const Color(0xFF30343A))),
              const SizedBox(height: 4),
              Text(info.whatToDo,
                  style: DashText.inter(12,
                      w: FontWeight.w400, c: const Color(0xFF6E737A))),
              const SizedBox(height: 2),
              Text('Rung ${_when(op.createdAt)}',
                  style: DashText.inter(12,
                      w: FontWeight.w400, c: const Color(0xFF7A8088))),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: _button('Discard',
                onTap: onDiscard, fill: const Color(0xFFEFEEEC), ink: red),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _button(onRetry == null ? 'Retry (offline)' : 'Retry',
                onTap: onRetry, fill: DashColors.amber, ink: Colors.white),
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
    return Container(
      key: Key('pending-${op.jobId}'),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      decoration: BoxDecoration(
        color: DashColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6E5E3)),
      ),
      child: Row(children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
              color: const Color(0xFFFFF1C9),
              borderRadius: BorderRadius.circular(10)),
          child: const Icon(Icons.schedule, size: 17, color: Color(0xFF8A5A00)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_what(op),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: DashText.tight(14.5, w: FontWeight.w600, ls: 0)),
            const SizedBox(height: 1),
            Text(
              err != null && err.startsWith('Sign in again')
                  ? 'Rung ${_when(op.createdAt)} · sign in again to send'
                  : 'Rung ${_when(op.createdAt)} · not synced yet',
              style: DashText.inter(12,
                  w: FontWeight.w400, c: const Color(0xFF7A8088)),
            ),
          ]),
        ),
        const SizedBox(width: 8),
        Text(Money.inrExact(_amount(op)),
            style: DashText.tight(14.5, w: FontWeight.w600, ls: 0)),
      ]),
    );
  }
}

/// Kicks a replay when the till opens, so a backlog does not wait for the
/// minute timer. Harmless when there is nothing to send.
void nudgeSync(WidgetRef ref) {
  unawaited(ref.read(syncServiceProvider).sync());
}
