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

const _kMonthNames = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const _kMonthShort = [
  '',
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

class Gstr3bScreen extends ConsumerStatefulWidget {
  const Gstr3bScreen({super.key});

  @override
  ConsumerState<Gstr3bScreen> createState() => _Gstr3bScreenState();
}

class _Gstr3bScreenState extends ConsumerState<Gstr3bScreen> {
  late int _year;
  late int _month;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year = now.year;
    _month = now.month;
  }

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return tenantAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        body: Center(child: Text('Error: $e')),
      ),
      data: (ctx) {
        if (ctx == null) {
          return const Scaffold(
            body: Center(child: Text('No tenant context')),
          );
        }
        final from = DateTime(_year, _month, 1);
        final to = DateTime(_year, _month + 1, 0);
        final params = ReportParams(
          tenantId: ctx.tenantId,
          from: from,
          to: to,
        );
        return _Gstr3bView(
          params: params,
          year: _year,
          month: _month,
          onYearChanged: (y) => setState(() => _year = y),
          onMonthChanged: (m) => setState(() => _month = m),
        );
      },
    );
  }
}

class _Gstr3bView extends ConsumerWidget {
  final ReportParams params;
  final int year;
  final int month;
  final ValueChanged<int> onYearChanged;
  final ValueChanged<int> onMonthChanged;

  const _Gstr3bView({
    required this.params,
    required this.year,
    required this.month,
    required this.onYearChanged,
    required this.onMonthChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invoicesAsync = ref.watch(reportInvoicesProvider(params));
    final purchasesAsync = ref.watch(reportPurchasesProvider(params));
    final expensesAsync = ref.watch(reportExpensesProvider(params));

    final now = DateTime.now();
    final yearRange = List.generate(3, (i) => now.year - 2 + i);

    // Show loading if any provider is loading
    if (invoicesAsync.isLoading ||
        purchasesAsync.isLoading ||
        expensesAsync.isLoading) {
      return Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: _buildAppBar(context, yearRange, now),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    // Show error if any provider errored
    final invoicesError = invoicesAsync.error;
    final purchasesError = purchasesAsync.error;
    final expensesError = expensesAsync.error;
    if (invoicesError != null || purchasesError != null || expensesError != null) {
      return Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: _buildAppBar(context, yearRange, now),
        body: Center(
          child: Text(
            'Failed to load data\n${invoicesError ?? purchasesError ?? expensesError}',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(color: AppColors.danger, fontSize: 13),
          ),
        ),
      );
    }

    final invoices = invoicesAsync.value ?? [];
    final purchases = purchasesAsync.value ?? [];

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: _buildAppBar(context, yearRange, now),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Export coming soon. Use web dashboard for now.'),
            ),
          );
        },
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        child: const Icon(LucideIcons.download),
      ),
      body: _Gstr3bBody(
        invoices: invoices,
        purchases: purchases,
        year: year,
        month: month,
      ),
    );
  }

  AppBar _buildAppBar(
      BuildContext context, List<int> yearRange, DateTime now) {
    return AppBar(
      backgroundColor: AppColors.surface,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      titleSpacing: 16,
      title: Text(
        'GSTR-3B',
        style: GoogleFonts.hankenGrotesk(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.inkPrimary,
        ),
      ),
      actions: [
        DropdownButton<int>(
          value: month,
          underline: const SizedBox.shrink(),
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.inkPrimary,
          ),
          items: List.generate(12, (i) {
            final m = i + 1;
            return DropdownMenuItem(
              value: m,
              child: Text(_kMonthShort[m]),
            );
          }),
          onChanged: (m) {
            if (m != null) onMonthChanged(m);
          },
        ),
        const SizedBox(width: 4),
        DropdownButton<int>(
          value: year,
          underline: const SizedBox.shrink(),
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.inkPrimary,
          ),
          items: yearRange
              .map((y) => DropdownMenuItem(value: y, child: Text('$y')))
              .toList(),
          onChanged: (y) {
            if (y != null) onYearChanged(y);
          },
        ),
        const SizedBox(width: 12),
      ],
    );
  }
}

