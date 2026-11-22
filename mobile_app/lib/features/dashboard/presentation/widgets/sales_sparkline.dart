import 'package:flutter/material.dart';

import '../dashboard_logic.dart';
import 'dash_common.dart';

/// Running total of today's sales on a 9 am - 9 pm axis: amber line, soft
/// amber fill, endpoint dot, faint baseline. Hidden when nothing was sold.
class SalesSparkline extends StatelessWidget {
  final List<double> hourly;
  final DateTime now;
  const SalesSparkline({super.key, required this.hourly, required this.now});

  static const _labels = ['9 am', '12', '3 pm', '6', '9 pm'];

  @override
  Widget build(BuildContext context) {
    final pts = cumulativePoints(hourly, now);
    if (pts.length < 2) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: SizedBox(
              height: 70,
              width: double.infinity,
              child: CustomPaint(painter: _SparkPainter(pts)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 2, 20, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final l in _labels)
                  Text(l,
                      style: DashText.inter(10.5, c: DashColors.faint)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<Offset> pts; // x 0..1, y rupees
  const _SparkPainter(this.pts);

  @override
  void paint(Canvas canvas, Size size) {
    const topPad = 8.0, dotR = 4.5;
    final h = size.height - 1;
    final maxY = pts.fold<double>(0, (m, p) => p.dy > m ? p.dy : m);
    if (maxY <= 0) return;
    // Leave room for the end dot on the right edge.
    final w = size.width - dotR - 1.5;
    final o = [
      for (final p in pts)
        Offset(p.dx * w, h - (p.dy / maxY) * (h - topPad)),
    ];

    canvas.drawLine(Offset(0, h), Offset(size.width, h),
        Paint()..color = const Color(0xFFE6E4E0));

    final line = Path()..moveTo(o.first.dx, o.first.dy);
    for (var i = 1; i < o.length; i++) {
      final a = o[i - 1], b = o[i];
      final mx = (a.dx + b.dx) / 2;
      line.cubicTo(mx, a.dy, mx, b.dy, b.dx, b.dy);
    }
    final fill = Path.from(line)
      ..lineTo(o.last.dx, size.height)
      ..lineTo(o.first.dx, size.height)
      ..close();
    canvas.drawPath(
      fill,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x38E8890C), Color(0x00E8890C)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      line,
      Paint()
        ..color = DashColors.amber
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(o.last, dotR, Paint()..color = Colors.white);
    canvas.drawCircle(
        o.last,
        dotR - 1.25,
        Paint()
          ..color = DashColors.amber
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5);
  }

  @override
  bool shouldRepaint(_SparkPainter old) => old.pts != pts;
}
