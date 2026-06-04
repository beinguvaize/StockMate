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
import 'package:mobile_app/features/reports/presentation/widgets/simple_pie_chart.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';

const _kSliceColors = [
  Color(0xFF2563EB),
  Color(0xFF7C3AED),
  Color(0xFF059669),
  Color(0xFFF59E0B),
  Color(0xFFDC2626),
  Color(0xFF0891B2),
];

class PurchasesReportScreen extends ConsumerStatefulWidget {
  const PurchasesReportScreen({super.key});

  @override
  ConsumerState<PurchasesReportScreen> createState() =>
      _PurchasesReportScreenState();
}

class _PurchasesReportScreenState
    extends ConsumerState<PurchasesReportScreen> {
  DateTimeRange _range = DateTimeRange(
    start: DateTime.now().subtract(const Duration(days: 30)),
    end: DateTime.now(),
  );

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
        final params = ReportParams(
          tenantId: ctx.tenantId,
          from: _range.start,
          to: _range.end,
        );
        return _PurchasesView(
          params: params,
          range: _range,
          onRangeChanged: (r) => setState(() => _range = r),
        );
      },
    );
  }
}

class _PurchasesView extends ConsumerWidget {
  final ReportParams params;
  final DateTimeRange range;
  final ValueChanged<DateTimeRange> onRangeChanged;

  const _PurchasesView({
    required this.params,
    required this.range,
    required this.onRangeChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final purchasesAsync = ref.watch(reportPurchasesProvider(params));

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 16,
        title: Text(
          'Purchases',
          style: GoogleFonts.hankenGrotesk(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppColors.inkPrimary,
          ),
        ),
        actions: [
          DateRangeChip(range: range, onChanged: onRangeChanged),
          const SizedBox(width: 12),
        ],
      ),
      body: purchasesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text(
            'Failed to load purchases\n$e',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(color: AppColors.danger, fontSize: 13),
          ),
        ),
        data: (purchases) => _PurchasesBody(purchases: purchases),
      ),
    );
  }
}

class _PurchasesBody extends StatelessWidget {
  final List<Map<String, dynamic>> purchases;

  const _PurchasesBody({required this.purchases});

  @override
  Widget build(BuildContext context) {
    // ── Computations ────────────────────────────────────────────────────────────
    final total = purchases.fold(
        0.0, (s, p) => s + ((p['total_amount'] as num?)?.toDouble() ?? 0));
    final totalQty = purchases.fold(
        0.0, (s, p) => s + ((p['quantity'] as num?)?.toDouble() ?? 0));
    final uniqueSuppliers = purchases
        .map((p) => (p['supplier_name'] as String?) ?? 'Unknown')
        .toSet()
        .length;

    // By supplier
    final Map<String, double> bySupplier = {};
    for (final p in purchases) {
      final sup = (p['supplier_name'] as String?) ?? 'Unknown';
      bySupplier[sup] =
          (bySupplier[sup] ?? 0) + ((p['total_amount'] as num?)?.toDouble() ?? 0);
    }
    final sorted = bySupplier.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final top5 = sorted.take(5).toList();
    final othersTotal =
        sorted.skip(5).fold(0.0, (s, e) => s + e.value);

    // Supplier order counts
    final Map<String, int> supplierCount = {};
    for (final p in purchases) {
      final sup = (p['supplier_name'] as String?) ?? 'Unknown';
      supplierCount[sup] = (supplierCount[sup] ?? 0) + 1;
    }

    // Pie slices
    final slices = <PieSlice>[
      ...top5.asMap().entries.map((entry) => PieSlice(
            label: entry.value.key,
            value: entry.value.value,
            color: _kSliceColors[entry.key % _kSliceColors.length],
          )),
      if (othersTotal > 0)
        PieSlice(
          label: 'Others',
          value: othersTotal,
          color: const Color(0xFF0891B2),
        ),
    ];

    // Purchase list: last 50 sorted by date desc
    final displayPurchases = List<Map<String, dynamic>>.from(purchases)
      ..sort((a, b) {
        final da = (a['date'] as String?) ?? '';
        final db = (b['date'] as String?) ?? '';
        return db.compareTo(da);
      });
    final listPurchases = displayPurchases.take(50).toList();

    if (purchases.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.shoppingBag,
                size: 48, color: AppColors.inkTertiary.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text(
              'No purchases in this period',
              style: GoogleFonts.hankenGrotesk(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.inkSecondary,
              ),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // ── 3 KPI tiles ─────────────────────────────────────────────────────────
        _SectionLabel('Overview'),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ReportKpiTile(
                  label: 'Total Procurement',
                  value: compactINR(total),
                  icon: LucideIcons.packageOpen,
                  color: const Color(0xFF2563EB),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ReportKpiTile(
                  label: 'Unique Suppliers',
                  value: uniqueSuppliers.toString(),
                  icon: LucideIcons.users,
                  color: const Color(0xFF7C3AED),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ReportKpiTile(
                  label: 'Items Procured',
                  value: totalQty.toStringAsFixed(0),
                  icon: LucideIcons.layers,
                  color: const Color(0xFF059669),
                ),
              ),
            ],
          ),
        ),

        // ── Pie chart ───────────────────────────────────────────────────────────
        const SizedBox(height: 24),
        _SectionLabel('Spend by Supplier'),
        const SizedBox(height: 10),
        _ChartCard(
          child: Center(child: SimplePieChart(slices: slices, size: 160)),
        ),

        // ── Supplier breakdown ──────────────────────────────────────────────────
        const SizedBox(height: 24),
        _SectionLabel('Supplier Breakdown'),
        const SizedBox(height: 10),
        ...sorted.asMap().entries.map((entry) {
          final sup = entry.value.key;
          final amount = entry.value.value;
          final count = supplierCount[sup] ?? 0;
          final avg = count > 0 ? amount / count : 0.0;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _SupplierCard(
              supplier: sup,
              amount: amount,
              count: count,
              avg: avg,
            ),
          );
        }),

