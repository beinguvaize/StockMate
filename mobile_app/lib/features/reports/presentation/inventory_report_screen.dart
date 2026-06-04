import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/reports/data/report_params.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_kpi_tile.dart';
import 'package:mobile_app/features/reports/presentation/widgets/simple_pie_chart.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';

// ---------------------------------------------------------------------------
// Pie palette
// ---------------------------------------------------------------------------
const _kPieColors = [
  Color(0xFFF59E0B),
  Color(0xFF0891B2),
  Color(0xFF7C3AED),
  Color(0xFF059669),
  Color(0xFFDC2626),
  Color(0xFFE879F9),
  Color(0xFF6366F1),
  Color(0xFFFF6B35),
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
class InventoryReportScreen extends ConsumerStatefulWidget {
  const InventoryReportScreen({super.key});

  @override
  ConsumerState<InventoryReportScreen> createState() =>
      _InventoryReportScreenState();
}

class _InventoryReportScreenState
    extends ConsumerState<InventoryReportScreen> {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return tenantAsync.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(title: const Text('Inventory Report')),
        body: Center(child: Text('Error: $e')),
      ),
      data: (ctx) {
        if (ctx == null) {
          return const Scaffold(
            body: Center(child: Text('No tenant context.')),
          );
        }

        final now = DateTime.now();
        // Products don't use date range — pass arbitrary dates.
        final productsParams = ReportParams(
          tenantId: ctx.tenantId,
          from: now.subtract(const Duration(days: 365)),
          to: now,
        );
        // Last 30 days for dead-stock detection.
        final last30Params = ReportParams(
          tenantId: ctx.tenantId,
          from: now.subtract(const Duration(days: 30)),
          to: now,
        );

        final productsAsync = ref.watch(reportProductsProvider(productsParams));
        final salesAsync = ref.watch(reportSalesProvider(last30Params));

        return DefaultTabController(
          length: 2,
          child: Scaffold(
            backgroundColor: AppColors.canvas,
            appBar: AppBar(
              backgroundColor: AppColors.canvas,
              elevation: 0,
              scrolledUnderElevation: 0,
              iconTheme: const IconThemeData(color: AppColors.inkPrimary),
              title: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Inventory Report',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                      color: AppColors.inkPrimary,
                    ),
                  ),
                  Text(
                    'STOCK VALUATION',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                      color: AppColors.secondary,
                      letterSpacing: 1.5,
                    ),
                  ),
                ],
              ),
              bottom: TabBar(
                labelStyle: GoogleFonts.hankenGrotesk(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
                unselectedLabelStyle: GoogleFonts.hankenGrotesk(
                  fontWeight: FontWeight.w500,
                  fontSize: 13,
                ),
                labelColor: AppColors.primary,
                unselectedLabelColor: AppColors.inkSecondary,
                indicatorColor: AppColors.primary,
                indicatorWeight: 3,
                tabs: const [
                  Tab(text: 'Valuation'),
                  Tab(text: 'Dead Stock (30d)'),
                ],
              ),
            ),
            body: productsAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Text(
                  'Error loading products: $e',
                  style: GoogleFonts.inter(color: AppColors.danger),
                ),
              ),
              data: (products) {
                return salesAsync.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(
                    child: Text(
                      'Error loading sales: $e',
                      style: GoogleFonts.inter(color: AppColors.danger),
                    ),
                  ),
                  data: (recentSales) {
                    return _InventoryBody(
                      products: products,
                      recentSales: recentSales,
                    );
                  },
                );
              },
            ),
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Body — separated to keep build() lean
// ---------------------------------------------------------------------------
class _InventoryBody extends StatelessWidget {
  final List<Map<String, dynamic>> products;
  final List<Map<String, dynamic>> recentSales;

  const _InventoryBody({
    required this.products,
    required this.recentSales,
  });

  // --------------------------------------------------------------------------
  // Computations
  // --------------------------------------------------------------------------
  static const double _lowThreshold = 5.0;

  double _stock(Map<String, dynamic> p) =>
      (p['stock'] as num?)?.toDouble() ?? 0;
  double _cost(Map<String, dynamic> p) =>
      (p['costPrice'] as num?)?.toDouble() ?? 0;
  double _sell(Map<String, dynamic> p) =>
      (p['sellingPrice'] as num?)?.toDouble() ?? 0;

