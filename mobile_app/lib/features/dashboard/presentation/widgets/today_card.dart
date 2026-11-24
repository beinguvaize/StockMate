import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/theme/colors.dart';
import '../../../../core/theme/dimens.dart';
import '../../../../core/theme/typography.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/widgets/app_button.dart';
import '../providers/telemetry_provider.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Today card — the day's money, on a dark ground
// ─────────────────────────────────────────────────────────────────────────────

/// Money sits on a dark, near-neutral surface and colour is spent on the
/// signals inside it, not on the surface itself. That is the pattern serious
/// finance tools use, and it is why this reads as a ledger rather than a
/// promotion. The navy is the logo's own wordmark colour.
///
/// It replaces two blocks that used to be separate: a revenue tile and a
/// white "Weekly Sales" chart card below it. The figure and the shape of the
/// day it came from belong together -- split apart, the chart was a second
/// card competing with the number it explained.
class TodayCard extends StatelessWidget {
  final double amount;
  final int billCount;
  final double averageBill;
  final double? deltaPct;
  final List<double> hourly;
  final bool revenueVisible;
  final VoidCallback onToggleVisible;
  final VoidCallback onTap;

  const TodayCard({
    super.key,
    required this.amount,
    required this.billCount,
    required this.averageBill,
    required this.deltaPct,
    required this.hourly,
    required this.revenueVisible,
    required this.onToggleVisible,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final delta = deltaPct;
    final up = (delta ?? 0) >= 0;

    return AppTappable(
      ripple: false,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(Gap.xl - 4),
        decoration: BoxDecoration(
          borderRadius: Radii.rLg,
          // oklab, not the sRGB default: sRGB darkens and mutes the midpoint,
          // which on two near-neutral navies shows up as a grey band.
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.surfaceInverse, AppColors.surfaceInverseDeep],
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'SALES TODAY',
                    style: AppText.eyebrow.copyWith(
                      color: AppColors.onSurfaceInverseMuted,
                    ),
                  ),
                ),
                // Only rendered when there is a real yesterday to compare
                // against. A day-one shop is not shown a triumphant +100%.
                if (delta != null) ...[
                  Icon(
                    up ? LucideIcons.trendingUp : LucideIcons.trendingDown,
                    size: 14,
                    color: up
                        ? AppColors.successOnInverse
                        : AppColors.errorOnInverse,
                  ),
                  Gap.w4,
                  Text(
                    '${delta.abs().toStringAsFixed(0)}%',
                    style: AppText.label.copyWith(
                      color: up
                          ? AppColors.successOnInverse
                          : AppColors.errorOnInverse,
                    ),
                  ),
                  Gap.w8,
                ],
                AppTappable(
                  ripple: false,
                  onTap: onToggleVisible,
                  child: Icon(
                    revenueVisible ? LucideIcons.eye : LucideIcons.eyeOff,
                    size: 16,
                    color: AppColors.onSurfaceInverseMuted,
                  ),
                ),
              ],
            ),
            Gap.h8,
            Text(
              revenueVisible ? Money.inr(amount) : '••••••',
              style: AppText.moneyCard.copyWith(
                color: AppColors.onSurfaceInverse,
              ),
            ),
            const SizedBox(height: Gap.xs),
            Text(
              billCount == 0
                  ? 'No bills yet today'
                  : '$billCount ${billCount == 1 ? 'bill' : 'bills'}'
                        ' · ${Money.inr(averageBill)} average',
              style: AppText.caption.copyWith(
                color: AppColors.onSurfaceInverseMuted,
              ),
            ),
            // A day with no trade gets no chart. Twelve grey stubs and one
            // orange one reads as a broken chart, not an empty day.
            if (hourly.any((v) => v > 0)) ...[
              const SizedBox(height: 18),
              _HourlyBars(hourly: hourly),
            ],
          ],
        ),
      ),
    );
  }
}

/// Twelve bars and four hour labels drawn on ONE twelve-column grid, so a
/// label sits exactly over the hour it names. Laid out with space-between
/// they drift: four labels spread across twelve bars line up with none of
/// them, which is how the first version named an hour that had no bar.
class _HourlyBars extends StatelessWidget {
  final List<double> hourly;
  const _HourlyBars({required this.hourly});

  /// Which columns carry a label. Column 1 is [kFirstTradingHour].
  static const List<int> _labelledColumns = [1, 4, 7, 10];

  String _hourLabel(int hour) {
    final h = hour % 12 == 0 ? 12 : hour % 12;
    return '$h ${hour < 12 ? 'am' : 'pm'}';
  }

  @override
  Widget build(BuildContext context) {
    final max = hourly.fold<double>(0, (m, v) => v > m ? v : m);
    // The last bucket is the hour in progress, so it is short because the
    // hour is not over, not because trade collapsed. It carries the accent
    // so "now" and "highest" are never the same bar telling two stories.
    final nowSlot = (DateTime.now().hour - kFirstTradingHour)
        .clamp(0, kTradingHours - 1);

    return Column(
      children: [
        SizedBox(
          height: 48,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (int i = 0; i < hourly.length; i++) ...[
                Expanded(
                  child: FractionallySizedBox(
                    heightFactor: max > 0
                        ? (hourly[i] / max).clamp(0.06, 1.0)
                        : 0.06,
                    child: Container(
                      decoration: BoxDecoration(
                        color: i == nowSlot
                            ? AppColors.brandFill
                            : AppColors.outlineInverse,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                ),
                if (i < hourly.length - 1) const SizedBox(width: 5),
              ],
            ],
          ),
        ),
        const SizedBox(height: 7),
        Row(
          children: [
            for (int i = 0; i < hourly.length; i++) ...[
              Expanded(
                child: _labelledColumns.contains(i)
                    ? Text(
                        _hourLabel(kFirstTradingHour + i),
                        textAlign: TextAlign.center,
                        softWrap: false,
                        overflow: TextOverflow.visible,
                        // Not 11px, which is what the artboard used: the
                        // type scale floors text at 13 and chart furniture
                        // is not exempt. Centred over an empty neighbouring
                        // column, 13 fits without crowding the next label.
                        style: AppText.caption.copyWith(
                          color: AppColors.onSurfaceInverseMuted,
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
              if (i < hourly.length - 1) const SizedBox(width: 5),
            ],
          ],
        ),
      ],
    );
  }
}
