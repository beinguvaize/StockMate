import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/colors.dart';
import '../theme/dimens.dart';

/// The green tick that confirms money moved.
///
/// It draws rather than fades: the ring sweeps closed, then the check is
/// stroked on in one gesture. A cashier standing over the counter reads a
/// drawn tick as "that just happened"; a static icon that was already there
/// when the sheet opened reads as part of the furniture.
///
/// Timing is deliberately short. The whole thing lands in 520ms, because it
/// sits between the cashier and the next customer -- an animation the till
/// waits on is a queue.
class SuccessTick extends StatefulWidget {
  final double size;

  /// Green by default. A confirmation is the one place a status colour is the
  /// whole point, so this is not the accent.
  final Color color;

  const SuccessTick({super.key, this.size = 64, this.color = AppColors.success});

  @override
  State<SuccessTick> createState() => _SuccessTickState();
}

class _SuccessTickState extends State<SuccessTick>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this);

  late final Animation<double> _ring = CurvedAnimation(
    parent: _c,
    curve: const Interval(0, 0.45, curve: Curves.easeOutCubic),
  );
  late final Animation<double> _check = CurvedAnimation(
    parent: _c,
    curve: const Interval(0.35, 0.8, curve: Curves.easeOutCubic),
  );
  late final Animation<double> _pop = CurvedAnimation(
    parent: _c,
    curve: const Interval(0.3, 1, curve: Curves.easeOutBack),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_c.duration == null) {
      // Collapses to a single frame when the OS asks for reduced motion, so
      // the tick simply IS there rather than travelling.
      _c.duration =
          Motion.durationOf(context, const Duration(milliseconds: 520));
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, _) => CustomPaint(
          painter: _TickPainter(
            ring: _ring.value,
            check: _check.value,
            pop: _pop.value,
            color: widget.color,
          ),
        ),
      ),
    );
  }
}

class _TickPainter extends CustomPainter {
  final double ring;
  final double check;
  final double pop;
  final Color color;

  _TickPainter({
    required this.ring,
    required this.check,
    required this.pop,
    required this.color,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2;

    // The soft disc behind it, scaled in slightly after the ring starts so the
    // two do not arrive as one flat shape.
    if (pop > 0) {
      canvas.drawCircle(
        c,
        r * pop,
        Paint()..color = color.withValues(alpha: 0.12),
      );
    }

    final stroke = math.max(2.0, size.width * 0.055);

    // Ring, swept from the top.
    if (ring > 0) {
      canvas.drawArc(
        Rect.fromCircle(center: c, radius: r - stroke / 2),
        -math.pi / 2,
        2 * math.pi * ring,
        false,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round,
      );
    }

    // Check, stroked along its own length rather than faded in.
    if (check > 0) {
      final p1 = Offset(size.width * 0.30, size.height * 0.52);
      final p2 = Offset(size.width * 0.44, size.height * 0.66);
      final p3 = Offset(size.width * 0.71, size.height * 0.37);

      final firstLeg = (p2 - p1).distance;
      final secondLeg = (p3 - p2).distance;
      final total = firstLeg + secondLeg;
      final drawn = total * check;

      final path = Path()..moveTo(p1.dx, p1.dy);
      if (drawn <= firstLeg) {
        final t = firstLeg == 0 ? 0.0 : drawn / firstLeg;
        path.lineTo(p1.dx + (p2.dx - p1.dx) * t, p1.dy + (p2.dy - p1.dy) * t);
      } else {
        path.lineTo(p2.dx, p2.dy);
        final t = secondLeg == 0 ? 0.0 : (drawn - firstLeg) / secondLeg;
        path.lineTo(p2.dx + (p3.dx - p2.dx) * t, p2.dy + (p3.dy - p2.dy) * t);
      }

      canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
    }
  }

  @override
  bool shouldRepaint(_TickPainter old) =>
      old.ring != ring || old.check != check || old.pop != pop;
}
