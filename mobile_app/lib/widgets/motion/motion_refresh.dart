import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'motion_curves.dart';

/// Item 12: pull-to-refresh. Pull distance is sqrt-damped, the arrow rotates
/// 180deg at the threshold, a spinner runs while [onRefresh] is pending, then
/// the content settles back over 400ms on the drawer curve.
/// Child must be a scrollable using the ambient (bouncing) physics, or
/// AlwaysScrollableScrollPhysics.
class MotionRefresh extends StatefulWidget {
  final Future<void> Function() onRefresh;
  final Widget child;
  const MotionRefresh({super.key, required this.onRefresh, required this.child});
  @override
  State<MotionRefresh> createState() => _MotionRefreshState();
}

class _MotionRefreshState extends State<MotionRefresh> {
  static const _threshold = 64.0;
  double _pull = 0; // damped, px
  bool _refreshing = false;
  bool _settling = false;

  bool _onScroll(ScrollNotification n) {
    if (_refreshing || n.depth != 0) return false;
    final px = n.metrics.pixels;
    if (n is ScrollUpdateNotification || n is OverscrollNotification) {
      if (px < 0) {
        setState(() {
          _settling = false;
          _pull = math.sqrt(-px) * 7;
        });
      }
    } else if (n is ScrollEndNotification) {
      if (_pull >= _threshold) {
        _run();
      } else if (_pull > 0) {
        _settle();
      }
    }
    return false;
  }

  void _settle() => setState(() {
        _settling = true;
        _pull = 0;
      });

  Future<void> _run() async {
    HapticFeedback.selectionClick();
    setState(() {
      _refreshing = true;
      _settling = true;
      _pull = _threshold;
    });
    try {
      await widget.onRefresh();
    } finally {
      if (mounted) {
        setState(() => _refreshing = false);
        _settle();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final armed = _pull >= _threshold;
    return Stack(
      children: [
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: SizedBox(
            height: _threshold,
            child: Center(
              child: Opacity(
                opacity: (_pull / _threshold).clamp(0.0, 1.0),
                child: _refreshing
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : AnimatedRotation(
                        turns: armed ? 0.5 : 0,
                        duration: motionDur(context, 200),
                        curve: MotionCurves.out,
                        child: const Icon(Icons.arrow_downward_rounded, size: 22),
                      ),
              ),
            ),
          ),
        ),
        AnimatedPadding(
          duration: _settling ? motionDur(context, 400) : Duration.zero,
          curve: MotionCurves.drawer,
          padding: EdgeInsets.only(top: _refreshing ? _threshold : (_settling ? 0 : 0)),
          child: NotificationListener<ScrollNotification>(
            onNotification: _onScroll,
            child: widget.child,
          ),
        ),
      ],
    );
  }
}
