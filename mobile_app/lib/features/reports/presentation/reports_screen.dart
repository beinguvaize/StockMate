import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/ap_aging_screen.dart';
import 'package:mobile_app/features/reports/presentation/ar_aging_screen.dart';
import 'package:mobile_app/features/reports/presentation/expenses_report_screen.dart';
import 'package:mobile_app/features/reports/presentation/gstr1_screen.dart';
import 'package:mobile_app/features/reports/presentation/gstr3b_screen.dart';
import 'package:mobile_app/features/reports/presentation/inventory_report_screen.dart';
import 'package:mobile_app/features/reports/presentation/purchases_report_screen.dart';
import 'package:mobile_app/features/reports/presentation/sales_summary_screen.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';

// ---------------------------------------------------------------------------
// Internal summary provider (kept for overview KPIs)
// ---------------------------------------------------------------------------
class _ReportSummary {
  final double totalSales;
  final double totalCogs;
  final double totalExpenses;
  final double totalPurchases;
  final double totalReturns;
  final double netProfit;

  const _ReportSummary({
    required this.totalSales,
    required this.totalCogs,
    required this.totalExpenses,
    required this.totalPurchases,
    required this.totalReturns,
    required this.netProfit,
  });
}

final _reportSummaryProvider = FutureProvider.family<_ReportSummary,
    ({String tenantId, DateTimeRange range})>((ref, params) async {
  final start = params.range.start.toIso8601String().split('T').first;
  final end = params.range.end.toIso8601String().split('T').first;

  // Every one of these used to rely on RLS alone. params.tenantId was
  // accepted and then never used, so the filter that the rest of the app
  // applies everywhere was the one thing this screen left to the server.
  final tenantId = params.tenantId;

  // The four reads do not depend on each other, so they go out together.
  // One after another they took over five seconds on a slow connection.
  final salesF = supabase
      .from('sales')
      .select('totalAmount, totalCogs').isFilter('deleted_at', null)
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .lte('date', end);

  final expensesF = supabase
      .from('expenses')
      .select('amount').isFilter('deleted_at', null)
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .lte('date', end);

  final purchasesF = supabase
      .from('purchases')
      .select('total_amount').isFilter('deleted_at', null)
      .eq('tenant_id', tenantId)
      .gte('date', start)
      .lte('date', end);

  // Shown as a line, never part of the headline, so a failure here must not
  // take the whole report down with it.
  final returnsF = () async {
    try {
      final returnsData = await supabase
          .from('sales_returns')
          .select('total_amount').isFilter('deleted_at', null)
          .eq('tenant_id', tenantId)
          .gte('date', start)
          .lte('date', end);
      var total = 0.0;
      for (final row in returnsData as List) {
        total += (row['total_amount'] as num? ?? 0).toDouble();
      }
      return total;
    } catch (e) {
      debugPrint('[reports] returns total failed: $e');
      return 0.0;
    }
  }();

  final loaded = await Future.wait<dynamic>([salesF, expensesF, purchasesF]);
  final salesData = loaded[0];
  final expensesData = loaded[1];
  final purchasesData = loaded[2];
  final totalReturns = await returnsF;

  double totalSales = 0;
  double totalCogs = 0;
  for (final row in salesData as List) {
    totalSales += (row['totalAmount'] as num? ?? 0).toDouble();
    totalCogs += (row['totalCogs'] as num? ?? 0).toDouble();
  }
  double totalExpenses = 0;
  for (final row in expensesData as List) {
    totalExpenses += (row['amount'] as num? ?? 0).toDouble();
  }
  double totalPurchases = 0;
  for (final row in purchasesData as List) {
    totalPurchases += (row['total_amount'] as num? ?? 0).toDouble();
  }

  return _ReportSummary(
    totalSales: totalSales,
    totalCogs: totalCogs,
    totalExpenses: totalExpenses,
    totalPurchases: totalPurchases,
    totalReturns: totalReturns,
    // Revenue less the cost of what was SOLD, less expenses.
    //
    // This subtracted PURCHASES, which is stock BOUGHT -- money that has left
    // the till but is still sitting on the shelf as an asset, not a cost. On
    // FUTURE DISPO this month that reported a ₹17,611 PROFIT for a month that
    // actually ran a ₹14,076 LOSS: wrong by ₹31,687 and, worse, wrong in SIGN.
    //
    // sales.totalCogs is the settled source of truth for cost of goods (batch
    // FIFO with a costPrice fallback) and is what the web P&L uses, so mobile
    // and web now answer the same question the same way.
    //
    // Returns are reported as a line but deliberately left OUT of this figure:
    // return COGS is a known open question in the GL/P&L reconciliation, and
    // folding an unsettled number into the headline would be trading one
    // wrong profit for another.
    netProfit: totalSales - totalCogs - totalExpenses,
  );
});

