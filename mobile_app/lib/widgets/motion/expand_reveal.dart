import 'package:flutter/material.dart';
import 'motion_curves.dart';

/// Item 9: height reveal 260ms ease-out; content fades + rises 4px with an
/// 80ms delay. Pair with [ExpandChevron].
class ExpandReveal extends StatelessWidget {
  final bool expanded;
  final Widget child;
  const ExpandReveal({super.key, required this.expanded, required this.child});
  @override
  Widget build(BuildContext context) {
    final d = motionDur(context, 260);
    return TweenAnimationBuilder<double>(
      tween: Tween(end: expanded ? 1 : 0),
      duration: d,
      curve: MotionCurves.out,
      builder: (_, t, c) => ClipRect(
        child: Align(alignment: Alignment.topCenter, heightFactor: t, child: c),
      ),
      child: TweenAnimationBuilder<double>(
        tween: Tween(end: expanded ? 1 : 0),
        duration: d + (expanded ? const Duration(milliseconds: 80) : Duration.zero),
        curve: Interval(expanded ? 0.235 : 0, 1, curve: MotionCurves.out),
        builder: (_, t, c) => Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(0, -4 * (1 - t)), child: c),
        ),
        child: child,
      ),
    );
  }
}

class ExpandChevron extends StatelessWidget {
  final bool expanded;
  final Color? color;
  const ExpandChevron({super.key, required this.expanded, this.color});
  @override
  Widget build(BuildContext context) => AnimatedRotation(
        turns: expanded ? 0.25 : 0,
        duration: motionDur(context, 220),
        curve: MotionCurves.out,
        child: Icon(Icons.chevron_right_rounded, color: color),
      );
}
