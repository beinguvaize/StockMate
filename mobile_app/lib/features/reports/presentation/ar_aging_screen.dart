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

class _AgedRow {
  final String id;
  final String clientId;
  final String clientName;
  final String invoiceNo;
  final String bucket;
  final double amount;
  final int daysOverdue;
  final DateTime? dueDate;

  const _AgedRow({
    required this.id,
    required this.clientId,
    required this.clientName,
    required this.invoiceNo,
    required this.amount,
    required this.bucket,
    required this.daysOverdue,
    required this.dueDate,
  });
}

class _ClientAgingRow {
  final String clientId;
  final String clientName;
  final Map<String, double> buckets = {};
  double total = 0;
  final List<_AgedRow> invoices = [];

  _ClientAgingRow(this.clientId, this.clientName);
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

class ArAgingScreen extends ConsumerStatefulWidget {
  const ArAgingScreen({super.key});

  @override
  ConsumerState<ArAgingScreen> createState() => _ArAgingScreenState();
}

class _ArAgingScreenState extends ConsumerState<ArAgingScreen>
    with SingleTickerProviderStateMixin {
  late DateTimeRange _range;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _range = DateTimeRange(
      start: DateTime.now().subtract(const Duration(days: 90)),
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
  // Bottom sheet — invoices for a client
  // -------------------------------------------------------------------------

  void _showClientInvoices(BuildContext context, _ClientAgingRow client) {
    final sorted = [...client.invoices]
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
                      client.clientName,
                      style: GoogleFonts.manrope(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                  ),
                  Text(
                    compactINR(client.total),
                    style: GoogleFonts.manrope(
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
                  '${sorted.length} outstanding invoice${sorted.length == 1 ? '' : 's'}',
                  style: GoogleFonts.manrope(
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
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                itemCount: sorted.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final row = sorted[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                row.invoiceNo.isNotEmpty
                                    ? row.invoiceNo
                                    : row.id,
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.inkPrimary,
                                ),
                              ),
                              const SizedBox(height: 2),
                              if (row.dueDate != null)
                                Text(
                                  'Due ${_fmtDate(row.dueDate!)}',
                                  style: GoogleFonts.manrope(
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
                              style: GoogleFonts.manrope(
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
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
      data: (ctx) {
        if (ctx == null) {
          return const Scaffold(body: Center(child: Text('No tenant context')));
        }
        final tenantId = ctx.tenantId;
        final params = ReportParams(tenantId: tenantId, from: _range.start, to: _range.end);
        // Clients provider doesn't use date — arbitrary dates but same tenantId key
        final clientParams = ReportParams(
          tenantId: tenantId,
          from: DateTime(2020),
          to: DateTime(2099),
        );

        final invoicesAsync = ref.watch(reportInvoicesProvider(params));
        final clientsAsync = ref.watch(reportClientsProvider(clientParams));

        return Scaffold(
          backgroundColor: AppColors.canvas,
          appBar: AppBar(
            backgroundColor: AppColors.surface,
            elevation: 0,
            title: Text(
              'AR Aging',
              style: GoogleFonts.manrope(
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
          body: _buildBody(invoicesAsync, clientsAsync),
        );
      },
    );
  }

  Widget _buildBody(
    AsyncValue<List<Map<String, dynamic>>> invoicesAsync,
    AsyncValue<List<Map<String, dynamic>>> clientsAsync,
  ) {
    // Show loading if either is loading
    if (invoicesAsync.isLoading || clientsAsync.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final invoicesErr = invoicesAsync.error;
    final clientsErr = clientsAsync.error;
    if (invoicesErr != null) {
      return Center(child: Text('Error loading invoices: $invoicesErr'));
    }
    if (clientsErr != null) {
      return Center(child: Text('Error loading clients: $clientsErr'));
    }

    final invoices = invoicesAsync.value ?? [];
    // clients are available for enrichment (currently clientName from invoice)
    // ignore: unused_local_variable
    final clients = clientsAsync.value ?? [];

    // -----------------------------------------------------------------------
    // Compute aging rows
    // -----------------------------------------------------------------------
    final aged = <_AgedRow>[];
    for (final inv in invoices) {
      final status =
          ((inv['payment_status'] ?? inv['status']) as String?)?.toUpperCase() ?? '';
      if (status == 'PAID') continue;
      final amt =
          (inv['grand_total'] ?? inv['total_amount'] ?? inv['amount'] as num?)
              ?.toDouble() ??
              0;
      if (amt <= 0) continue;
      final dueDateStr =
          (inv['due_date'] ?? inv['invoice_date'] ?? inv['date']) as String?;
      final dueDate = dueDateStr != null ? DateTime.tryParse(dueDateStr) : null;
      final daysOverdue = dueDate != null ? daysBetween(dueDate) : 0;
      final bucket = getAgingBucket(daysOverdue);
      aged.add(_AgedRow(
        id: inv['id'] as String? ?? '',
        clientId: inv['client_id'] as String? ?? '',
        clientName: inv['client_name'] as String? ?? 'Unknown',
        invoiceNo: inv['invoice_number'] as String? ?? '',
        amount: amt,
        bucket: bucket,
        daysOverdue: daysOverdue,
        dueDate: dueDate,
      ));
    }

    // Pivot by client
    final Map<String, _ClientAgingRow> byClientMap = {};
    for (final r in aged) {
      final c = byClientMap.putIfAbsent(
          r.clientId, () => _ClientAgingRow(r.clientId, r.clientName));
      c.buckets[r.bucket] = (c.buckets[r.bucket] ?? 0) + r.amount;
      c.total += r.amount;
      c.invoices.add(r);
    }
    final clientRows = byClientMap.values.toList()
      ..sort((a, b) => b.total.compareTo(a.total));

    // KPI aggregates
    final totalReceivables = aged.fold(0.0, (s, r) => s + r.amount);
    final pastDue = aged
        .where((r) => r.bucket != 'CURRENT')
        .fold(0.0, (s, r) => s + r.amount);
    final severelyOverdue = aged
        .where((r) => ['91-120', '120+'].contains(r.bucket))
        .fold(0.0, (s, r) => s + r.amount);
    final overdueRate =
        totalReceivables > 0 ? pastDue / totalReceivables * 100 : 0.0;

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
                      label: 'Total Receivables',
                      value: compactINR(totalReceivables),
                      subtitle: formatINR(totalReceivables),
                      color: const Color(0xFF1D4ED8),
                      icon: LucideIcons.wallet,
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
                      subtitle: 'of total receivables',
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
                    labelStyle: GoogleFonts.manrope(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                    unselectedLabelStyle: GoogleFonts.manrope(
                      fontSize: 13,
                      fontWeight: FontWeight.w400,
                    ),
                    labelColor: AppColors.primary,
                    unselectedLabelColor: AppColors.inkSecondary,
                    indicatorColor: AppColors.primary,
                    indicatorSize: TabBarIndicatorSize.tab,
                    tabs: const [
                      Tab(text: 'By Client'),
                      Tab(text: 'By Invoice'),
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
            _buildByClientTab(clientRows),
            _buildByInvoiceTab(aged),
          ],
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // By Client tab
  // -------------------------------------------------------------------------

  Widget _buildByClientTab(List<_ClientAgingRow> rows) {
    if (rows.isEmpty) {
      return const Center(child: Text('No client data'));
    }
    return ListView.separated(
      padding: const EdgeInsets.only(top: 4, bottom: 24),
      itemCount: rows.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final client = rows[i];
        final nonZeroBuckets = agingBuckets
            .where((b) => (client.buckets[b] ?? 0) > 0)
            .toList();
        return GestureDetector(
          onTap: () => _showClientInvoices(context, client),
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
                        client.clientName,
                        style: GoogleFonts.manrope(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                        ),
                      ),
                    ),
                    Text(
                      compactINR(client.total),
                      style: GoogleFonts.manrope(
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
                        .map((b) => _bucketPill(b,
                            amount: client.buckets[b]))
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
  // By Invoice tab
  // -------------------------------------------------------------------------

  Widget _buildByInvoiceTab(List<_AgedRow> rows) {
    final sorted = [...rows]
      ..sort((a, b) => b.daysOverdue.compareTo(a.daysOverdue));

    if (sorted.isEmpty) {
      return const Center(child: Text('No invoice data'));
    }

    return ListView.separated(
      padding: const EdgeInsets.only(top: 4, bottom: 24),
      itemCount: sorted.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final row = sorted[i];
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                      row.invoiceNo.isNotEmpty ? row.invoiceNo : row.id,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.inkPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      row.clientName,
                      style: GoogleFonts.manrope(
                        fontSize: 12,
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
                    style: GoogleFonts.manrope(
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
              'All accounts current',
              style: GoogleFonts.manrope(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'No outstanding receivables',
              textAlign: TextAlign.center,
              style: GoogleFonts.manrope(
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
