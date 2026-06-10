import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/reports/data/report_params.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_kpi_tile.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';

// ---------------------------------------------------------------------------
// Month names helper
// ---------------------------------------------------------------------------
const _kMonthNames = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const _kMonthNamesShort = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ---------------------------------------------------------------------------
// Gstr1Screen
// ---------------------------------------------------------------------------
class Gstr1Screen extends ConsumerStatefulWidget {
  const Gstr1Screen({super.key});

  @override
  ConsumerState<Gstr1Screen> createState() => _Gstr1ScreenState();
}

class _Gstr1ScreenState extends ConsumerState<Gstr1Screen>
    with SingleTickerProviderStateMixin {
  int _year = DateTime.now().year;
  int _month = DateTime.now().month;

  DateTime get _from => DateTime(_year, _month, 1);
  DateTime get _to   => DateTime(_year, _month + 1, 0);

  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // ---- computations --------------------------------------------------------
  Map<String, dynamic> _compute(List<Map<String, dynamic>> invoices) {
    double totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    int b2bCount = 0, totalCount = 0;
    final b2bRows = <Map<String, dynamic>>[];
    final b2clRows = <Map<String, dynamic>>[];
    final b2csRows = <Map<String, dynamic>>[];

    for (final inv in invoices) {
      final clientGstin = inv['client_gstin'] as String?;
      final isInterstate = (inv['is_interstate'] as bool?) ?? false;
      final taxable = (inv['taxable_amount'] as num?)?.toDouble() ?? 0;
      final cgst    = (inv['cgst_amount']    as num?)?.toDouble() ?? 0;
      final sgst    = (inv['sgst_amount']    as num?)?.toDouble() ?? 0;
      final igst    = (inv['igst_amount']    as num?)?.toDouble() ?? 0;
      final total   = (inv['grand_total']    as num?)?.toDouble() ?? 0;

      totalTaxable += taxable;
      totalCgst    += cgst;
      totalSgst    += sgst;
      totalIgst    += igst;
      totalCount++;

      final hasGstin = clientGstin != null && clientGstin.length >= 15;
      if (hasGstin) {
        b2bCount++;
        b2bRows.add({
          'invoiceNo':   inv['invoice_number'],
          'clientName':  inv['client_name'],
          'gstin':       clientGstin,
          'taxable':     taxable,
          'cgst':        cgst,
          'sgst':        sgst,
          'igst':        igst,
          'total':       total,
          'isInterstate': isInterstate,
        });
      } else if (isInterstate && total >= 250000) {
        b2clRows.add({
          'invoiceNo':  inv['invoice_number'],
          'clientName': inv['client_name'],
          'taxable':    taxable,
          'igst':       igst,
          'total':      total,
        });
      } else {
        b2csRows.add({
          'taxable': taxable,
          'cgst':    cgst,
          'sgst':    sgst,
          'igst':    igst,
        });
      }
    }

    double b2csTaxable = 0, b2csCgst = 0, b2csSgst = 0, b2csIgst = 0;
    for (final r in b2csRows) {
      b2csTaxable += r['taxable'] as double;
      b2csCgst    += r['cgst']    as double;
      b2csSgst    += r['sgst']    as double;
      b2csIgst    += r['igst']    as double;
    }

    return {
      'totalTaxable': totalTaxable,
      'totalCgst':    totalCgst,
      'totalSgst':    totalSgst,
      'totalIgst':    totalIgst,
      'totalCount':   totalCount,
      'b2bCount':     b2bCount,
      'b2bRows':      b2bRows,
      'b2clRows':     b2clRows,
      'b2csTaxable':  b2csTaxable,
      'b2csCgst':     b2csCgst,
      'b2csSgst':     b2csSgst,
      'b2csIgst':     b2csIgst,
    };
  }

  // ---- selectors -----------------------------------------------------------
  Widget _buildMonthYearSelector() {
    final currentYear = DateTime.now().year;
    final years = List.generate(5, (i) => currentYear - i);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Month
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.primaryContainer.withValues(alpha: 0.20),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.primaryContainer),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<int>(
              value: _month,
              isDense: true,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
              dropdownColor: AppColors.surface,
              items: List.generate(12, (i) => i + 1)
                  .map((m) => DropdownMenuItem(
                        value: m,
                        child: Text(_kMonthNamesShort[m]),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _month = v!),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Year
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.primaryContainer.withValues(alpha: 0.20),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.primaryContainer),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<int>(
              value: _year,
              isDense: true,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
              dropdownColor: AppColors.surface,
              items: years
                  .map((y) => DropdownMenuItem(
                        value: y,
                        child: Text('$y'),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _year = v!),
            ),
          ),
        ),
      ],
    );
  }

  // ---- tab content ---------------------------------------------------------
  Widget _buildB2BTab(List<Map<String, dynamic>> rows) {
    if (rows.isEmpty) return _emptyState('No B2B invoices for this period.');
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: rows.length,
      itemBuilder: (context, i) => _B2BCard(row: rows[i]),
    );
  }

  Widget _buildB2CLTab(List<Map<String, dynamic>> rows) {
    if (rows.isEmpty) {
      return _emptyState(
          'No B2CL invoices (interstate, unregistered ≥ ₹2.5L) for this period.');
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: rows.length,
      itemBuilder: (context, i) => _B2CLCard(row: rows[i]),
    );
  }

  Widget _buildB2CSTab(Map<String, dynamic> data) {
    final taxable = data['b2csTaxable'] as double;
    if (taxable == 0 &&
        (data['b2csCgst'] as double) == 0 &&
        (data['b2csSgst'] as double) == 0 &&
        (data['b2csIgst'] as double) == 0) {
      return _emptyState('No B2CS invoices for this period.');
    }
    return Padding(
      padding: const EdgeInsets.all(16),
      child: _SectionCard(
        title: 'B2CS Aggregate',
        subtitle: 'Small/unregistered buyers — intra-state & inter-state < ₹2.5L',
        rows: [
          _AmountRow(label: 'Taxable Value', amount: taxable),
          _AmountRow(label: 'CGST', amount: data['b2csCgst'] as double),
          _AmountRow(label: 'SGST / UTGST', amount: data['b2csSgst'] as double),
          _AmountRow(label: 'IGST', amount: data['b2csIgst'] as double),
        ],
      ),
    );
  }

  Widget _emptyState(String message) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(LucideIcons.fileX2,
              size: 48, color: AppColors.inkTertiary.withValues(alpha: 0.5)),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              fontSize: 13,
              color: AppColors.inkSecondary,
            ),
          ),
        ],
      ),
    );
  }

  // ---- build ---------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return tenantAsync.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) =>
          Scaffold(body: Center(child: Text('Error: $e'))),
      data: (ctx) {
        if (ctx == null) {
          return const Scaffold(
              body: Center(child: Text('No tenant context.')));
        }
        final params = ReportParams(
          tenantId: ctx.tenantId,
          from: _from,
          to: _to,
        );

        final invoicesAsync = ref.watch(reportInvoicesProvider(params));
        final salesAsync    = ref.watch(reportSalesProvider(params));

        final isLoading =
            invoicesAsync.isLoading || salesAsync.isLoading;
        final hasError =
            invoicesAsync.hasError || salesAsync.hasError;

        final invoices =
            invoicesAsync.asData?.value ?? const <Map<String, dynamic>>[];
        final computed = _compute(invoices);

        final totalTaxable = computed['totalTaxable'] as double;
        final totalTax = (computed['totalCgst'] as double) +
            (computed['totalSgst'] as double) +
            (computed['totalIgst'] as double);
        final totalCount = computed['totalCount'] as int;
        final b2bCount   = computed['b2bCount']   as int;

        return Scaffold(
          backgroundColor: AppColors.canvas,
          appBar: AppBar(
            backgroundColor: AppColors.surface,
            elevation: 0,
            title: Text(
              'GSTR-1',
              style: GoogleFonts.manrope(
                fontWeight: FontWeight.w800,
                fontSize: 20,
                color: AppColors.inkPrimary,
              ),
            ),
            actions: [
              _buildMonthYearSelector(),
              const SizedBox(width: 16),
            ],
            bottom: TabBar(
              controller: _tabController,
              labelStyle: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
              ),
              labelColor: AppColors.primary,
              unselectedLabelColor: AppColors.inkSecondary,
              indicatorColor: AppColors.primary,
              indicatorWeight: 2.5,
              tabs: const [
                Tab(text: 'B2B'),
                Tab(text: 'B2CL'),
                Tab(text: 'B2CS'),
              ],
            ),
          ),
          floatingActionButton: FloatingActionButton(
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.onPrimary,
            tooltip: 'Export JSON',
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'JSON export coming in next update. Use web dashboard for now.',
                  ),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
            child: const Icon(LucideIcons.download),
          ),
          body: Column(
            children: [
              // Period chip
              Container(
                color: AppColors.surface,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    const Icon(LucideIcons.calendarRange,
                        size: 14, color: AppColors.inkSecondary),
                    const SizedBox(width: 6),
                    Text(
                      'Filing Period: ${_kMonthNames[_month]} $_year',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.inkSecondary,
                        letterSpacing: 0.4,
                      ),
                    ),
                    if (isLoading) ...[
                      const Spacer(),
                      const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ],
                    if (hasError) ...[
                      const Spacer(),
                      const Icon(LucideIcons.alertCircle,
                          size: 14, color: AppColors.danger),
                    ],
                  ],
                ),
              ),
              const Divider(height: 1),

              // KPI row
              Padding(
                padding: const EdgeInsets.all(16),
                child: GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.6,
                  children: [
                    ReportKpiTile(
                      label: 'Total Taxable Turnover',
                      value: formatINR(totalTaxable),
                      color: const Color(0xFF16A34A),
                      icon: LucideIcons.trendingUp,
                    ),
                    ReportKpiTile(
                      label: 'Total Tax Liability',
                      value: formatINR(totalTax),
                      color: const Color(0xFF2563EB),
                      icon: LucideIcons.receipt,
                    ),
                    ReportKpiTile(
                      label: 'Total Invoices',
                      value: '$totalCount',
                      color: const Color(0xFF7C3AED),
                      icon: LucideIcons.fileText,
                    ),
                    ReportKpiTile(
                      label: 'B2B Invoices',
                      value: '$b2bCount',
                      color: const Color(0xFF0D9488),
                      icon: LucideIcons.building2,
                    ),
                  ],
                ),
              ),

              // Tabs
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildB2BTab(
                        computed['b2bRows'] as List<Map<String, dynamic>>),
                    _buildB2CLTab(
                        computed['b2clRows'] as List<Map<String, dynamic>>),
                    _buildB2CSTab(computed),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// B2B Invoice Card
