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
import 'package:mobile_app/core/design/bl_widgets.dart';
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
    final plural = unsynced == 1 ? '' : 's';
    if (refused > 0) {
      text = '$refused refused by the server — tap to fix';
      fg = Bl.redDeep;
      bg = Bl.redSoft;
    } else if (!online) {
      text = unsynced == 0
          ? 'Offline — sales are saved on this phone'
          : 'Offline — $unsynced sale$plural saved on this phone, not synced';
      fg = const Color(0xFF6B4E00);
      bg = const Color(0xFFFFF8E1);
    } else {
      text = '$unsynced sale$plural not synced yet — tap to sync';
      fg = const Color(0xFF1D4E9E);
      bg = Bl.blueSoft;
    }

    return Padding(
      padding: padding,
      child: Semantics(
        button: true,
        child: GestureDetector(
          key: const Key('offline-sales-banner'),
          behavior: HitTestBehavior.opaque,
          onTap: () => UnsyncedSalesSheet.show(context),
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
                color: bg, borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              Expanded(
                child: Text(text,
                    style: Bl.inter(12, w: FontWeight.w600, c: fg, h: 1.35)),
              ),
              BlIcon(BlIcons.chevronRight, size: 16, color: fg),
            ]),
          ),
        ),
      ),
    );
  }
}

class UnsyncedSalesSheet extends ConsumerStatefulWidget {
  const UnsyncedSalesSheet({super.key});

  static Future<void> show(BuildContext context) => showBlSheet<void>(
        context: context,
        useRootNavigator: true,
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
    final ok = await showBlDialog<bool>(
      context: context,
      title: isSale ? 'Discard bill ${op.opId}?' : 'Discard this collection?',
      message: isSale
          ? 'This sale will NOT be recorded: no stock moves and the customer\'s '
              'account is not changed. If the customer took the goods, ring the '
              'bill again. The refused bill stays in Sync diagnostics for audit.'
          : 'This payment will NOT be recorded against the customer. Record it '
              'again once the cause is fixed. It stays in Sync diagnostics for audit.',
      actions: (ctx) => [
        Row(
          children: [
            Expanded(
              child: BlButton('Keep',
                  kind: BlButtonKind.soft,
                  onTap: () => Navigator.pop(ctx, false)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: BlButton('Discard',
                  key: const Key('confirm-discard'),
                  kind: BlButtonKind.danger,
                  onTap: () => Navigator.pop(ctx, true)),
            ),
          ],
        ),
      ],
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

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BlSheetTitle('Sales on this phone'),
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
                    color: online ? const Color(0xFF1E9E5A) : Bl.amber,
                    shape: BoxShape.circle),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                online
                    ? (pending.isEmpty
                        ? 'Online. Everything rung on this phone has reached the server.'
                        : 'Online. ${pending.length} waiting to send, in the order they were made.')
                    : 'Offline. Keep selling: bills are saved on this phone and sent '
                        'automatically when the internet is back.',
                style: Bl.inter(12.5, w: FontWeight.w500, h: 1.4),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        for (final op in refused)
          _RefusedCard(
            op: op,
            onRetry: online ? () => ref.read(syncServiceProvider).retryJob(op.jobId) : null,
            onDiscard: () => _discard(op),
          ),
        if (otherRefused > 0)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
                '$otherRefused other change${otherRefused == 1 ? '' : 's'} refused — '
                'see Settings › Sync diagnostics.',
                style: Bl.inter(12, c: Bl.redDeep)),
          ),
        for (final op in pending) _PendingRow(op: op),
        if (ops.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Center(
                child: Text('Nothing waiting.', style: Bl.inter(13, c: Bl.mute))),
          ),
        const SizedBox(height: 14),
        BlButton(
          online ? 'Sync now' : 'Sync now (needs internet)',
          key: const Key('sync-now'),
          loading: _syncing,
          onTap: (!online || _syncing || pending.isEmpty) ? null : _syncNow,
        ),
      ],
    );
  }
}

String _what(UnsyncedOp op) => op.rpcName == 'process_sale' ? 'Bill ${op.opId}' : 'Collection ${op.opId}';

double _amount(UnsyncedOp op) =>
    ((op.payload['p_total_amount'] ?? op.payload['p_amount']) as num?)?.toDouble() ?? 0;

const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "22 Nov, 4:10 pm"
String _when(DateTime d) {
  final l = d.toLocal();
  final h = l.hour % 12 == 0 ? 12 : l.hour % 12;
  return '${l.day} ${_mon[l.month - 1]}, $h:${l.minute.toString().padLeft(2, '0')} ${l.hour < 12 ? 'am' : 'pm'}';
}

Widget _tile(String icon, Color bg, Color fg) => Container(
      width: 34,
      height: 34,
      alignment: Alignment.center,
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: BlIcon(icon, size: 16, color: fg),
    );

class _RefusedCard extends StatelessWidget {
  final UnsyncedOp op;
  final VoidCallback? onRetry;
  final VoidCallback onDiscard;
  const _RefusedCard({required this.op, required this.onRetry, required this.onDiscard});

  @override
  Widget build(BuildContext context) {
    final info = describeRefusal(op.lastError, rpcName: op.rpcName);
    return Container(
      key: Key('refused-${op.jobId}'),
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7F7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF5C2C2)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _tile('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
              const Color(0xFFFDE2E2), Bl.redDeep),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Refused by the server · not in the books',
                  style: Bl.tight(14.5, w: FontWeight.w600, c: Bl.redDeep)),
              const SizedBox(height: 4),
              Row(children: [
                Expanded(
                    child: Text(_what(op),
                        style: Bl.tight(13.5, w: FontWeight.w600))),
                Text(Money.inrExact(_amount(op)),
                    style: Bl.tight(13.5, w: FontWeight.w600)),
              ]),
              const SizedBox(height: 2),
              Text(info.title,
                  style: Bl.inter(13, w: FontWeight.w600, c: Bl.ink3)),
              Text(info.reason,
                  style: Bl.inter(13, w: FontWeight.w500, c: Bl.ink3, h: 1.4)),
              const SizedBox(height: 2),
              Text(info.whatToDo,
                  style: Bl.inter(12, c: const Color(0xFF7A8088), h: 1.4)),
              const SizedBox(height: 2),
              Text('Rung ${_when(op.createdAt)}',
                  style: Bl.inter(12, c: const Color(0xFF7A8088))),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: BlButton('Discard',
                kind: BlButtonKind.danger,
                height: 42,
                fontSize: 14.5,
                onTap: onDiscard),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: BlButton(onRetry == null ? 'Retry (offline)' : 'Retry',
                height: 42, fontSize: 14.5, onTap: onRetry),
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
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6E5E3)),
      ),
      child: Row(children: [
        _tile('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
            const Color(0xFFFFF1C9), const Color(0xFF8A5A00)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_what(op),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(14.5, w: FontWeight.w600)),
            const SizedBox(height: 1),
            Text(
              err != null && err.startsWith('Sign in again')
                  ? 'Rung ${_when(op.createdAt)} · sign in again to send'
                  : 'Rung ${_when(op.createdAt)} · not synced yet',
              style: Bl.inter(12, c: const Color(0xFF7A8088)),
            ),
          ]),
        ),
        const SizedBox(width: 8),
        Text(Money.inrExact(_amount(op)),
            style: Bl.tight(14.5, w: FontWeight.w600)),
      ]),
    );
  }
}

/// Kicks a replay when the till opens, so a backlog does not wait for the
/// minute timer. Harmless when there is nothing to send.
void nudgeSync(WidgetRef ref) {
  unawaited(ref.read(syncServiceProvider).sync());
}