class _Gstr3bBody extends StatelessWidget {
  final List<Map<String, dynamic>> invoices;
  final List<Map<String, dynamic>> purchases;
  final int year;
  final int month;

  const _Gstr3bBody({
    required this.invoices,
    required this.purchases,
    required this.year,
    required this.month,
  });

  @override
  Widget build(BuildContext context) {
    // ── Section 3.1 — Outward supplies ─────────────────────────────────────────
    double outwardTaxable = 0,
        outwardCgst = 0,
        outwardSgst = 0,
        outwardIgst = 0;
    for (final inv in invoices) {
      outwardTaxable += (inv['taxable_amount'] as num?)?.toDouble() ?? 0;
      outwardCgst += (inv['cgst_amount'] as num?)?.toDouble() ?? 0;
      outwardSgst += (inv['sgst_amount'] as num?)?.toDouble() ?? 0;
      outwardIgst += (inv['igst_amount'] as num?)?.toDouble() ?? 0;
    }
    final grossTax = outwardCgst + outwardSgst + outwardIgst;

    // ── Section 3.2 — Inter-state ───────────────────────────────────────────────
    final interStateInvoices = invoices
        .where((inv) => (inv['is_interstate'] as bool?) == true)
        .toList();
    final interStateTaxable = interStateInvoices.fold(
        0.0,
        (s, inv) =>
            s + ((inv['taxable_amount'] as num?)?.toDouble() ?? 0));
    final interStateIgst = interStateInvoices.fold(
        0.0,
        (s, inv) =>
            s + ((inv['igst_amount'] as num?)?.toDouble() ?? 0));

    // ── Section 4 — ITC ─────────────────────────────────────────────────────────
    double itcEstimate = 0;
    for (final p in purchases) {
      final method = ((p['payment_type']) as String?)?.toUpperCase() ?? '';
      if (method == 'CREDIT') continue; // unpaid — no ITC yet
      final amt = (p['total_amount'] as num?)?.toDouble() ?? 0;
      itcEstimate += amt * (18 / 118); // back-calculate 18% GST from total
    }
    final totalITC = itcEstimate;

    // ── Section 6.1 — Net ───────────────────────────────────────────────────────
    final netTaxDue =
        (grossTax - totalITC).clamp(0.0, double.infinity);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
      children: [
        // ── Filing period chip ────────────────────────────────────────────────
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.outlineVariant),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(LucideIcons.calendarDays,
                  size: 14, color: AppColors.inkSecondary),
              const SizedBox(width: 8),
              Text(
                'Filing Period: ${_kMonthNames[month]} $year',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: AppColors.inkSecondary,
                ),
              ),
            ],
          ),
        ),

        // ── 4 KPI tiles (2×2) ────────────────────────────────────────────────
        const SizedBox(height: 20),
        _SectionLabel('Summary'),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 1.4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            ReportKpiTile(
              label: 'Taxable Turnover',
              value: formatINR(outwardTaxable),
              icon: LucideIcons.trendingUp,
              color: const Color(0xFF059669),
            ),
            ReportKpiTile(
              label: 'Gross Tax Outward',
              value: formatINR(grossTax),
              icon: LucideIcons.landmark,
              color: const Color(0xFF2563EB),
            ),
            ReportKpiTile(
              label: 'ITC Available',
              value: formatINR(totalITC),
              icon: LucideIcons.badgePercent,
              color: const Color(0xFF059669),
            ),
            ReportKpiTile(
              label: 'Net Tax Payable',
              value: formatINR(netTaxDue),
              icon: LucideIcons.receipt,
              color: netTaxDue > 0
                  ? const Color(0xFFDC2626)
                  : const Color(0xFF059669),
            ),
          ],
        ),

        // ── Section 3.1 ───────────────────────────────────────────────────────
        const SizedBox(height: 24),
        _SectionCard(
          title: '3.1 Outward Supplies',
          child: Column(
            children: [
              _GstRow(label: 'Taxable Value', value: formatINR(outwardTaxable)),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _GstCell(label: 'CGST', value: formatINR(outwardCgst)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _GstCell(label: 'SGST', value: formatINR(outwardSgst)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _GstCell(label: 'IGST', value: formatINR(outwardIgst)),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _GstRow(
                label: 'Total Tax',
                value: formatINR(grossTax),
                bold: true,
                valueColor: const Color(0xFF2563EB),
              ),
            ],
          ),
        ),

        // ── Section 3.2 ───────────────────────────────────────────────────────
        const SizedBox(height: 12),
        _SectionCard(
          title: '3.2 Inter-State Supplies',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${interStateInvoices.length} inter-state invoice${interStateInvoices.length == 1 ? '' : 's'}',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: AppColors.inkSecondary,
                ),
              ),
              const SizedBox(height: 10),
              _GstRow(label: 'Taxable', value: formatINR(interStateTaxable)),
              const SizedBox(height: 8),
              _GstRow(
                label: 'IGST',
                value: formatINR(interStateIgst),
                bold: true,
                valueColor: const Color(0xFF2563EB),
              ),
            ],
          ),
        ),

        // ── Section 4 ─────────────────────────────────────────────────────────
        const SizedBox(height: 12),
        _SectionCard(
          title: '4. Input Tax Credit (ITC)',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _GstRow(
                label: 'ITC on purchases (estimated)',
                value: formatINR(totalITC),
                bold: true,
                valueColor: const Color(0xFF059669),
              ),
              const SizedBox(height: 10),
              Text(
                'Estimated at 18% GST on paid purchases. Verify with actual invoices.',
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontStyle: FontStyle.italic,
                  color: AppColors.inkTertiary,
                ),
              ),
            ],
          ),
        ),

        // ── Section 6.1 ───────────────────────────────────────────────────────
        const SizedBox(height: 12),
        _SectionCard(
          title: '6.1 Tax Payment',
          child: Column(
            children: [
              _GstRow(label: 'Gross Tax', value: formatINR(grossTax)),
              const SizedBox(height: 8),
              _GstRow(
                label: 'ITC Offset',
                value: '−${formatINR(totalITC)}',
                valueColor: const Color(0xFF059669),
              ),
              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 12),
              Row(
                children: [
                  Text(
                    'Net Tax Payable',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    formatINR(netTaxDue),
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: netTaxDue > 0
                          ? const Color(0xFFDC2626)
                          : const Color(0xFF059669),
                      letterSpacing: -0.5,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // ── Info banner ───────────────────────────────────────────────────────
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF2563EB).withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: const Color(0xFF2563EB).withValues(alpha: 0.2)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(LucideIcons.info,
                  size: 16, color: Color(0xFF2563EB)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Figures are estimates. File official GSTR-3B on the GST portal.',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: const Color(0xFF1D4ED8),
                    height: 1.5,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Section card wrapper ──────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
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
            title,
            style: GoogleFonts.hankenGrotesk(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.inkPrimary,
            ),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

// ── GST row (label + value) ───────────────────────────────────────────────────

class _GstRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  final Color? valueColor;

  const _GstRow({
    required this.label,
    required this.value,
    this.bold = false,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
            color: bold ? AppColors.inkPrimary : AppColors.inkSecondary,
          ),
        ),
        const Spacer(),
        Text(
          value,
          style: GoogleFonts.hankenGrotesk(
            fontSize: bold ? 14 : 13,
            fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
            color: valueColor ?? AppColors.inkPrimary,
          ),
        ),
      ],
    );
  }
}

// ── GST cell (stacked label + value for use in rows) ─────────────────────────

class _GstCell extends StatelessWidget {
  final String label;
  final String value;

  const _GstCell({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: AppColors.inkTertiary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.hankenGrotesk(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.inkPrimary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ── Section label ─────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: GoogleFonts.jetBrainsMono(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: AppColors.inkTertiary,
      ),
    );
  }
}
