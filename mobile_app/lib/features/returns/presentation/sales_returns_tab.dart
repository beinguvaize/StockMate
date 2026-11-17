import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
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
      padding: const EdgeInsets.symmetric(horizontal: Gap.xl),
      child: Row(
        children: [
          _tab(0, 'Sales', null),
          const SizedBox(width: Gap.sm),
          _tab(1, 'Returns', returnsCount),
        ],
      ),
    );
  }

  Widget _tab(int i, String label, int? count) {
    final active = index == i;
    final fg = active
        ? AppColors.onPrimaryContainer
        : AppColors.onSurfaceVariant;
    return AppTappable(
      ripple: false,
      onTap: () => onChanged(i),
      child: AnimatedContainer(
        duration: Motion.base,
        curve: Motion.standard,
        padding: const EdgeInsets.symmetric(
          horizontal: Gap.lg,
          vertical: Gap.sm,
        ),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryContainer : AppColors.canvas,
          borderRadius: Radii.rPill,
          border: Border.all(
            color: active
                ? AppColors.primaryContainer
                : AppColors.outlineVariant,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: AppText.label.copyWith(color: fg)),
            if (count != null) ...[
              const SizedBox(width: Gap.xs),
              Text(
                '$count',
                key: Key('returns-count-$i'),
                style: AppText.label.copyWith(color: fg.withValues(alpha: 0.7)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The Returns tab body: credit notes for this tenant, newest first.
class SalesReturnsTab extends ConsumerWidget {
  final String? tenantId;
  const SalesReturnsTab({super.key, required this.tenantId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = tenantId;
    if (id == null) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }
    final returnsAsync = ref.watch(salesReturnsProvider(id));

    return returnsAsync.when(
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      ),
      error: (err, stack) {
        debugPrint('[SalesReturnsTab] could not load returns: $err');
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(Gap.xl),
            child: Text(
              'Could not load returns. Check your internet and try again.',
              textAlign: TextAlign.center,
              style: AppText.body.copyWith(color: AppColors.error),
            ),
          ),
        );
      },
      data: (returns) {
        if (returns.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  LucideIcons.undo2,
                  size: 28,
                  color: AppColors.inkTertiary,
                ),
                const SizedBox(height: Gap.sm),
                Text('No returns yet', style: AppText.bodyStrong),
                const SizedBox(height: 2),
                Text(
                  'Processed sales returns appear here.',
                  style: AppText.caption,
                ),
              ],
            ),
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(Gap.xl, 0, Gap.xl, 100),
          itemCount: returns.length,
          separatorBuilder: (_, _) => const Divider(
            height: 1,
            thickness: 1,
            color: AppColors.outlineVariant,
          ),
          itemBuilder: (context, i) => SalesReturnRow(
            key: Key('sales-return-row-${returns[i].id}'),
            ret: returns[i],
          ),
        );
      },
    );
  }
}

/// One credit note. Tap to show its lines from sales_return_items.
class SalesReturnRow extends StatefulWidget {
  final SalesReturn ret;
  const SalesReturnRow({super.key, required this.ret});

  @override
  State<SalesReturnRow> createState() => _SalesReturnRowState();
}

class _SalesReturnRowState extends State<SalesReturnRow> {
  bool _open = false;

  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
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
    final itemCount = r.items.length;

    return AppTappable(
      ripple: false,
      onTap: () => setState(() => _open = !_open),
      child: Container(
        color: AppColors.canvas,
        padding: const EdgeInsets.symmetric(vertical: Gap.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_fmtDate(r.date), style: AppText.caption),
                      const SizedBox(height: 2),
                      Text(
                        customer,
                        style: AppText.bodyStrong,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$itemCount item${itemCount == 1 ? '' : 's'}',
                        style: AppText.caption,
                      ),
                    ],
                  ),
                ),
                Text(
                  Money.inr(r.totalAmount),
                  style: AppText.money.copyWith(color: AppColors.error),
                ),
                const SizedBox(width: Gap.sm),
                Icon(
                  _open ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                  size: 16,
                  color: AppColors.inkTertiary,
                ),
              ],
            ),
            if (_open) ...[
              const SizedBox(height: Gap.md),
              _SalesReturnLines(returnId: r.id),
            ],
          ],
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
        padding: EdgeInsets.symmetric(vertical: Gap.sm),
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primary,
            ),
          ),
        ),
      ),
      error: (err, stack) {
        debugPrint('[SalesReturnLines] could not load lines: $err');
        return Text(
          'Could not load items. Check your internet and try again.',
          style: AppText.label.copyWith(color: AppColors.error),
        );
      },
      data: (lines) {
        if (lines.isEmpty) {
          return Text('No items recorded.', style: AppText.caption);
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final line in lines)
              Padding(
                padding: const EdgeInsets.only(bottom: Gap.xs),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        line.productName,
                        style: AppText.body,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: Gap.sm),
                    Text(
                      '${_qty(line.quantity)} x ${Money.inr(line.rate)}',
                      style: AppText.caption,
                    ),
                    const SizedBox(width: Gap.sm),
                    Text(Money.inr(line.lineTotal), style: AppText.label),
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
