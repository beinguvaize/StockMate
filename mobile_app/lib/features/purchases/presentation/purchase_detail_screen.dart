import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/returns/presentation/purchase_return_form_screen.dart';

class PurchaseDetailScreen extends ConsumerWidget {
  final Purchase purchase;
  const PurchaseDetailScreen({super.key, required this.purchase});

  Future<void> _updateStatus(BuildContext context, WidgetRef ref, String newStatus) async {
    try {
      await supabase
          .from('purchases')
          .update({'status': newStatus})
          .eq('id', purchase.id);

      final tenantId = ref.read(tenantContextProvider).valueOrNull?.tenantId;
      if (tenantId != null) {
        ref.invalidate(purchasesProvider(tenantId));
      }

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Marked as ${newStatus.toLowerCase()}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'The order may not have changed. Check it before trying again. ($e)'),
            backgroundColor: Bl.redDeep,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 6),
          ),
        );
      }
    }
  }

  static String _fmtDate(String? d) {
    if (d == null || d.isEmpty) return '—';
    try {
      final dt = DateTime.parse(d);
      const m = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${dt.day} ${m[dt.month - 1]} ${dt.year}';
    } catch (_) { return d; }
  }

  Widget _line(String k, String v, {VoidCallback? onTap}) {
    final row = Container(
      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 11),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Bl.sep))),
      child: Row(
        children: [
          Text(k,
              style: Bl.inter(13.5,
                  w: FontWeight.w500, c: const Color(0xFF7A8088))),
          const SizedBox(width: 12),
          Expanded(
            child: Text(v,
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.inter(13.5, w: FontWeight.w600, c: Bl.ink)),
          ),
        ],
      ),
    );
    return onTap == null ? row : BlTap(onTap: onTap, child: row);
  }

  Widget _outline(String label, VoidCallback onTap, {bool danger = false}) =>
      Expanded(
        child: BlTap(
          label: label,
          onTap: onTap,
          child: Container(
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                  color: danger
                      ? const Color(0xFFF2B8B8)
                      : const Color(0xFFDADADA)),
            ),
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(13,
                    w: FontWeight.w600,
                    ls: 0,
                    c: danger ? Bl.redDeep : Bl.ink3)),
          ),
        ),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = purchase.resolvedStatus;
    final name = purchase.supplierName ?? 'Unknown Supplier';
    final cancelled = status == 'CANCELLED';
    final pill = switch (status) {
      'RECEIVED' => const BlStatusPill.green('Received'),
      'ORDERED' => const BlStatusPill.yellow('Ordered'),
      'CANCELLED' => const BlStatusPill.red('Cancelled'),
      _ => const BlStatusPill.grey('Pending'),
    };

    // The one obvious next step goes on the big button; the rest sit above it.
    final (String? primaryLabel, String? primaryTarget) = switch (status) {
      'PENDING' => ('Mark ordered', 'ORDERED'),
      'ORDERED' => ('Mark received', 'RECEIVED'),
      'CANCELLED' => ('Restore order', 'ORDERED'),
      _ => (null, null),
    };
    final upperStatus = purchase.status?.toUpperCase();
    final showReturn = upperStatus == null ||
        upperStatus == 'RECEIVED' ||
        upperStatus == 'COMPLETED';

    void openReturn() => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PurchaseReturnFormScreen(purchase: purchase),
          ),
        );

    final secondary = <Widget>[
      if (!cancelled && status != 'PENDING')
        _outline('Mark pending', () => _updateStatus(context, ref, 'PENDING')),
      if (!cancelled && status != 'ORDERED' && primaryTarget != 'ORDERED')
        _outline('Mark ordered', () => _updateStatus(context, ref, 'ORDERED')),
      if (!cancelled && status != 'RECEIVED' && primaryTarget != 'RECEIVED')
        _outline(
            'Mark received', () => _updateStatus(context, ref, 'RECEIVED')),
      if (showReturn && primaryLabel != null)
        _outline('Process return', openReturn),
      if (!cancelled)
        _outline('Cancel', () => _updateStatus(context, ref, 'CANCELLED'),
            danger: true),
    ];

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Purchase Order'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: BlEntrance.all([
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                      child: Row(
                        children: [
                          BlTintAvatar(name, size: 44),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style:
                                        Bl.tight(16, w: FontWeight.w600)),
                                const SizedBox(height: 1),
                                Text(
                                    '${purchase.poNumber} · ${_fmtDate(purchase.date)}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.inter(12.5,
                                        c: const Color(0xFF7A8088))),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          pill,
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Order total',
                              style: Bl.inter(13, w: FontWeight.w500)),
                          const SizedBox(height: 6),
                          Text(
                            Money.inr(purchase.totalAmount),
                            style: Bl.tight(36,
                                    w: FontWeight.w700,
                                    ls: -0.04,
                                    h: 1.05,
                                    c: cancelled
                                        ? const Color(0xFF9AA0A6)
                                        : Bl.ink)
                                .copyWith(
                                    decoration: cancelled
                                        ? TextDecoration.lineThrough
                                        : null),
                          ),
                          if (!cancelled && purchase.due > 0.5) ...[
                            const SizedBox(height: 6),
                            Text(
                                '${Money.inr(purchase.due)} still to pay the supplier',
                                style: Bl.inter(12.5,
                                    w: FontWeight.w600, c: Bl.amberDeep)),
                          ],
                        ],
                      ),
                    ),
                    if (!cancelled)
                      _StatusTimeline(status: status)
                    else
                      Container(
                        margin: const EdgeInsets.fromLTRB(18, 20, 18, 0),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                            color: Bl.redSoft,
                            borderRadius: BorderRadius.circular(16)),
                        child: Text(
                            'This order was cancelled. Restore it to carry on.',
                            style: Bl.inter(13,
                                w: FontWeight.w500, c: Bl.redDeep)),
                      ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                      child: Column(
                        children: [
                          if (purchase.deliveryDate != null)
                            _line('Est. delivery',
                                _fmtDate(purchase.deliveryDate)),
                          _line('Order date', _fmtDate(purchase.date)),
                          _line('PO number', purchase.poNumber, onTap: () {
                            Clipboard.setData(
                                ClipboardData(text: purchase.poNumber));
                            ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text('PO number copied'),
                                    behavior: SnackBarBehavior.floating,
                                    duration: Duration(seconds: 2)));
                          }),
                          _line('Supplier', name),
                          _line(
                              'Payment',
                              (purchase.paymentType ?? 'CASH')
                                          .toUpperCase() ==
                                      'CASH'
                                  ? 'Cash'
                                  : (purchase.paymentType ?? '')
                                              .toUpperCase() ==
                                          'BANK'
                                      ? 'Bank'
                                      : 'Credit'),
                        ],
                      ),
                    ),
                    if (secondary.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
                        child: Row(
                          children: [
                            for (var i = 0; i < secondary.length; i++) ...[
                              if (i > 0) const SizedBox(width: 8),
                              secondary[i],
                            ],
                          ],
                        ),
                      ),
                  ]),
                ),
              ),
            ),
            if (primaryLabel != null || showReturn)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
                child: primaryLabel != null
                    ? BlButton(primaryLabel,
                        onTap: () =>
                            _updateStatus(context, ref, primaryTarget!))
                    : BlButton('Process return',
                        kind: BlButtonKind.soft, onTap: openReturn),
              ),
          ],
        ),
      ),
    );
  }
}

