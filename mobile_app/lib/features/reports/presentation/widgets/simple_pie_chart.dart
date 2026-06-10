import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/theme/colors.dart';

class PieSlice {
  final String label;
  final double value;
  final Color color;

  const PieSlice({
    required this.label,
    required this.value,
    required this.color,
  });
}

class SimplePieChart extends StatelessWidget {
  final List<PieSlice> slices;
  final double size;

  const SimplePieChart({
    super.key,
    required this.slices,
    this.size = 150,
  });

  @override
  Widget build(BuildContext context) {
    final total = slices.fold(0.0, (sum, s) => sum + s.value);

    if (total == 0 || slices.isEmpty) {
      return SizedBox(
        width: size,
        height: size,
        child: Center(
          child: Text(
            'No data',
            style: GoogleFonts.manrope(color: AppColors.inkSecondary, fontSize: 12),
          ),
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CustomPaint(
          size: Size(size, size),
          painter: _PiePainter(slices: slices, total: total),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 6,
          alignment: WrapAlignment.center,
          children: slices.map((slice) {
            final pct = (slice.value / total * 100).toStringAsFixed(1);
            return Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: slice.color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 4),
                Text(
                  '${slice.label} $pct%',
                  style: GoogleFonts.manrope(
                    fontSize: 10,
                    color: AppColors.inkSecondary,
                  ),
                ),
              ],
            );
          }).toList(),
        ),
      ],
    );
  }
}

class _PiePainter extends CustomPainter {
  final List<PieSlice> slices;
  final double total;

  const _PiePainter({required this.slices, required this.total});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2;
    final paint = Paint()..style = PaintingStyle.fill;

    double startAngle = -math.pi / 2; // Start from top

    for (final slice in slices) {
      final sweepAngle = (slice.value / total) * 2 * math.pi;
      paint.color = slice.color;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweepAngle,
        true,
        paint,
      );
      startAngle += sweepAngle;
    }

    // White center hole for donut effect
    paint.color = Colors.white;
    canvas.drawCircle(center, radius * 0.55, paint);
  }

  @override
  bool shouldRepaint(_PiePainter old) =>
      old.slices != slices || old.total != total;
}
