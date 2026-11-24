import 'package:flutter/material.dart';
import 'package:mobile_app/core/utils/money.dart';

import '../dashboard_logic.dart';
import '../providers/telemetry_provider.dart';
import 'dash_common.dart';

/// Last seven days: total on top, seven rounded bars (today amber, the rest
/// grey), the value over the tallest bar and today, weekday names below with
/// "Today" last. Hidden when the week is empty.
class WeekCard extends StatelessWidget {
  final List<DayTotals> days;
  const WeekCard({super.key, required this.days});

  static const _wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  @override
  Widget build(BuildContext context) {
    final vals = [for (final d in days) d.amount];
    final total = vals.fold<double>(0, (a, b) => a + b);
    if (days.isEmpty || total <= 0) return const SizedBox.shrink();
    final maxV = vals.reduce((a, b) => a > b ? a : b);
    final top = tallestIndex(vals);
    final last = days.length - 1;
    final avg = total / days.length;
    const barArea = 110.0;

    return DashCard(
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Sales', style: DashText.inter(12)),
                  const SizedBox(height: 2),
                  Text(Money.inr(total),
                      style: DashText.tight(20, w: FontWeight.w800, ls: -0.03)),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('Daily average', style: DashText.inter(12)),
                  const SizedBox(height: 2),
                  Text(Money.inr(avg),
                      style: DashText.tight(20, w: FontWeight.w800, ls: -0.03)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 28),
          SizedBox(
            height: barArea,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < days.length; i++) ...[
                  if (i > 0) const SizedBox(width: 9),
                  Expanded(
                    child: Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.bottomCenter,
                      children: [
                        Container(
                          height: (vals[i] / maxV * barArea).clamp(4.0, barArea),
                          decoration: BoxDecoration(
                            color: i == last ? DashColors.amber : DashColors.bar,
                            borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(7),
                                bottom: Radius.circular(3)),
                          ),
                        ),
                        if ((i == top || i == last) && vals[i] > 0)
                          Positioned(
                            bottom: (vals[i] / maxV * barArea).clamp(4.0, barArea) + 4,
                            child: Text(compactRupees(vals[i]),
                                softWrap: false,
                                style: DashText.tight(10, w: FontWeight.w700)),
                          ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 7),
          Row(
            children: [
              for (var i = 0; i < days.length; i++) ...[
                if (i > 0) const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    i == last ? 'Today' : _wd[days[i].date.weekday - 1],
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    style: DashText.inter(10.5,
                        w: FontWeight.w600,
                        c: i == last ? DashColors.ink : DashColors.faint),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