// ---------------------------------------------------------------------------
class _B2BCard extends StatelessWidget {
  final Map<String, dynamic> row;
  const _B2BCard({required this.row});

  @override
  Widget build(BuildContext context) {
    final isInterstate = row['isInterstate'] as bool? ?? false;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [AppColors.cardShadow],
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Row(
            children: [
              Expanded(
                child: Text(
                  '${row['invoiceNo'] ?? '—'}',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                ),
              ),
              if (isInterstate)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF2563EB).withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'INTERSTATE',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: const Color(0xFF2563EB),
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${row['clientName'] ?? '—'}',
            style: GoogleFonts.manrope(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.inkPrimary),
          ),
          const SizedBox(height: 2),
          Text(
            '${row['gstin'] ?? ''}',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              color: AppColors.inkTertiary,
            ),
          ),
          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 10),
          // Amounts grid
          Row(
            children: [
              _AmtLabel(label: 'Taxable', value: row['taxable'] as double),
              _AmtLabel(label: 'CGST',    value: row['cgst']    as double),
              _AmtLabel(label: 'SGST',    value: row['sgst']    as double),
              _AmtLabel(label: 'IGST',    value: row['igst']    as double),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text('Total  ',
                  style: GoogleFonts.manrope(
                      fontSize: 11, color: AppColors.inkSecondary)),
              Text(
                formatINR(row['total'] as double),
                style: GoogleFonts.manrope(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// B2CL Invoice Card
// ---------------------------------------------------------------------------
class _B2CLCard extends StatelessWidget {
  final Map<String, dynamic> row;
  const _B2CLCard({required this.row});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
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
                  '${row['invoiceNo'] ?? '—'}',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.inkPrimary,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.warning.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'B2CL',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: AppColors.warning,
                    letterSpacing: 0.8,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${row['clientName'] ?? '—'}',
            style: GoogleFonts.manrope(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.inkPrimary),
          ),
          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 10),
          Row(
            children: [
              _AmtLabel(label: 'Taxable', value: row['taxable'] as double),
              _AmtLabel(label: 'IGST',    value: row['igst']    as double),
              const Spacer(),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text('Total  ',
                  style: GoogleFonts.manrope(
                      fontSize: 11, color: AppColors.inkSecondary)),
              Text(
                formatINR(row['total'] as double),
                style: GoogleFonts.manrope(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared helper widgets
// ---------------------------------------------------------------------------
class _AmtLabel extends StatelessWidget {
  final String label;
  final double value;
  const _AmtLabel({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.inkTertiary,
                letterSpacing: 0.6),
          ),
          const SizedBox(height: 2),
          Text(
            formatINR(value),
            style: GoogleFonts.manrope(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.inkPrimary),
          ),
        ],
      ),
    );
  }
}

class _AmountRow extends StatelessWidget {
  final String label;
  final double amount;
  const _AmountRow({required this.label, required this.amount});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: GoogleFonts.manrope(
                    fontSize: 13, color: AppColors.inkSecondary)),
          ),
          Text(
            formatINR(amount),
            style: GoogleFonts.jetBrainsMono(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.inkPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> rows;

  const _SectionCard({
    required this.title,
    this.subtitle,
    required this.rows,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
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
            title.toUpperCase(),
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.4,
              color: AppColors.inkSecondary,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 3),
            Text(subtitle!,
                style: GoogleFonts.manrope(
                    fontSize: 11, color: AppColors.inkTertiary)),
          ],
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 8),
          ...rows,
        ],
      ),
    );
  }
}
