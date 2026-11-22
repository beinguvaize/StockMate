import 'package:flutter/material.dart';
import 'motion_curves.dart';

/// Item 5: hold to confirm a destructive action (void/delete bill). A fill
/// sweeps left->right over 1.5s linearly while held; release snaps back in
/// 200ms. [onComplete] fires only when the fill completes.
class HoldButton extends StatefulWidget {
  final Widget child;
  final VoidCallback onComplete;
  final Color fillColor;
  final BorderRadius borderRadius;
  final Duration holdDuration;
  const HoldButton({
    super.key,
    required this.child,
    required this.onComplete,
    this.fillColor = const Color(0x33B3261E),
    this.borderRadius = const BorderRadius.all(Radius.circular(10)),
    this.holdDuration = const Duration(milliseconds: 1500),
  });
  @override
  State<HoldButton> createState() => _HoldButtonState();
}

class _HoldButtonState extends State<HoldButton> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: widget.holdDuration)
        ..addStatusListener((s) {
          if (s == AnimationStatus.completed) {
            widget.onComplete();
            _c.value = 0;
          }
        });

  void _down() => _c.forward();
  void _up() {
    if (_c.status == AnimationStatus.completed) return;
    _c.animateBack(0,
        duration: motionDur(context, 200), curve: MotionCurves.out);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        hint: 'Press and hold to confirm',
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (_) => _down(),
          onTapUp: (_) => _up(),
          onTapCancel: _up,
          child: ClipRRect(
            borderRadius: widget.borderRadius,
            child: Stack(
              children: [
                Positioned.fill(
                  child: AnimatedBuilder(
                    animation: _c,
                    builder: (_, __) => ClipRect(
                      clipper: _InsetClipper(_c.value),
                      child: ColoredBox(color: widget.fillColor),
                    ),
                  ),
                ),
                widget.child,
              ],
            ),
          ),
        ),
      );
}

class _InsetClipper extends CustomClipper<Rect> {
  final double f;
  _InsetClipper(this.f);
  @override
  Rect getClip(Size s) => Rect.fromLTWH(0, 0, s.width * f, s.height);
  @override
  bool shouldReclip(_InsetClipper o) => o.f != f;
}
