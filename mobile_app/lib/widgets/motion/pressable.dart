import 'package:flutter/widgets.dart';
import 'motion_curves.dart';

/// Item 1: wraps any button; scales to 0.97 while a pointer is down (160ms).
/// Listener-based so it never steals the child's own tap handling.
class Pressable extends StatefulWidget {
  final Widget child;
  final bool enabled;
  const Pressable({super.key, required this.child, this.enabled = true});
  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;
  void _set(bool v) {
    if (_down != v && mounted) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) => Listener(
        onPointerDown: (_) => _set(widget.enabled),
        onPointerUp: (_) => _set(false),
        onPointerCancel: (_) => _set(false),
        child: AnimatedScale(
          scale: _down ? 0.97 : 1,
          duration: motionDur(context, 160),
          curve: MotionCurves.out,
          child: widget.child,
        ),
      );
}
