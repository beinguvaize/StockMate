import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'motion_curves.dart';

/// Item 7: error text reveals via height (200ms); [trigger] bump shakes the
/// wrapped field 4px once (300ms). Message must state the exact problem.
class ShakeOnError extends StatefulWidget {
  final Widget child;
  final int trigger; // increment to shake
  const ShakeOnError({super.key, required this.child, required this.trigger});
  @override
  State<ShakeOnError> createState() => _ShakeOnErrorState();
}

class _ShakeOnErrorState extends State<ShakeOnError> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 300));
  @override
  void didUpdateWidget(ShakeOnError o) {
    super.didUpdateWidget(o);
    if (o.trigger != widget.trigger && MediaQuery.maybeDisableAnimationsOf(context) != true) {
      _c.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, c) => Transform.translate(
            offset: Offset(shakeOffset(_c.value), 0), child: c),
        child: widget.child,
      );
}

/// 4px damped shake: 3 full waves over t in [0,1].
double shakeOffset(double t) =>
    (t <= 0 || t >= 1) ? 0 : 4 * (1 - t) * math.sin(t * 6 * math.pi);

class FieldErrorText extends StatelessWidget {
  final String? message;
  const FieldErrorText({super.key, required this.message});
  @override
  Widget build(BuildContext context) => AnimatedSize(
        duration: motionDur(context, 200),
        curve: MotionCurves.out,
        alignment: Alignment.topLeft,
        child: message == null
            ? const SizedBox(width: double.infinity)
            : Padding(
                padding: const EdgeInsets.only(top: 4, left: 4),
                child: Text(message!,
                    style: const TextStyle(color: Color(0xFFB3261E), fontSize: 12)),
              ),
      );
}
