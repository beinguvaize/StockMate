import 'package:flutter/material.dart';
import 'package:mobile_app/core/utils/money.dart';

import '../dashboard_logic.dart';
import 'dash_common.dart';

/// Today's takings by how they were paid: one 8px stacked bar, then the
/// amounts. Segments with nothing in them are left out of the bar.
class PaymentSplitCard extends StatelessWidget {
  final List<SplitSegment> segments;
  const PaymentSplitCard({super.key, required this.segments});

  static const _colors = {
    'cash': DashColors.ink2,
    'upi': DashColors.blue,
    'credit': DashColors.amber,
    'bank': Color(0xFF9AA3AE),
  };

  @override
  Widget build(BuildContext context) {
    if (segments.isEmpty) return const SizedBox.shrink();
    final drawn = segments.where((s) => s.amount > 0).toList();
    return DashCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 14),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(5),
              child: SizedBox(
                height: 8,
                child: Row(
                  children: [
                    for (var i = 0; i < drawn.length; i++) ...[
                      if (i > 0) const SizedBox(width: 3),
                      Expanded(
                        flex: (drawn[i].amount * 100).round().clamp(1, 1 << 30),
                        child: Container(color: _colors[drawn[i].key]),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final s in segments)
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                              color: _colors[s.key],
                              borderRadius: BorderRadius.circular(3)),
                        ),
                        const SizedBox(width: 6),
                        Text(s.label, style: DashText.inter(12)),
                      ]),
                      const SizedBox(height: 3),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(Money.inr(s.amount),
                            style: DashText.tight(16, w: FontWeight.w700)),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
