import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/widgets/app_surfaces.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';

class SalesScreen extends ConsumerStatefulWidget {
  const SalesScreen({super.key});

  @override
  ConsumerState<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends ConsumerState<SalesScreen> {
  int _filterIndex = 0; // 0=All, 1=Paid, 2=Credit, 3=Pending/Failed
  int _dateIndex = 0; // 0=All, 1=Today, 2=Yesterday, 3=This Week, 4=This Month
  static const _dateFilters = [
    'All',
    'Today',
    'Yesterday',
    'This Week',
    'This Month',
  ];

  // True when a sale's date falls inside the currently-selected range.
  // DB returns DATE ("2026-07-13") or TIMESTAMP ("2026-07-13T..") — DateTime.parse handles both.
  bool _inDateRange(String? dateStr) {
    if (_dateIndex == 0) return true;
    if (dateStr == null || dateStr.isEmpty) return false;
    final d = DateTime.tryParse(dateStr);
    if (d == null) return false;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(d.year, d.month, d.day);
    switch (_dateIndex) {
      case 1:
        return day == today;
      case 2:
        return day == today.subtract(const Duration(days: 1));
      case 3:
        final weekStart = today.subtract(
          Duration(days: today.weekday - 1),
        ); // Monday
        return !day.isBefore(weekStart) && !day.isAfter(today);
      case 4:
        final monthStart = DateTime(now.year, now.month, 1);
        return !day.isBefore(monthStart) && !day.isAfter(today);
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final salesAsync = ref.watch(recentSalesProvider);
    final filters = ['All', 'Paid', 'Credit', 'Failed'];

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: 0,
        actions: const [],
      ),
      // FAB provided by DashboardScreen's shell when sales tab is active.
      // Avoids stacked duplicate FABs.
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ─────────────────────────────────────────────
            // Title only — "New Sale" action lives on the shell-level FAB
            // (see DashboardScreen build). Keeping a second button here
            // duplicates the action and visually collides with the global
            // SyncStatusPill rendered just above this row.
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
              child: Text('Sales history', style: AppText.display),
            ),

            const SizedBox(height: 20),

            // ── Stats row ──────────────────────────────────────────
            salesAsync.maybeWhen(
              data: (sales) {
                // Stats follow the selected date range (Total Today by default).
                final rangeSales = sales
                    .where((s) => _inDateRange(s.date))
                    .toList();
                final total = rangeSales.fold(
                  0.0,
                  (sum, s) => sum + (s.totalAmount ?? 0),
                );
                final txCount = rangeSales.length;
                final totalLabel = _dateIndex == 0
                    ? 'Total (all)'
                    : 'Total ${_dateFilters[_dateIndex].toLowerCase()}';
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Gap.xl),
                  child: IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          child: AppCard(
                            padding: const EdgeInsets.all(Gap.lg),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  totalLabel,
                                  style: AppText.caption,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: Gap.xs),
                                // This figure was painted in AppColors.danger --
                                // the app's error red. It is the money the
                                // business took today, and it was the only red
                                // number on the screen, which reads as something
                                // having gone wrong. Revenue is ink.
                                Text(
                                  Money.inr(total),
                                  style: AppText.moneyLarge.copyWith(
                                    fontSize: 26,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ),
                        Gap.w12,
                        Expanded(
                          child: AppCard(
                            padding: const EdgeInsets.all(Gap.lg),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text('Transactions', style: AppText.caption),
                                const SizedBox(height: Gap.xs),
                                Text(
                                  '$txCount',
                                  style: AppText.moneyLarge.copyWith(
                                    fontSize: 26,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
              orElse: () => const SizedBox.shrink(),
            ),

            const SizedBox(height: 16),

            // ── Date-range chips (All / Today / Yesterday / Week / Month) ──
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 24),
                itemCount: _dateFilters.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final isActive = _dateIndex == i;
                  return GestureDetector(
                    onTap: () => setState(() => _dateIndex = i),
                    child: AnimatedContainer(
                      duration: Motion.durationOf(context, Motion.base),
                      // A filter chip is not a floating object; it had a drop
                      // shadow on every one of nine chips across two rows.
                      padding: const EdgeInsets.symmetric(
                        horizontal: Gap.lg,
                        vertical: Gap.sm,
                      ),
                      decoration: BoxDecoration(
                        color: isActive
                            ? AppColors.onSurface
                            : AppColors.canvas,
                        borderRadius: Radii.rPill,
                        border: Border.all(
                          color: isActive
                              ? AppColors.onSurface
                              : AppColors.outlineVariant,
                        ),
                      ),
                      child: Text(
                        _dateFilters[i],
                        style: AppText.label.copyWith(
                          color: isActive
                              ? AppColors.canvas
                              : AppColors.onSurfaceVariant,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 20),

            // ── Section heading, then its filters ──────────────────
            //
            // The heading and four chips shared one Row. At a readable size
            // "Recent sales" wrapped to two lines and ran into the chips.
            // A heading is not a label on a control row; it sits above it.
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Gap.xl),
              child: Text('Recent sales', style: AppText.title),
            ),

            const SizedBox(height: Gap.md),

            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: Gap.xl),
                itemCount: filters.length,
                separatorBuilder: (_, _) => const SizedBox(width: Gap.sm),
                itemBuilder: (context, i) {
                  final isActive = _filterIndex == i;
                  return GestureDetector(
                    onTap: () => setState(() => _filterIndex = i),
                    child: AnimatedContainer(
                      duration: Motion.base,
                      curve: Motion.standard,
                      padding: const EdgeInsets.symmetric(
                        horizontal: Gap.lg,
                        vertical: Gap.sm,
                      ),
                      decoration: BoxDecoration(
                        color: isActive
                            ? AppColors.primaryContainer
                            : AppColors.canvas,
                        borderRadius: Radii.rPill,
                        border: Border.all(
                          color: isActive
                              ? AppColors.primaryContainer
                              : AppColors.outlineVariant,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          filters[i],
                          style: AppText.label.copyWith(
                            color: isActive
                                ? AppColors.onPrimaryContainer
                                : AppColors.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 16),

            // ── Sales list ──────────────────────────────────────────
            Expanded(
              child: salesAsync.when(
                data: (allSales) {
                  final sales = allSales.where((s) {
                    if (!_inDateRange(s.date)) return false;
                    final st = (s.paymentStatus ?? '').toUpperCase();
                    // Credit = anything owed (PENDING/UNPAID/PARTIAL) — matches the
                    // "Credit" badge. Failed = only voided/failed.
                    if (_filterIndex == 1)
                      return st == 'PAID' || st == 'COMPLETED';
                    if (_filterIndex == 2)
                      return st == 'PENDING' ||
                          st == 'UNPAID' ||
                          st == 'PARTIAL';
                    if (_filterIndex == 3)
                      return st == 'VOIDED' || st == 'FAILED';
                    return true;
                  }).toList();

                  if (sales.isEmpty) {
                    return Center(
                      child: Text(
                        'No sales found.',
                        style: AppText.body.copyWith(
                          color: AppColors.inkTertiary,
                        ),
                      ),
                    );
                  }

                  // Resolve client name from clientsProvider when sale.shopId is set
                  // (RPC-created sales don't carry customerInfo — only shopId).
                  final clientsAsync = ref.watch(clientsProvider);
                  final clientById = <String, String>{};
                  if (clientsAsync.hasValue) {
                    for (final c in clientsAsync.value!) {
                      clientById[c.id] = c.name ?? '';
                    }
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(Gap.xl, 0, Gap.xl, 100),
                    itemCount: sales.length,
                    // Each sale used to be its own 20px-radius shadowed card,
                    // so a day's trading read as a stack of unrelated objects
                    // rather than as a ledger. A list of like things is a list.
                    separatorBuilder: (_, _) => const Divider(
                      height: 1,
                      thickness: 1,
                      color: AppColors.outlineVariant,
                    ),
                    itemBuilder: (context, index) {
                      final sale = sales[index];
                      final resolvedFromShop = (sale.shopId != null)
                          ? clientById[sale.shopId!]
                          : null;
                      final customerName =
                          (resolvedFromShop != null &&
                              resolvedFromShop.isNotEmpty)
                          ? resolvedFromShop
                          : sale.displayCustomerName;
                      final saleStatus = (sale.paymentStatus ?? '')
                          .toUpperCase();
                      final isPaid = saleStatus == 'PAID';
                      final isFailed =
                          saleStatus == 'VOIDED' || saleStatus == 'FAILED';
                      final isPending = saleStatus == 'PENDING';
                      final isPartial = saleStatus == 'PARTIAL';
                      final paidAmt = sale.paidAmount ?? 0;
                      final dueAmt = ((sale.totalAmount ?? 0) - paidAmt).clamp(
                        0,
                        double.infinity,
                      );
                      String badgeLabel;
                      Color badgeColor;
                      if (isPaid) {
                        badgeLabel = 'Paid';
                        badgeColor = AppColors.success;
                      } else if (isFailed) {
                        badgeLabel = 'Failed';
                        badgeColor = AppColors.danger;
                      } else if (isPartial) {
                        badgeLabel = 'Partial';
                        badgeColor = AppColors.warning;
                      } else if (isPending) {
                        badgeLabel = 'Pending';
                        badgeColor = AppColors.warning;
                      } else {
                        badgeLabel = 'Credit';
                        badgeColor = AppColors.warning;
                      }
                      final initial = customerName.isNotEmpty
                          ? customerName[0].toUpperCase()
                          : 'W';

                      return GestureDetector(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => InvoiceDetailScreen(
                              invoice: Invoice.fromSale(sale),
                            ),
                          ),
                        ),
                        child: Container(
                          color: AppColors.canvas,
                          padding: const EdgeInsets.symmetric(vertical: Gap.lg),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  // Avatar
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: const BoxDecoration(
                                      color: AppColors.secondaryContainer,
                                      shape: BoxShape.circle,
                                    ),
                                    child: Center(
                                      child: Text(
                                        initial,
                                        style: AppText.heading.copyWith(
                                          color: AppColors.onSurfaceVariant,
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 14),

                                  // Name + invoice ID
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          customerName,
                                          style: AppText.bodyStrong,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          '#${sale.id.toUpperCase()}',
                                          style: AppText.caption,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        if (sale.date != null) ...[
                                          const SizedBox(height: 2),
                                          Text(
                                            _fmtDate(sale.date!),
                                            style: AppText.caption,
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),

                                  // Amount + status badge
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        Money.inr(sale.totalAmount ?? 0),
                                        // Unpaid money still stands apart -- that was
                                        // a deliberate call and it is a real signal.
                                        // Paid no longer also takes green: the "Paid"
                                        // badge sits directly beneath it saying so,
                                        // and colouring both made every settled row
                                        // shout as loudly as the ones that need
                                        // chasing. The hardcoded 0xFFB91C1C is the
                                        // error token now.
                                        style: AppText.money.copyWith(
                                          color: isFailed
                                              ? AppColors.inkTertiary
                                              : isPaid
                                              ? AppColors.onSurface
                                              : AppColors.error,
                                          decoration: isFailed
                                              ? TextDecoration.lineThrough
                                              : null,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: Gap.sm,
                                          vertical: 3,
                                        ),
                                        decoration: BoxDecoration(
                                          color: badgeColor.withValues(
                                            alpha: 0.12,
                                          ),
                                          borderRadius: Radii.rXs,
                                        ),
                                        child: Text(
                                          badgeLabel,
                                          style: AppText.label.copyWith(
                                            color: badgeColor,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              // Full-width strip for sales that still owe money —
                              // clear paid/due figures + one-tap Collect, instead of
                              // cramming them into the narrow right column.
                              if (!isPaid && !isFailed && dueAmt > 0) ...[
                                // No divider here. The list already separates
                                // one sale from the next with a hairline of
                                // exactly this weight, so a second one INSIDE
                                // a sale split it into two entries -- the
                                // balance strip read as its own row belonging
                                // to nothing. Spacing groups it instead.
                                const SizedBox(height: Gap.md),
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text.rich(
                                        TextSpan(
                                          style: AppText.label,
                                          children: [
                                            if (isPartial) ...[
                                              TextSpan(
                                                text:
                                                    'Paid ₹${paidAmt.toStringAsFixed(0)}',
                                                style: const TextStyle(
                                                  color: AppColors.success,
                                                ),
                                              ),
                                              const TextSpan(
                                                text: '  ·  ',
                                                style: TextStyle(
                                                  color: AppColors.inkTertiary,
                                                ),
                                              ),
                                            ],
                                            TextSpan(
                                              text:
                                                  'Balance ₹${dueAmt.toStringAsFixed(0)}',
                                              style: const TextStyle(
                                                color: Color(0xFFB91C1C),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                    GestureDetector(
                                      onTap: () => Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) => InvoiceDetailScreen(
                                            invoice: Invoice.fromSale(sale),
                                          ),
                                        ),
                                      ),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: Gap.lg,
                                          vertical: 10,
                                        ),
                                        decoration: const BoxDecoration(
                                          color: AppColors.primary,
                                          borderRadius: Radii.rSm,
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(
                                              LucideIcons.indianRupee,
                                              size: 15,
                                              color: AppColors.onPrimary,
                                            ),
                                            const SizedBox(width: Gap.xs),
                                            Text(
                                              'Collect ${Money.inr(dueAmt)}',
                                              style: AppText.label.copyWith(
                                                color: AppColors.onPrimary,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
                error: (err, stack) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(Gap.xl),
                    child: Text(
                      'Could not load sales. Check your internet and try again.',
                      textAlign: TextAlign.center,
                      style: AppText.body.copyWith(color: AppColors.error),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

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
    try {
      final d = DateTime.parse(dateStr);
      return '${d.day} ${_months[d.month - 1]} ${d.year}';
    } catch (_) {
      return dateStr;
    }
  }
}
