import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/reports/data/report_params.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';

const _amberText = Color(0xFFB86A0A);

/// The key every screen uses to read the product list for reports. Products
/// have no date range, so the dates are fixed: a key built from "now" was a
/// new key on every rebuild and fetched the whole list again each time.
ReportParams reportProductsKey(String tenantId) => ReportParams(
    tenantId: tenantId, from: DateTime(2020), to: DateTime(2020));

String _qty(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

/// "Inventory Report" (canvas): what the stock is worth, and what has not
/// sold in 30 days.
class InventoryReportScreen extends ConsumerStatefulWidget {
  const InventoryReportScreen({super.key});

  @override
  ConsumerState<InventoryReportScreen> createState() =>
      _InventoryReportScreenState();
}

class _InventoryReportScreenState
    extends ConsumerState<InventoryReportScreen> {
  static const double _lowThreshold = 5.0;
  int _tab = 0;

  double _stock(Map<String, dynamic> p) =>
      (p['stock'] as num?)?.toDouble() ?? 0;
  double _cost(Map<String, dynamic> p) =>
      (p['costPrice'] as num?)?.toDouble() ?? 0;
  double _sell(Map<String, dynamic> p) =>
      (p['sellingPrice'] as num?)?.toDouble() ?? 0;
  bool _low(Map<String, dynamic> p) =>
      _stock(p) <=
      ((p['lowStockThreshold'] as num?)?.toDouble() ?? _lowThreshold);

  @override
  Widget build(BuildContext context) {
    final last30 = reportLastDays(31);
    return ReportPage(
      title: 'Inventory Report',
      range: last30,
      builder: (context, salesParams) {
        final productsAsync = ref
            .watch(reportProductsProvider(reportProductsKey(salesParams.tenantId)));
        final salesAsync = ref.watch(reportSalesProvider(salesParams));
        if (productsAsync.hasError && !productsAsync.hasValue) {
          return ReportError(productsAsync.error!);
        }
        if (!productsAsync.hasValue) return const ReportLoading();
        final products = productsAsync.value!;
        final recentSales = salesAsync.valueOrNull;

        // ---- Valuation ---------------------------------------------------
        final totalCostValue =
            products.fold(0.0, (s, p) => s + _stock(p) * _cost(p));
        final totalSellValue =
            products.fold(0.0, (s, p) => s + _stock(p) * _sell(p));
        final projectedProfit = totalSellValue - totalCostValue;
        final stockAlerts = products.where(_low).length;

        final byCat = <String, (double, int)>{};
        for (final p in products) {
          final cat = (p['category'] as String?) ?? 'Uncategorized';
          final cur = byCat[cat] ?? (0.0, 0);
          byCat[cat] = (cur.$1 + _stock(p) * _cost(p), cur.$2 + 1);
        }
        final shares =
            reportTopShares(byCat).where((s) => s.value > 0).toList();

        // ---- Dead stock --------------------------------------------------
        final soldProductIds = <String>{};
        for (final s in recentSales ?? const <Map<String, dynamic>>[]) {
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
            .toList()
          ..sort((a, b) =>
              (_stock(b) * _cost(b)).compareTo(_stock(a) * _cost(a)));
        final deadValue =
            deadStock.fold(0.0, (s, p) => s + _stock(p) * _cost(p));

        final sortedProducts = [...products]..sort(
            (a, b) => (_stock(b) * _cost(b)).compareTo(_stock(a) * _cost(a)));

        return ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
              child: BlSegmented(
                labels: const ['Valuation', 'Dead stock (30d)'],
                index: _tab,
                onChanged: (i) => setState(() => _tab = i),
              ),
            ),
            if (_tab == 0) ...[
              ReportHero(
                label: 'Stock value at cost',
                value: Money.inr(totalCostValue),
                stats: [
                  ReportStat(Money.inr(totalSellValue), 'Sell value'),
                  ReportStat(
                      projectedProfit < 0
                          ? '− ${Money.inr(-projectedProfit)}'
                          : Money.inr(projectedProfit),
                      'Possible profit',
                      color: projectedProfit < 0 ? Bl.redDeep : reportGreen),
                  ReportStat('$stockAlerts', 'Stock alerts',
                      color: stockAlerts > 0 ? _amberText : Bl.ink),
                ],
              ),
              if (shares.isNotEmpty && totalCostValue > 0)
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        height: 8,
                        child: Row(
                          children: [
                            for (var i = 0; i < shares.length; i++)
                              Expanded(
                                flex: (shares[i].value / totalCostValue * 1000)
                                    .round()
                                    .clamp(15, 1000),
                                child: Container(
                                  margin: EdgeInsets.only(
                                      right: i == shares.length - 1 ? 0 : 3),
                                  decoration: BoxDecoration(
                                      color: reportShareColors[i],
                                      borderRadius: BorderRadius.circular(4)),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 14,
                        runSpacing: 6,
                        children: [
                          for (var i = 0; i < shares.length; i++)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                    width: 7,
                                    height: 7,
                                    decoration: BoxDecoration(
                                        color: reportShareColors[i],
                                        shape: BoxShape.circle)),
                                const SizedBox(width: 5),
                                Text(
                                    '${shares[i].name} ${(shares[i].value / totalCostValue * 100).round()}%',
                                    style: Bl.inter(11.5,
                                        w: FontWeight.w500, c: Bl.body)),
                              ],
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              BlGroupHeader('Products', trailing: '${products.length}'),
              if (products.isEmpty)
                const BlEmpty(
                  icon: BlIcons.box,
                  title: 'No products yet',
                  message: 'Add products in Inventory to see their value.',
                ),
              for (final p in sortedProducts)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 18, vertical: 11),
                  decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Bl.sep))),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                      (p['name'] as String?) ?? 'Unnamed',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Bl.tight(14.5,
                                          w: FontWeight.w600)),
                                ),
                                if (_low(p)) ...[
                                  const SizedBox(width: 6),
                                  _stock(p) <= 0
                                      ? BlStatusPill.red('Out of stock')
                                      : BlStatusPill.yellow('Low stock'),
                                ],
                              ],
                            ),
                            const SizedBox(height: 1),
                            Text(
                                'Stock ${_qty(_stock(p))} · sells for ${Money.inr(_stock(p) * _sell(p))}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Bl.inter(12, c: reportGrey)),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(Money.inr(_stock(p) * _cost(p)),
                              style: Bl.tight(14.5, w: FontWeight.w600)),
                          Text('at cost',
                              style: Bl.inter(11.5, c: reportGrey)),
                        ],
                      ),
                    ],
                  ),
                ),
            ] else if (recentSales == null)
              // Without the last 30 days of sales every product would look
              // unsold, so nothing is listed until they are in.
              Padding(
                padding: const EdgeInsets.all(24),
                child: salesAsync.hasError
                    ? Text(
                        'Could not load recent sales, so dead stock cannot be worked out. Check your internet and try again. (${salesAsync.error})',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5))
                    : const SizedBox(height: 120, child: ReportLoading()),
              )
            else ...[
              ReportHero(
                label: 'Money stuck in dead stock',
                value: Money.inr(deadValue),
                color: deadValue > 0 ? _amberText : Bl.ink,
                stats: [
                  ReportStat('${deadStock.length}',
                      deadStock.length == 1 ? 'Product' : 'Products'),
                  const ReportStat('30+ days', 'Not sold', color: _amberText),
                  ReportStat(
                      totalCostValue > 0
                          ? '${(deadValue / totalCostValue * 100).toStringAsFixed(1)}%'
                          : '—',
                      'Of stock value'),
                ],
              ),
              BlGroupHeader('Dead stock', trailing: '${deadStock.length}'),
              if (deadStock.isEmpty)
                const BlEmpty(
                  icon: BlIcons.check,
                  title: 'No dead stock',
                  message: 'Every product in stock sold in the last 30 days.',
                ),
              for (final p in deadStock)
                ReportEntryRow(
                  leading: Container(
                    width: 38,
                    height: 38,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                        color: const Color(0xFFFFF1C9),
                        borderRadius: BorderRadius.circular(12)),
                    child: const BlIcon(BlIcons.box,
                        size: 17, color: Color(0xFF8A5A00)),
                  ),
                  name: (p['name'] as String?) ?? 'Unnamed',
                  sub: '${_qty(_stock(p))} in stock · not sold in 30+ days',
                  amount: Money.inr(_stock(p) * _cost(p)),
                  amountColor: _amberText,
                ),
            ],
          ],
        );
      },
    );
  }
}
