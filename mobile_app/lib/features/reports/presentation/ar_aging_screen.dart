import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/clients_suppliers/data/receivable_aging.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/receivable_aging_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/aging_widgets.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_kpi_tile.dart';
import 'package:mobile_app/features/reports/presentation/widgets/simple_bar_chart.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/core/theme/typography.dart';

// ---------------------------------------------------------------------------
// Money to Collect: what customers owe, by how long it has been unpaid.
//
// Reads get_unpaid_sales through receivableAgingProvider, the same as the web's
// Customer Aging report. It used to read invoices, and most sales never get an
// invoice row. There is no date range: what is owed is a figure for today.
// ---------------------------------------------------------------------------

class ArAgingScreen extends ConsumerStatefulWidget {
  const ArAgingScreen({super.key});

  @override
  ConsumerState<ArAgingScreen> createState() => _ArAgingScreenState();
}

class _ArAgingScreenState extends ConsumerState<ArAgingScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        title: Text(
          'Money to Collect',
          style: GoogleFonts.manrope(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(LucideIcons.refreshCw, size: 18),
            onPressed: () => ref.invalidate(receivableAgingProvider),
          ),
        ],
      ),
      body: AgingLoader(builder: (data) => _buildBody(data.aging)),
    );
  }

  // Height follows the text, so a long label or a large system font wraps
  // instead of overflowing a fixed-ratio cell.
  Widget _kpiPair(Widget a, Widget b) => IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [Expanded(child: a), const SizedBox(width: 12), Expanded(child: b)],
        ),
      );

  Widget _buildBody(ReceivableAging a) {
    if (a.bills.isEmpty) return AgingNothingUnpaid(a);
    final share = a.total > 0 ? a.over30 / a.total * 100 : 0.0;

    return NestedScrollView(
      headerSliverBuilder: (context, _) => [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AgingTieOut(a),
                const SizedBox(height: 14),
                _kpiPair(
                  ReportKpiTile(
                    label: 'Customers owe',
                    value: compactINR(a.total),
                    subtitle: formatINR(a.total),
                    color: const Color(0xFF1D4ED8),
                  ),
                  ReportKpiTile(
                    label: 'Unpaid over 30 days',
                    value: compactINR(a.over30),
                    subtitle: formatINR(a.over30),
                    color: const Color(0xFFEA580C),
                  ),
                ),
                const SizedBox(height: 12),
                _kpiPair(
                  ReportKpiTile(
                    label: 'Unpaid over 90 days',
                    value: compactINR(a.over90),
                    subtitle: formatINR(a.over90),
                    color: const Color(0xFFB45309),
                  ),
                  ReportKpiTile(
                    label: 'Share over 30 days',
                    value: '${share.toStringAsFixed(1)}%',
                    subtitle: 'of what customers owe',
                    color: const Color(0xFF7C3AED),
                  ),
                ),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [AppColors.cardShadow],
                    border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'WHAT CUSTOMERS OWE, BY AGE',
                        style: AppText.label.copyWith(letterSpacing: 1.2,
                          color: AppColors.inkSecondary),
                      ),
                      const SizedBox(height: 12),
                      SimpleBarChart(
                        height: 140,
                        labelWidth: 52,
                        bars: ageBuckets
                            .map((b) => BarData(
                                  label: b,
                                  value: a.totals[b] ?? 0,
                                  color: ageBucketColor(b),
                                ))
                            .toList(),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                    boxShadow: [AppColors.cardShadow],
                  ),
                  child: TabBar(
                    controller: _tabController,
                    labelStyle: AppText.label,
                    unselectedLabelStyle: AppText.caption,
                    labelColor: AppColors.primary,
                    unselectedLabelColor: AppColors.inkSecondary,
                    indicatorColor: AppColors.primary,
                    indicatorSize: TabBarIndicatorSize.tab,
                    tabs: const [
                      Tab(text: 'By customer'),
                      Tab(text: 'By bill'),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: TabBarView(
          controller: _tabController,
          children: [
            _buildByCustomerTab(a.customers),
            ListView.separated(
              padding: const EdgeInsets.only(top: 4, bottom: 24),
              itemCount: a.bills.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _BillCard(bill: a.bills[i], showCustomer: true),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildByCustomerTab(List<AgedCustomer> rows) {
    return ListView.separated(
      padding: const EdgeInsets.only(top: 4, bottom: 24),
      itemCount: rows.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final c = rows[i];
        return AppTappable(
          ripple: false,
          onTap: () => _showBills(context, c),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [AppColors.cardShadow],
              border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        c.clientName,
                        style: GoogleFonts.manrope(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                    ),
                    Text(
                      compactINR(c.total),
                      style: AppText.bodyStrong.copyWith(fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary),
                    ),
                    const SizedBox(width: 6),
                    Icon(LucideIcons.chevronRight, size: 14, color: AppColors.inkSecondary),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${c.bills} bill${c.bills == 1 ? '' : 's'} · oldest ${c.oldest} days',
                  style: AppText.caption.copyWith(color: AppColors.inkSecondary),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final b in ageBuckets)
                      if ((c.buckets[b] ?? 0) > 0) AgingBucketPill(b, amount: c.buckets[b]),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showBills(BuildContext context, AgedCustomer c) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.55,
        maxChildSize: 0.9,
        minChildSize: 0.3,
        builder: (_, scrollCtrl) => Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      c.clientName,
                      style: GoogleFonts.manrope(fontSize: 18, fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary),
                    ),
                  ),
                  Text(
                    compactINR(c.total),
                    style: GoogleFonts.manrope(fontSize: 18, fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '${c.bills} unpaid bill${c.bills == 1 ? '' : 's'}',
                  style: AppText.caption.copyWith(color: AppColors.inkSecondary),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Divider(height: 1),
            Expanded(
              child: ListView.separated(
                controller: scrollCtrl,
                padding: const EdgeInsets.all(16),
                itemCount: c.billRows.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _BillCard(bill: c.billRows[i], showCustomer: false),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BillCard extends StatelessWidget {
  final AgedBill bill;
  final bool showCustomer;
  const _BillCard({required this.bill, required this.showCustomer});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [AppColors.cardShadow],
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  showCustomer ? bill.clientName : bill.saleId,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.label.copyWith(color: AppColors.inkPrimary),
                ),
                const SizedBox(height: 2),
                Text(
                  'Sale ${agingBillDate(bill.saleDate)} · unpaid for ${bill.days} days',
                  style: AppText.caption.copyWith(color: AppColors.inkSecondary),
                ),
                if (bill.paid > 0)
                  Text(
                    'Bill ${formatINR(bill.total)}, paid ${formatINR(bill.paid)}',
                    style: AppText.caption.copyWith(color: AppColors.inkTertiary),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                compactINR(bill.unpaid),
                style: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary),
              ),
              const SizedBox(height: 4),
              AgingBucketPill(bill.bucket),
            ],
          ),
        ],
      ),
    );
  }
}