        // ── Purchase list (last 50) ─────────────────────────────────────────────
        const SizedBox(height: 16),
        _SectionLabel('Recent Purchases (${listPurchases.length})'),
        const SizedBox(height: 10),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: listPurchases.length,
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            final p = listPurchases[index];
            final date = (p['date'] as String?) ?? '';
            final supplier = (p['supplier_name'] as String?) ?? 'Unknown';
            final amount = (p['total_amount'] as num?)?.toDouble() ?? 0.0;
            final qty = (p['quantity'] as num?)?.toDouble() ?? 0.0;
            final notes = (p['notes'] as String?) ?? '';
            final paymentType = (p['payment_type'] as String?) ?? '';

            return _PurchaseItem(
              date: date,
              supplier: supplier,
              amount: amount,
              qty: qty,
              notes: notes,
              paymentType: paymentType,
            );
          },
        ),
      ],
    );
  }
}

// ── Supplier breakdown card ───────────────────────────────────────────────────

class _SupplierCard extends StatelessWidget {
  final String supplier;
  final double amount;
  final int count;
  final double avg;

  const _SupplierCard({
    required this.supplier,
    required this.amount,
    required this.count,
    required this.avg,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
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
                  supplier,
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$count order${count == 1 ? '' : 's'} · avg ${compactINR(avg)}',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: AppColors.inkSecondary,
                  ),
                ),
              ],
            ),
          ),
          Text(
            compactINR(amount),
            style: GoogleFonts.hankenGrotesk(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: const Color(0xFF2563EB),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Purchase list item ────────────────────────────────────────────────────────

class _PurchaseItem extends StatelessWidget {
  final String date;
  final String supplier;
  final double amount;
  final double qty;
  final String notes;
  final String paymentType;

  const _PurchaseItem({
    required this.date,
    required this.supplier,
    required this.amount,
    required this.qty,
    required this.notes,
    required this.paymentType,
  });

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                date,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  color: AppColors.inkTertiary,
                ),
              ),
              const Spacer(),
              Text(
                compactINR(amount),
                style: GoogleFonts.hankenGrotesk(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF2563EB),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            supplier,
            style: GoogleFonts.hankenGrotesk(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.inkPrimary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                'Qty: ${qty.toStringAsFixed(0)}${notes.isNotEmpty ? '  ·  $notes' : ''}',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: AppColors.inkSecondary,
                ),
              ),
              const Spacer(),
              if (paymentType.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainer,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: Colors.black.withValues(alpha: 0.08)),
                  ),
                  child: Text(
                    paymentType.toUpperCase(),
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: AppColors.inkSecondary,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

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

class _ChartCard extends StatelessWidget {
  final Widget child;
  const _ChartCard({required this.child});

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
      child: child,
    );
  }
}
