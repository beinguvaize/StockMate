import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/theme/colors.dart';

class BarData {
  final String label;
  final double value;
  final Color color;

  const BarData({
    required this.label,
    required this.value,
    required this.color,
  });
}

class SimpleBarChart extends StatelessWidget {
  final List<BarData> bars;
  final double height;

  const SimpleBarChart({
    super.key,
    required this.bars,
    this.height = 120,
  });

  @override
  Widget build(BuildContext context) {
    if (bars.isEmpty) {
      return SizedBox(
        height: height,
        child: Center(
          child: Text(
            'No data',
            style: GoogleFonts.inter(color: AppColors.inkSecondary, fontSize: 12),
          ),
        ),
      );
    }

    final maxValue = bars.map((b) => b.value).reduce((a, b) => a > b ? a : b);

    return SizedBox(
      height: height,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: bars.map((bar) {
          final ratio = maxValue > 0 ? (bar.value / maxValue) : 0.0;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                SizedBox(
                  width: 40,
                  child: Text(
                    bar.label,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 10,
                      color: AppColors.inkSecondary,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      return Row(
                        children: [
                          Container(
                            width: constraints.maxWidth * ratio,
                            height: 14,
                            decoration: BoxDecoration(
                              color: bar.color,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            bar.value >= 1e7
                                ? '${(bar.value / 1e7).toStringAsFixed(1)}Cr'
                                : bar.value >= 1e5
                                    ? '${(bar.value / 1e5).toStringAsFixed(1)}L'
                                    : bar.value >= 1e3
                                        ? '${(bar.value / 1e3).toStringAsFixed(1)}K'
                                        : bar.value.toStringAsFixed(0),
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 9,
                              fontWeight: FontWeight.w600,
                              color: AppColors.inkPrimary,
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}