  @override
  Widget build(BuildContext context) {
    // ---- Valuation KPIs -------------------------------------------------------
    final totalCostValue = products.fold(
        0.0, (s, p) => s + _stock(p) * _cost(p));
    final totalSellValue = products.fold(
        0.0, (s, p) => s + _stock(p) * _sell(p));
    final projectedProfit = totalSellValue - totalCostValue;
    final stockAlerts = products
        .where((p) =>
            _stock(p) <=
            ((p['lowStockThreshold'] as num?)?.toDouble() ?? _lowThreshold))
        .length;

    // ---- By category (pie) -----------------------------------------------
    final Map<String, double> byCat = {};
    for (final p in products) {
      final cat = (p['category'] as String?) ?? 'Uncategorized';
      byCat[cat] = (byCat[cat] ?? 0) + _stock(p) * _cost(p);
    }
    final sortedCats = byCat.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final pieSlices = sortedCats.asMap().entries.map((e) {
      return PieSlice(
        label: e.value.key,
        value: e.value.value,
        color: _kPieColors[e.key % _kPieColors.length],
      );
    }).toList();

    // ---- Dead stock -------------------------------------------------------
    final soldProductIds = <String>{};
    for (final s in recentSales) {
      final items = s['items'] as List?;
      if (items == null) continue;
      for (final item in items) {
        final pid = (item as Map?)?['product_id'] ??
            item?['id'] ??
            item?['productId'];
        if (pid != null) soldProductIds.add(pid.toString());
      }
    }
    final deadStock = products
        .where((p) =>
            _stock(p) > 0 &&
            !soldProductIds.contains(p['id'] as String? ?? ''))
        .toList();

    // ---- Sorted valuation list --------------------------------------------
    final sortedProducts = [...products]
      ..sort((a, b) => (_stock(b) * _cost(b)).compareTo(_stock(a) * _cost(a)));

    return TabBarView(
      children: [
        // ================================================================
        // TAB 1: Valuation
        // ================================================================
        CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // KPI 2x2
                    Row(
                      children: [
                        Expanded(
                          child: ReportKpiTile(
                            label: 'Stock Value / Cost',
                            value: compactINR(totalCostValue),
                            color: const Color(0xFFF59E0B),
                            icon: LucideIcons.package,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ReportKpiTile(
                            label: 'Potential Revenue',
                            value: compactINR(totalSellValue),
                            color: const Color(0xFF059669),
                            icon: LucideIcons.trendingUp,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: ReportKpiTile(
                            label: 'Projected Profit',
                            value: compactINR(projectedProfit),
                            color: const Color(0xFF0891B2),
                            icon: LucideIcons.indianRupee,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ReportKpiTile(
                            label: 'Stock Alerts',
                            value: stockAlerts.toString(),
                            color: AppColors.danger,
                            icon: LucideIcons.alertTriangle,
                          ),
                        ),
                      ],
                    ),

                    // Pie chart
                    const SizedBox(height: 24),
                    _SectionHeader(
                        title: 'BY CATEGORY', icon: LucideIcons.pieChart),
                    const SizedBox(height: 16),
                    if (pieSlices.isNotEmpty)
                      Center(
                        child: SimplePieChart(slices: pieSlices, size: 160),
                      )
                    else
                      _EmptyState(
                        icon: LucideIcons.pieChart,
                        message: 'No category data',
                      ),

                    const SizedBox(height: 24),
                    _SectionHeader(
                        title: 'PRODUCTS', icon: LucideIcons.layoutList),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),

            // Product list
            if (sortedProducts.isEmpty)
              SliverFillRemaining(
                child: _EmptyState(
                  icon: LucideIcons.package,
                  message: 'No products found',
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final p = sortedProducts[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ProductCard(product: p),
                      );
                    },
                    childCount: sortedProducts.length,
                  ),
                ),
              ),
          ],
        ),

        // ================================================================
        // TAB 2: Dead Stock
        // ================================================================
        deadStock.isEmpty
            ? _EmptyState(
                icon: LucideIcons.checkCircle2,
                message: 'No dead stock — all products sold in the last 30 days',
                positive: true,
              )
            : CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 10),
                            decoration: BoxDecoration(
                              color:
                                  const Color(0xFFEA580C).withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                  color: const Color(0xFFEA580C)
                                      .withValues(alpha: 0.3)),
                            ),
                            child: Row(
                              children: [
                                const Icon(LucideIcons.alertOctagon,
                                    size: 16, color: Color(0xFFEA580C)),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    '${deadStock.length} product${deadStock.length == 1 ? '' : 's'} with no sales in the last 30 days',
                                    style: GoogleFonts.inter(
                                      fontSize: 12,
                                      color: const Color(0xFFEA580C),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          _SectionHeader(
                              title: 'IDLE STOCK',
                              icon: LucideIcons.packageX),
                          const SizedBox(height: 12),
                        ],
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final p = deadStock[index];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _DeadStockCard(product: p),
                          );
                        },
                        childCount: deadStock.length,
                      ),
                    ),
                  ),
                ],
              ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Product card (Valuation tab)
// ---------------------------------------------------------------------------
class _ProductCard extends StatelessWidget {
  final Map<String, dynamic> product;
  const _ProductCard({required this.product});

  static const double _lowThreshold = 5.0;