/// "Reports" (canvas): the period's profit, how it is made up, and a tile
/// for each detailed report with its headline figure.
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  DateTimeRange _dateRange = reportLastDays(30);

  void _open(Widget screen) => Navigator.push(
      context, MaterialPageRoute(builder: (_) => screen));

  Widget _tile(String icon, String label, String? figure, Widget screen,
          {Color color = Bl.body}) =>
      Expanded(
        child: Semantics(
          button: true,
          label: figure == null ? label : '$label, $figure',
          excludeSemantics: true,
          child: BlTap(
            onTap: () => _open(screen),
            child: Container(
              padding: const EdgeInsets.fromLTRB(11, 10, 11, 10),
              decoration: BoxDecoration(
                  color: Bl.tile, borderRadius: BorderRadius.circular(14)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                        color: Bl.white,
                        borderRadius: BorderRadius.circular(9)),
                    child: BlIcon(icon, size: 14, color: Bl.ink3),
                  ),
                  const SizedBox(height: 7),
                  Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(12.5, w: FontWeight.w600)),
                  const SizedBox(height: 1),
                  Text(figure ?? '…',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(12, w: FontWeight.w600, c: color)),
                ],
              ),
            ),
          ),
        ),
      );

  Widget _tiles(String heading, List<Widget> tiles) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 5),
            child: Text(heading.toUpperCase(), style: Bl.eyebrow),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < 3; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  i < tiles.length ? tiles[i] : const Spacer(),
                ],
              ],
            ),
          ),
        ],
      );

  Widget _line(String label, String value,
          {bool total = false, Color? color, bool muted = false}) =>
      Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: total
            ? null
            : const BoxDecoration(
                border: Border(bottom: BorderSide(color: Bl.sep))),
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  style: Bl.inter(13.5,
                      w: total ? FontWeight.w600 : FontWeight.w500,
                      c: total
                          ? Bl.ink
                          : muted
                              ? const Color(0xFF9AA0A6)
                              : Bl.body)),
            ),
            Text(value,
                style: Bl.tight(14,
                    w: total ? FontWeight.w700 : FontWeight.w600,
                    c: color ?? (muted ? const Color(0xFF9AA0A6) : Bl.ink))),
          ],
        ),
      );

  Widget _dark(String label, String value) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                maxLines: 1,
                style: Bl.inter(11,
                    w: FontWeight.w500, c: const Color(0xFF9AA0A8))),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value,
                  style: Bl.tight(14, w: FontWeight.w700, c: Bl.white)),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Reports'),
            Expanded(
              child: tenantAsync.when(
                loading: () => const ReportLoading(),
                error: (e, _) => ReportError(e),
                data: (ctx) {
                  if (ctx == null) {
                    return const ReportError('Sign out and back in.');
                  }
                  if (!planMeetsRequirement('reports', ctx.plan)) {
                    return const Center(
                      child: BlEmpty(
                        icon: BlIcons.lock,
                        title: 'Upgrade required',
                        message:
                            'Reports are available on the PRO plan and above.',
                      ),
                    );
                  }

                  final params = (tenantId: ctx.tenantId, range: _dateRange);
                  final summaryAsync =
                      ref.watch(_reportSummaryProvider(params));
                  final s = summaryAsync.valueOrNull;

                  // Tile figures. Each loads on its own; a tile shows "…"
                  // until its figure arrives and is still tappable meanwhile.
                  final clients = ref.watch(clientsProvider).valueOrNull;
                  final toCollect = clients
                      ?.where((c) => (c.outstandingBalance ?? 0) > 0.5)
                      .fold<double>(
                          0, (t, c) => t + (c.outstandingBalance ?? 0));
                  final suppliers = ref.watch(suppliersProvider).valueOrNull;
                  final derived =
                      ref.watch(supplierOutstandingProvider).valueOrNull;
                  final toPay = suppliers
                      ?.map((x) => supplierOutstanding(x, derived))
                      .where((v) => v > 0.5)
                      .fold<double>(0, (t, v) => t + v);
                  final products = ref
                      .watch(reportProductsProvider(
                          reportProductsKey(ctx.tenantId)))
                      .valueOrNull;
                  final stockValue = products?.fold<double>(
                      0,
                      (t, p) =>
                          t +
                          ((p['stock'] as num?)?.toDouble() ?? 0) *
                              ((p['costPrice'] as num?)?.toDouble() ?? 0));
                  final now = DateTime.now();
                  // The month the GST screens open on.
                  final gstMonth = '${reportMonths[now.month - 1]} ${now.year}';

                  final margin = s == null || s.totalSales <= 0
                      ? null
                      : s.netProfit / s.totalSales * 100;
                  final loss = (s?.netProfit ?? 0) < 0;

                  return ListView(
                    padding: const EdgeInsets.only(bottom: 24),
                    children: [
                      ReportRangeBar(
                          range: _dateRange,
                          onChanged: (r) => setState(() => _dateRange = r)),
                      if (summaryAsync.hasError && s == null)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
                          child: Text(
                              'Could not load the profit figures. Check your internet and try again. (${summaryAsync.error})',
                              style: Bl.inter(13, c: Bl.redDeep, h: 1.5)),
                        )
                      else ...[
                        // The card keeps one dark ground whatever the result;
                        // only the figure carries the sign.
                        Container(
                          margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                              color: Bl.ink,
                              borderRadius: BorderRadius.circular(22)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                        loss ? 'Net loss' : 'Net profit',
                                        style: Bl.inter(13,
                                            w: FontWeight.w500,
                                            c: const Color(0xFFB8BCC2))),
                                  ),
                                  if (margin != null)
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 9, vertical: 3),
                                      decoration: BoxDecoration(
                                          color: loss
                                              ? const Color(0x2EF87171)
                                              : const Color(0x2E22C55E),
                                          borderRadius:
                                              BorderRadius.circular(999)),
                                      child: Text(
                                          '${margin.abs().toStringAsFixed(1)}% of revenue',
                                          style: Bl.tight(11.5,
                                              w: FontWeight.w600,
                                              ls: 0,
                                              c: loss
                                                  ? const Color(0xFFF87171)
                                                  : const Color(0xFF4ADE80))),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text(
                                    s == null
                                        ? '₹ …'
                                        : loss
                                            ? '− ${Money.inr(-s.netProfit)}'
                                            : Money.inr(s.netProfit),
                                    style: Bl.tight(36,
                                        w: FontWeight.w700,
                                        ls: -0.04,
                                        h: 1.05,
                                        c: loss
                                            ? const Color(0xFFF87171)
                                            : Bl.white)),
                              ),
                              Container(
                                margin: const EdgeInsets.only(top: 14),
                                padding: const EdgeInsets.only(top: 12),
                                decoration: const BoxDecoration(
                                    border: Border(
                                        top: BorderSide(
                                            color: Color(0x1FFFFFFF)))),
                                child: Row(
                                  children: [
                                    _dark('Money in',
                                        s == null ? '…' : Money.inr(s.totalSales)),
                                    const SizedBox(width: 10),
                                    _dark(
                                        'Money out',
                                        s == null
                                            ? '…'
                                            : Money.inr(s.totalCogs +
                                                s.totalExpenses)),
                                    const SizedBox(width: 10),
                                    _dark(
                                        'Stock bought',
                                        s == null
                                            ? '…'
                                            : Money.inr(s.totalPurchases)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (s != null)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
                            child: Column(
                              children: [
                                _line('Revenue', Money.inr(s.totalSales)),
                                _line('Cost of goods',
                                    '− ${Money.inr(s.totalCogs)}'),
                                _line('Expenses',
                                    '− ${Money.inr(s.totalExpenses)}'),
                                // Shown, not subtracted: see the note on
                                // netProfit above.
                                if (s.totalReturns > 0)
                                  _line('Returns · not taken off profit',
                                      Money.inr(s.totalReturns),
                                      muted: true),
                                _line(
                                    loss ? 'Net loss' : 'Net profit',
                                    loss
                                        ? '− ${Money.inr(-s.netProfit)}'
                                        : Money.inr(s.netProfit),
                                    total: true,
                                    color: loss ? Bl.redDeep : reportGreen),
                              ],
                            ),
                          ),
                      ],
                      _tiles('Money', [
                        _tile(BlIcons.chart, 'Sales',
                            s == null ? null : Money.inr(s.totalSales),
                            const SalesSummaryScreen()),
                        _tile(BlIcons.cash, 'Expenses',
                            s == null ? null : Money.inr(s.totalExpenses),
                            const ExpensesReportScreen()),
                        _tile(BlIcons.cart, 'Purchases',
                            s == null ? null : Money.inr(s.totalPurchases),
                            const PurchasesReportScreen()),
                      ]),
                      _tiles('Dues', [
                        _tile(
                            '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
                            'Money to collect',
                            toCollect == null ? null : Money.inr(toCollect),
                            const ArAgingScreen(),
                            color: Bl.redDeep),
                        _tile(
                            '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
                            'Money to pay',
                            toPay == null ? null : Money.inr(toPay),
                            const ApAgingScreen(),
                            color: const Color(0xFFB86A0A)),
                      ]),
                      _tiles('Stock & GST', [
                        _tile(BlIcons.box, 'Inventory',
                            stockValue == null ? null : Money.inr(stockValue),
                            const InventoryReportScreen()),
                        _tile(BlIcons.doc, 'GSTR-1', gstMonth,
                            const Gstr1Screen()),
                        _tile(
                            '<path d="M6 3h9l4 4v14H6z"/><path d="M9 13l2 2 4-4"/>',
                            'GSTR-3B',
                            gstMonth,
                            const Gstr3bScreen()),
                      ]),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