/// Placed → Ordered → Received, as three dots on a line.
class _StatusTimeline extends StatelessWidget {
  final String status;
  const _StatusTimeline({required this.status});

  static const _steps = [
    ('Placed', 'PO created'),
    ('Ordered', 'Sent to supplier'),
    ('Received', 'Goods received'),
  ];

  int get _active => switch (status) {
        'ORDERED' => 1,
        'RECEIVED' => 2,
        _ => 0,
      };

  @override
  Widget build(BuildContext context) {
    final active = _active;
    const green = Color(0xFF1E9E5A);
    Widget dot(int i) {
      if (i < active || (i == active && active == _steps.length - 1)) {
        return Container(
          width: 22,
          height: 22,
          alignment: Alignment.center,
          decoration:
              const BoxDecoration(color: green, shape: BoxShape.circle),
          child: const BlIcon(BlIcons.check,
              size: 13, color: Bl.white, stroke: 3),
        );
      }
      return Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          color: Bl.white,
          shape: BoxShape.circle,
          border: i == active
              ? Border.all(color: Bl.brand, width: 6)
              : Border.all(color: const Color(0xFFD4D4D4), width: 2),
        ),
      );
    }

    return Semantics(
      label: 'Order progress: ${_steps[active].$1}',
      child: Container(
        margin: const EdgeInsets.fromLTRB(18, 20, 18, 0),
        padding: const EdgeInsets.fromLTRB(6, 16, 6, 14),
        decoration: BoxDecoration(
            color: Bl.tile, borderRadius: BorderRadius.circular(16)),
        child: Stack(
          children: [
            // The line behind the dots: green as far as the order has got.
            Positioned(
              left: 0,
              right: 0,
              top: 10,
              child: Row(
                children: [
                  const Spacer(flex: 1),
                  Expanded(
                    flex: 2,
                    child: Container(
                        height: 2,
                        color: active >= 1 ? green : const Color(0xFFDCDCDC)),
                  ),
                  Expanded(
                    flex: 2,
                    child: Container(
                        height: 2,
                        color: active >= 2 ? green : const Color(0xFFDCDCDC)),
                  ),
                  const Spacer(flex: 1),
                ],
              ),
            ),
            Row(
              children: [
                for (var i = 0; i < _steps.length; i++)
                  Expanded(
                    child: Column(
                      children: [
                        dot(i),
                        const SizedBox(height: 6),
                        Text(_steps[i].$1,
                            style: Bl.tight(12.5,
                                w: FontWeight.w600,
                                ls: 0,
                                c: i <= active
                                    ? Bl.ink
                                    : const Color(0xFF9AA0A6))),
                        const SizedBox(height: 2),
                        Text(_steps[i].$2,
                            textAlign: TextAlign.center,
                            style: Bl.inter(11, c: Bl.mute)),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