  @override
  Widget build(BuildContext context) {
    final name = (product['name'] as String?) ?? '—';
    final sku = (product['sku'] as String?) ?? '';
    final category = (product['category'] as String?) ?? 'Uncategorized';
    final unit = (product['unit'] as String?) ?? 'pcs';
    final stock = (product['stock'] as num?)?.toDouble() ?? 0;
    final costPrice = (product['costPrice'] as num?)?.toDouble() ?? 0;
    final sellPrice = (product['sellingPrice'] as num?)?.toDouble() ?? 0;
    final threshold =
        (product['lowStockThreshold'] as num?)?.toDouble() ?? _lowThreshold;
    final isLow = stock <= threshold;
    final costValue = stock * costPrice;
    final sellValue = stock * sellPrice;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isLow
              ? AppColors.danger.withValues(alpha: 0.3)
              : Colors.black.withValues(alpha: 0.06),
        ),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row 1: name + category pill
          Row(
            children: [
              Expanded(
                child: Text(
                  name,
                  style: GoogleFonts.hankenGrotesk(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.inkPrimary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  category,
                  style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ],
          ),

          // SKU
          if (sku.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              sku,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                color: AppColors.inkTertiary,
              ),
            ),
          ],

          const SizedBox(height: 10),
          const Divider(height: 1, thickness: 1, color: Color(0x0F000000)),
          const SizedBox(height: 10),

          // Row 2: stock qty + low-stock chip
          Row(
            children: [
              Text(
                'Stock: ',
                style: GoogleFonts.inter(
                    fontSize: 12, color: AppColors.inkSecondary),
              ),
              Text(
                '${stock.toStringAsFixed(stock.truncateToDouble() == stock ? 0 : 2)} $unit',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.inkPrimary,
                ),
              ),
              const Spacer(),
              if (isLow)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: AppColors.danger.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(LucideIcons.alertTriangle,
                          size: 10, color: AppColors.danger),
                      const SizedBox(width: 4),
                      Text(
                        'LOW STOCK',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: AppColors.danger,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),

          const SizedBox(height: 8),

          // Row 3: cost value | sell value
          Row(
            children: [
              Expanded(
                child: _ValueLabel(
                  label: 'Cost value',
                  value: compactINR(costValue),
                  color: const Color(0xFFF59E0B),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ValueLabel(
                  label: 'Sell value',
                  value: compactINR(sellValue),
                  color: const Color(0xFF059669),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ValueLabel extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _ValueLabel(
      {required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: GoogleFonts.inter(
                  fontSize: 9,
                  color: color.withValues(alpha: 0.8),
                  fontWeight: FontWeight.w500)),
          Text(
            value,
            style: GoogleFonts.hankenGrotesk(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Dead Stock card
// ---------------------------------------------------------------------------
class _DeadStockCard extends StatelessWidget {
  final Map<String, dynamic> product;
  const _DeadStockCard({required this.product});

  @override
  Widget build(BuildContext context) {
    final name = (product['name'] as String?) ?? '—';
    final sku = (product['sku'] as String?) ?? '';
    final unit = (product['unit'] as String?) ?? 'pcs';
    final stock = (product['stock'] as num?)?.toDouble() ?? 0;
    final costPrice = (product['costPrice'] as num?)?.toDouble() ?? 0;
    final costValue = stock * costPrice;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: const Color(0xFFEA580C).withValues(alpha: 0.25)),
        boxShadow: [AppColors.cardShadow],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFEA580C).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(LucideIcons.packageX,
                color: Color(0xFFEA580C), size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: GoogleFonts.hankenGrotesk(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.inkPrimary,
                  ),
                ),
                if (sku.isNotEmpty)
                  Text(
                    sku,
                    style: GoogleFonts.jetBrainsMono(
                        fontSize: 10, color: AppColors.inkTertiary),
                  ),
                const SizedBox(height: 4),
                Text(
                  'Stock: ${stock.toStringAsFixed(stock.truncateToDouble() == stock ? 0 : 2)} $unit',
                  style: GoogleFonts.inter(
                      fontSize: 12, color: AppColors.inkSecondary),
                ),
                const SizedBox(height: 2),
                Text(
                  'Not sold in 30+ days',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFFEA580C),
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                compactINR(costValue),
                style: GoogleFonts.hankenGrotesk(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  color: const Color(0xFFF59E0B),
                ),
              ),
              Text(
                'idle capital',
                style: GoogleFonts.inter(
                    fontSize: 10,
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.8)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------
class _SectionHeader extends StatelessWidget {
  final String title;
  final IconData icon;
  const _SectionHeader({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: AppColors.primaryContainer.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 14, color: AppColors.primary),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: GoogleFonts.jetBrainsMono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
            color: AppColors.primary,
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  final bool positive;
  const _EmptyState(
      {required this.icon, required this.message, this.positive = false});

  @override
  Widget build(BuildContext context) {
    final color = positive ? AppColors.primary : AppColors.inkTertiary;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 32),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppColors.inkSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
