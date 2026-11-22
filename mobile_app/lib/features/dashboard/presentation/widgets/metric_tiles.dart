import 'package:flutter/material.dart';
import 'package:mobile_app/core/utils/money.dart';

import '../providers/telemetry_provider.dart';
import 'dash_common.dart';

class _Tile extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  final VoidCallback? onTap;
  const _Tile(this.label, this.value, this.sub, {this.onTap});

  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(15, 14, 15, 14),
          decoration: BoxDecoration(
            color: DashColors.card,
            borderRadius: BorderRadius.circular(22),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: DashText.inter(12)),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(value,
                    style: DashText.tight(22, w: FontWeight.w800, ls: -0.03)),
              ),
              const SizedBox(height: 2),
              Text(sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: DashText.tight(11.5, w: FontWeight.w600, c: DashColors.mute)),
            ],
          ),
        ),
      );
}

/// Two-by-two: Expenses, Purchases, then Cash in hand (only when today's day
/// book exists -- otherwise its 0 would read as an empty drawer) or Bills
/// today, and Average bill.
class MetricTiles extends StatelessWidget {
  final DashboardMetrics m;
  final VoidCallback? onExpenses;
  final VoidCallback? onPurchases;
  final VoidCallback? onCash;
  final VoidCallback? onBills;
  const MetricTiles({
    super.key,
    required this.m,
    this.onExpenses,
    this.onPurchases,
    this.onCash,
    this.onBills,
  });

  static String _n(int n, String one, String many) =>
      n == 0 ? 'None yet' : '$n ${n == 1 ? one : many}';

  @override
  Widget build(BuildContext context) {
    final tiles = <Widget>[
      _Tile('Expenses today', Money.inr(m.todayExpenses),
          _n(m.expenseCount, 'entry', 'entries'), onTap: onExpenses),
      _Tile('Purchases today', Money.inr(m.todayPurchases),
          _n(m.purchaseCount, 'purchase', 'purchases'), onTap: onPurchases),
      if (m.hasDayBook)
        _Tile('Cash in hand', Money.inr(m.currentCashBalance), 'Day book balance',
            onTap: onCash)
      else
        _Tile('Bills today', '${m.todayBillCount}',
            m.todayBillCount == 0 ? 'None yet' : 'Rung today',
            onTap: onBills),
      _Tile(
          'Average bill',
          m.todayBillCount == 0 ? '—' : Money.inr(m.averageBill),
          m.todayBillCount == 0
              ? 'No bills yet'
              : 'Across ${m.todayBillCount} ${m.todayBillCount == 1 ? 'bill' : 'bills'}'),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
      child: Column(
        children: [
          Row(children: [
            Expanded(child: tiles[0]),
            const SizedBox(width: 8),
            Expanded(child: tiles[1]),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: tiles[2]),
            const SizedBox(width: 8),
            Expanded(child: tiles[3]),
          ]),
        ],
      ),
    );
  }
}
