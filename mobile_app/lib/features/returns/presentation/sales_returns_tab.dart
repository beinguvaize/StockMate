import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/widgets/motion/expand_reveal.dart';
import 'package:mobile_app/features/returns/data/models/sales_return.dart';
import 'package:mobile_app/features/returns/presentation/providers/returns_provider.dart';

/// "Sales | Returns" switch at the top of the Sales screen, mirroring the
/// web Sales page's sub-tabs. [returnsCount] is shown on the Returns tab and
/// omitted while the count is not yet known.
class SalesHistoryTabs extends StatelessWidget {
  final int index;
  final int? returnsCount;
  final ValueChanged<int> onChanged;

  const SalesHistoryTabs({
    super.key,
    required this.index,
    required this.onChanged,
    this.returnsCount,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          _tab(0, 'Sales', null),
          const SizedBox(width: 8),
          _tab(1, 'Returns', returnsCount),
        ],
      ),
    );
  }

  Widget _tab(int i, String label, int? count) {
    final active = index == i;
    return BlTabPill(
      selected: active,
      onTap: () => onChanged(i),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label),
          if (count != null) ...[
            const SizedBox(width: 5),
            Opacity(
              opacity: 0.7,
              child: Text('$count', key: Key('returns-count-$i')),
            ),
          ],
        ],
      ),
    );
  }
}

/// Which heading a return falls under.
String returnsBucket(String date, DateTime now) {
  final d = DateTime.tryParse(date);
  if (d == null) return 'Earlier';
  final today = DateTime(now.year, now.month, now.day);
  final weekStart =
      DateTime(today.year, today.month, today.day - (today.weekday - 1));
  final day = DateTime(d.year, d.month, d.day);
  if (!day.isBefore(weekStart)) return 'This week';
  if (day.year == today.year && day.month == today.month) return 'This month';
  return 'Earlier';
}

class SalesReturnsTab extends ConsumerWidget {
  final String? tenantId;

  /// True inside the Sales screen, which scrolls for it. On its own the tab
  /// scrolls itself.
  final bool embedded;
  const SalesReturnsTab({super.key, required this.tenantId, this.embedded = false});

  Widget _centered(Widget child) => embedded
      ? Padding(padding: const EdgeInsets.only(top: 60), child: child)
      : Center(child: child);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const spinner = CircularProgressIndicator(color: Bl.amber, strokeWidth: 2);
    final id = tenantId;
    if (id == null) return _centered(const Center(child: spinner));
    final returnsAsync = ref.watch(salesReturnsProvider(id));

    return returnsAsync.when(
      loading: () => _centered(const Center(child: spinner)),
      error: (err, stack) {
        debugPrint('[SalesReturnsTab] could not load returns: $err');
        return _centered(
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Could not load returns. Check your internet and try again.',
              textAlign: TextAlign.center,
              style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5),
            ),
          ),
        );
      },
      data: (returns) {
        if (returns.isEmpty) {
          return _centered(
            const BlEmpty(
              icon: BlIcons.receipt,
              title: 'No returns yet',
              message: 'Processed sales returns appear here.',
            ),
          );
        }
        final now = DateTime.now();
        final rows = <Widget>[];
        String? bucket;
        for (final r in returns) {
          final b = returnsBucket(r.date, now);
          if (b != bucket) {
            bucket = b;
            final sum = returns
                .where((x) => returnsBucket(x.date, now) == b)
                .fold<double>(0, (a, x) => a + x.totalAmount);
            rows.add(BlGroupHeader(b, trailing: Money.inr(sum)));
          }
          rows.add(SalesReturnRow(key: Key('sales-return-row-${r.id}'), ret: r));
        }
        rows.add(Padding(
          padding: const EdgeInsets.fromLTRB(22, 14, 22, 0),
          child: Text('Processed sales returns appear here.',
              textAlign: TextAlign.center, style: Bl.inter(12, c: Bl.mute)),
        ));
        if (embedded) {
          return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch, children: rows);
        }
        return ListView(
            padding: const EdgeInsets.only(bottom: 100), children: rows);
      },
    );
  }
}

class SalesReturnRow extends StatefulWidget {
  final SalesReturn ret;
  const SalesReturnRow({super.key, required this.ret});

  @override
  State<SalesReturnRow> createState() => _SalesReturnRowState();
}

class _SalesReturnRowState extends State<SalesReturnRow> {
  bool _open = false;
  bool _everOpen = false; // keep lines mounted so collapse can animate

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  String _fmtDate(String dateStr) {
    final d = DateTime.tryParse(dateStr);
    if (d == null) return dateStr;
    return '${d.day} ${_months[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.ret;
    final customer = (r.clientName == null || r.clientName!.isEmpty)
        ? 'Walk-in'
        : r.clientName!;
    final n = r.items.length;

    return Semantics(
      button: true,
      expanded: _open,
      child: BlTap(
        onTap: () => setState(() {
          _open = !_open;
          if (_open) _everOpen = true;
        }),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BlPartyAvatar(customer),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(customer,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Bl.tight(14.5, w: FontWeight.w600)),
                        ),
                        const SizedBox(width: 8),
                        Text(Money.inr(r.totalAmount),
                            style:
                                Bl.tight(14.5, w: FontWeight.w600, c: Bl.red)),
                      ],
                    ),
                    const SizedBox(height: 1),
                    Text('${_fmtDate(r.date)} · $n item${n == 1 ? '' : 's'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(12, c: const Color(0xFF7A8088))),
                    if (_everOpen)
                      ExpandReveal(
                        expanded: _open,
                        child: Container(
                          margin: const EdgeInsets.only(top: 7),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 8),
                          decoration: BoxDecoration(
                              color: const Color(0xFFF6F5F3),
                              borderRadius: BorderRadius.circular(10)),
                          child: _SalesReturnLines(returnId: r.id),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SalesReturnLines extends ConsumerWidget {
  final String returnId;
  const _SalesReturnLines({required this.returnId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final linesAsync = ref.watch(salesReturnItemsProvider(returnId));
    return linesAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: Bl.amber,
            ),
          ),
        ),
      ),
      error: (err, stack) {
        debugPrint('[SalesReturnLines] could not load lines: $err');
        return Text(
          'Could not load items. Check your internet and try again.',
          style: Bl.inter(12, c: Bl.redDeep),
        );
      },
      data: (lines) {
        if (lines.isEmpty) {
          return Text('No items recorded.', style: Bl.inter(12, c: const Color(0xFF55595F)));
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final line in lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        line.productName,
                        style: Bl.inter(12, w: FontWeight.w500, c: const Color(0xFF55595F)),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${_qty(line.quantity)} x ${Money.inr(line.rate)}',
                      style: Bl.inter(12, w: FontWeight.w500, c: const Color(0xFF55595F)),
                    ),
                    const SizedBox(width: 8),
                    Text(Money.inr(line.lineTotal),
                        style: Bl.inter(12, w: FontWeight.w600, c: Bl.ink)),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }

  String _qty(double q) =>
      q == q.roundToDouble() ? q.toInt().toString() : q.toString();
}
