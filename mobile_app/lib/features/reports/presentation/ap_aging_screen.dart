import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/reports/data/report_params.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/date_range_chip.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_kpi_tile.dart';
import 'package:mobile_app/features/reports/presentation/widgets/simple_bar_chart.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';

// ---------------------------------------------------------------------------
// Private data classes
// ---------------------------------------------------------------------------

class _ApRow {
  final String id;
  final String supplierId;
  final String supplierName;
  final String bucket;
  final double amount;
  final int daysOverdue;
  final DateTime? billDate;

  const _ApRow({
    required this.id,
    required this.supplierId,
    required this.supplierName,
    required this.amount,
    required this.bucket,
    required this.daysOverdue,
    required this.billDate,
  });
}

class _SupplierAgingRow {
  final String supplierId;
  final String supplierName;
  final Map<String, double> buckets = {};
  double total = 0;
  final List<_ApRow> bills = [];

  _SupplierAgingRow(this.supplierId, this.supplierName);
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

class ApAgingScreen extends ConsumerStatefulWidget {
  const ApAgingScreen({super.key});

  @override
  ConsumerState<ApAgingScreen> createState() => _ApAgingScreenState();
}

class _ApAgingScreenState extends ConsumerState<ApAgingScreen>
    with SingleTickerProviderStateMixin {
  late DateTimeRange _range;
  late TabController _tabController;

  static const _defaultTermsDays = 30;
  static const _creditMethods = {'CREDIT', 'ON_CREDIT', 'UNPAID', 'DUE'};

  @override
  void initState() {
    super.initState();
    _range = DateTimeRange(
      start: DateTime.now().subtract(const Duration(days: 180)),
      end: DateTime.now(),
    );
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  Widget _bucketPill(String bucket, {double? amount}) {
    final color = agingBucketColor(bucket);
    final label = amount != null ? '$bucket ${compactINR(amount)}' : bucket;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: GoogleFonts.jetBrainsMono(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Bottom sheet — bills for a supplier
  // -------------------------------------------------------------------------

  void _showSupplierBills(BuildContext context, _SupplierAgingRow supplier) {
    final sorted = [...supplier.bills]
      ..sort((a, b) => b.daysOverdue.compareTo(a.daysOverdue));

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
                      supplier.supplierName,
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                  ),
                  Text(
                    compactINR(supplier.total),
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.danger,
                    ),
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
                  '${sorted.length} outstanding bill${sorted.length == 1 ? '' : 's'}',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: AppColors.inkSecondary,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Divider(height: 1),
            Expanded(
              child: ListView.separated(
                controller: scrollCtrl,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                itemCount: sorted.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final row = sorted[i];
                  final impliedDue = row.billDate != null
                      ? row.billDate!
                          .add(Duration(days: _defaultTermsDays))
                      : null;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                row.id,
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.inkPrimary,
                                ),
                              ),
                              const SizedBox(height: 2),
                              if (row.billDate != null)
                                Text(
                                  'Bill: ${_fmtDate(row.billDate!)}',
                                  style: GoogleFonts.inter(
                                    fontSize: 11,
                                    color: AppColors.inkSecondary,
                                  ),
                                ),
                              if (impliedDue != null)
                                Text(
                                  'Due: ${_fmtDate(impliedDue)}',
                                  style: GoogleFonts.inter(
                                    fontSize: 11,
                                    color: AppColors.inkSecondary,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              compactINR(row.amount),
                              style: GoogleFonts.hankenGrotesk(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.danger,
                              ),
                            ),
                            const SizedBox(height: 4),
                            _bucketPill(row.bucket),
                          ],
                        ),
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

  String _fmtDate(DateTime d) {
    const months = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${d.day.toString().padLeft(2, '0')} ${months[d.month]} ${d.year}';
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return tenantAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
      data: (ctx) {
        if (ctx == null) {
          return const Scaffold(
              body: Center(child: Text('No tenant context')));
        }
        final tenantId = ctx.tenantId;
        final params = ReportParams(
            tenantId: tenantId, from: _range.start, to: _range.end);
        final supplierParams = ReportParams(
          tenantId: tenantId,
          from: DateTime(2020),
          to: DateTime(2099),
        );

        final purchasesAsync = ref.watch(reportPurchasesProvider(params));
        final suppliersAsync =
            ref.watch(reportSuppliersProvider(supplierParams));

        return Scaffold(
          backgroundColor: AppColors.canvas,
          appBar: AppBar(
            backgroundColor: AppColors.surface,
            elevation: 0,
            title: Text(
              'AP Aging',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary,
              ),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 16),
                child: DateRangeChip(
                  range: _range,
                  onChanged: (r) => setState(() => _range = r),
                ),
              ),
            ],
          ),
          body: _buildBody(purchasesAsync, suppliersAsync),
        );
      },
    );
  }

  Widget _buildBody(
    AsyncValue<List<Map<String, dynamic>>> purchasesAsync,
    AsyncValue<List<Map<String, dynamic>>> suppliersAsync,
  ) {
    if (purchasesAsync.isLoading || suppliersAsync.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final purchasesErr = purchasesAsync.error;
    final suppliersErr = suppliersAsync.error;
    if (purchasesErr != null) {
      return Center(child: Text('Error loading purchases: $purchasesErr'));
    }
    if (suppliersErr != null) {
      return Center(child: Text('Error loading suppliers: $suppliersErr'));
    }

    final purchases = purchasesAsync.value ?? [];
    // ignore: unused_local_variable
    final suppliers = suppliersAsync.value ?? [];

    // -----------------------------------------------------------------------
    // Compute aging rows
    // -----------------------------------------------------------------------
    final aged = <_ApRow>[];
    for (final p in purchases) {
      final method =
          (p['payment_type'] as String?)?.toUpperCase() ?? '';
      if (!_creditMethods.contains(method)) continue;
      final amt = (p['total_amount'] as num?)?.toDouble() ?? 0;
      if (amt <= 0) continue;
      final dateStr = p['date'] as String?;
      final billDate =
          dateStr != null ? DateTime.tryParse(dateStr) : DateTime.now();
      final impliedDue = (billDate ?? DateTime.now())
          .add(const Duration(days: _defaultTermsDays));
      final daysOverdue = daysBetween(impliedDue);
      final bucket = getAgingBucket(daysOverdue);
      aged.add(_ApRow(
        id: p['id'] as String? ?? '',
        supplierId: p['supplier_id'] as String? ?? '',
        supplierName: p['supplier_name'] as String? ?? 'Unknown',
        amount: amt,
        bucket: bucket,
        daysOverdue: daysOverdue,
        billDate: billDate,
      ));
    }

    // Pivot by supplier
    final Map<String, _SupplierAgingRow> bySupplierMap = {};
    for (final r in aged) {
      final s = bySupplierMap.putIfAbsent(
          r.supplierId, () => _SupplierAgingRow(r.supplierId, r.supplierName));
      s.buckets[r.bucket] = (s.buckets[r.bucket] ?? 0) + r.amount;
      s.total += r.amount;
      s.bills.add(r);
    }
    final supplierRows = bySupplierMap.values.toList()
      ..sort((a, b) => b.total.compareTo(a.total));

    // KPI aggregates
    final totalPayables = aged.fold(0.0, (s, r) => s + r.amount);
    final pastDue = aged
        .where((r) => r.bucket != 'CURRENT')
        .fold(0.0, (s, r) => s + r.amount);
    final severelyOverdue = aged
        .where((r) => ['91-120', '120+'].contains(r.bucket))
        .fold(0.0, (s, r) => s + r.amount);
    final overdueRate =
        totalPayables > 0 ? pastDue / totalPayables * 100 : 0.0;

    // Bucket totals for bar chart
    final bucketTotals = {
      for (final b in agingBuckets)
        b: aged.where((r) => r.bucket == b).fold(0.0, (s, r) => s + r.amount),
    };

    // Empty state
    if (aged.isEmpty) {
      return _buildEmpty();
    }

    return NestedScrollView(
      headerSliverBuilder: (context, _) => [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // KPI grid
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.55,
                  children: [
                    ReportKpiTile(
                      label: 'Total Payables',
                      value: compactINR(totalPayables),
                      subtitle: formatINR(totalPayables),
                      color: const Color(0xFF1D4ED8),
                      icon: LucideIcons.creditCard,
                    ),
                    ReportKpiTile(
                      label: 'Past Due',
                      value: compactINR(pastDue),
                      subtitle: formatINR(pastDue),
                      color: const Color(0xFFEA580C),
                      icon: LucideIcons.alertTriangle,
                    ),
                    ReportKpiTile(
                      label: 'Severely Overdue >90d',
                      value: compactINR(severelyOverdue),
                      subtitle: formatINR(severelyOverdue),
                      color: AppColors.danger,
                      icon: LucideIcons.alertOctagon,
                    ),
                    ReportKpiTile(
                      label: 'Overdue Rate',
                      value: '${overdueRate.toStringAsFixed(1)}%',
                      subtitle: 'of total payables',
                      color: const Color(0xFF7C3AED),
                      icon: LucideIcons.percent,
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                // Bar chart card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [AppColors.cardShadow],
                    border: Border.all(
                        color: Colors.black.withValues(alpha: 0.06)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'AGING BREAKDOWN',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1.2,
                          color: AppColors.inkSecondary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      SimpleBarChart(
                        height: 140,
                        bars: agingBuckets
                            .map((b) => BarData(
                                  label: b,
                                  value: bucketTotals[b] ?? 0,
                                  color: agingBucketColor(b),
                                ))
                            .toList(),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                // Info banner
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color:
                        AppColors.primaryContainer.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: AppColors.primaryContainer
                            .withValues(alpha: 0.5)),
                  ),
                  child: Row(
                    children: [
                      Icon(LucideIcons.info,
                          size: 14, color: AppColors.inkSecondary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Aging based on bill date + 30-day payment terms',
                          style: GoogleFonts.inter(
                            fontSize: 11,
                            color: AppColors.inkSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                // Tab bar
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(16)),
                    boxShadow: [AppColors.cardShadow],
                  ),
                  child: TabBar(
                    controller: _tabController,
                    labelStyle: GoogleFonts.hankenGrotesk(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                    unselectedLabelStyle: GoogleFonts.hankenGrotesk(
                      fontSize: 13,
                      fontWeight: FontWeight.w400,
                    ),
                    labelColor: AppColors.primary,
                    unselectedLabelColor: AppColors.inkSecondary,
                    indicatorColor: AppColors.primary,
                    indicatorSize: TabBarIndicatorSize.tab,
                    tabs: const [
                      Tab(text: 'By Supplier'),
                      Tab(text: 'By Bill'),
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
            _buildBySupplierTab(supplierRows),
            _buildByBillTab(aged),
          ],
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // By Supplier tab
  // -------------------------------------------------------------------------

  Widget _buildBySupplierTab(List<_SupplierAgingRow> rows) {
    if (rows.isEmpty) {
      return const Center(child: Text('No supplier data'));
    }
    return ListView.separated(
      padding: const EdgeInsets.only(top: 4, bottom: 24),
      itemCount: rows.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final supplier = rows[i];
        final nonZeroBuckets = agingBuckets
            .where((b) => (supplier.buckets[b] ?? 0) > 0)
            .toList();
        return GestureDetector(
          onTap: () => _showSupplierBills(context, supplier),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [AppColors.cardShadow],
              border:
                  Border.all(color: Colors.black.withValues(alpha: 0.06)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        supplier.supplierName,
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                    ),
                    Text(
                      compactINR(supplier.total),
                      style: GoogleFonts.hankenGrotesk(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.danger,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(LucideIcons.chevronRight,
                        size: 14, color: AppColors.inkSecondary),
                  ],
                ),
                if (nonZeroBuckets.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: nonZeroBuckets
                        .map((b) =>
                            _bucketPill(b, amount: supplier.buckets[b]))
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  // -------------------------------------------------------------------------
  // By Bill tab
  // -------------------------------------------------------------------------

  Widget _buildByBillTab(List<_ApRow> rows) {
    final sorted = [...rows]
      ..sort((a, b) => b.daysOverdue.compareTo(a.daysOverdue));

    if (sorted.isEmpty) {
      return const Center(child: Text('No bill data'));
    }

    return ListView.separated(
      padding: const EdgeInsets.only(top: 4, bottom: 24),
      itemCount: sorted.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final row = sorted[i];
        return Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [AppColors.cardShadow],
            border:
                Border.all(color: Colors.black.withValues(alpha: 0.06)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.id,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      row.supplierName,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: AppColors.inkSecondary,
                      ),
                    ),
                    if (row.billDate != null) ...[
                      const SizedBox(height: 1),
                      Text(
                        'Bill: ${_fmtDate(row.billDate!)}',
                        style: GoogleFonts.inter(
                          fontSize: 10,
                          color: AppColors.inkTertiary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    compactINR(row.amount),
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.danger,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (row.daysOverdue > 0) ...[
                        Text(
                          '${row.daysOverdue}d',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            color: AppColors.inkSecondary,
                          ),
                        ),
                        const SizedBox(width: 6),
                      ],
                      _bucketPill(row.bucket),
                    ],
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  Widget _buildEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              LucideIcons.checkCircle2,
              size: 56,
              color: const Color(0xFF16A34A),
            ),
            const SizedBox(height: 16),
            Text(
              'No outstanding payables',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'All bills are settled or on cash terms',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.inkSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
