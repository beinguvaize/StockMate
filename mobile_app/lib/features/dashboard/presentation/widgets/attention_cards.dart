import 'package:flutter/material.dart';
import 'package:mobile_app/core/utils/money.dart';

import '../dashboard_logic.dart';
import 'dash_common.dart';

/// "Money owed to you": the total, how many customers it is spread over, and
/// the three who owe most. No age buckets -- the phone does not hold the dates
/// to compute them honestly.
class DuesCard extends StatelessWidget {
  final double total;
  final int customers;
  final List<Debtor> top;
  final VoidCallback? onTap;
  const DuesCard({
    super.key,
    required this.total,
    required this.customers,
    required this.top,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (customers == 0 || top.isEmpty) return const SizedBox.shrink();
    return DashCard(
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Total due', style: DashText.inter(12)),
                  const SizedBox(height: 2),
                  Text(Money.inr(total),
                      style: DashText.tight(20,
                          w: FontWeight.w800,
                          c: DashColors.amberDeep,
                          ls: -0.03)),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('Customers', style: DashText.inter(12)),
                  const SizedBox(height: 2),
                  Text('$customers',
                      style: DashText.tight(20, w: FontWeight.w800, ls: -0.03)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < top.length; i++)
            ListRow(
              leading: InitialsTile(initials(top[i].name)),
              title: top[i].name,
              onTap: onTap,
              last: i == top.length - 1,
              trailing: Text(Money.inr(top[i].owed),
                  style: DashText.tight(14.5,
                      w: FontWeight.w700, c: DashColors.amberDeep)),
            ),
        ],
      ),
    );
  }
}

/// "Reorder soon": up to three products that are out or low, out first.
class ReorderCard extends StatelessWidget {
  final List<ReorderItem> items;
  final VoidCallback? onTap;
  const ReorderCard({super.key, required this.items, this.onTap});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    return DashCard(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++)
            ListRow(
              leading: InitialsTile(
                initials(items[i].name),
                bg: items[i].isOut ? DashColors.redSoft : DashColors.amberSoft,
                fg: items[i].isOut ? DashColors.red : DashColors.amberDeep,
              ),
              title: items[i].name,
              sub: items[i].isOut ? 'Out of stock' : stockLeft(items[i].stock),
              subColor:
                  items[i].isOut ? DashColors.red : DashColors.amberDeep,
              onTap: onTap,
              last: i == items.length - 1,
              trailing: onTap == null
                  ? null
                  : Text('Reorder',
                      style: DashText.tight(13,
                          w: FontWeight.w700, c: DashColors.amberDeep)),
            ),
        ],
      ),
    );
  }
}

/// "Best sellers today": rank, name, a thin amber bar relative to #1, amount
/// and quantity.
class BestSellersCard extends StatelessWidget {
  final List<BestSeller> items;
  const BestSellersCard({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final top = items.first.revenue <= 0 ? 1.0 : items.first.revenue;
    return DashCard(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++)
            ListRow(
              leading: SizedBox(
                width: 24,
                child: Text('${i + 1}',
                    style: DashText.tight(13, c: DashColors.faint)),
              ),
              title: items[i].name,
              last: i == items.length - 1,
              under: Padding(
                padding: const EdgeInsets.only(top: 6),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: LayoutBuilder(
                    builder: (_, c) => Container(
                      height: 4,
                      width: c.maxWidth,
                      color: DashColors.well,
                      alignment: Alignment.centerLeft,
                      child: Container(
                        width: c.maxWidth *
                            (items[i].revenue / top).clamp(0.04, 1.0),
                        color: DashColors.amber,
                      ),
                    ),
                  ),
                ),
              ),
              trailing: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(Money.inr(items[i].revenue),
                      style: DashText.tight(14.5, w: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text('${qtyText(items[i].qty)} sold',
                      style: DashText.inter(11)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
