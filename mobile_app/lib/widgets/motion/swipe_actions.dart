import 'package:flutter/material.dart';
import 'motion_curves.dart';

/// Item 11: drag a row left to reveal [actions] (e.g. Call + Collect).
/// Snaps open past half or on a fast leftward fling (<-0.11 px/ms); friction
/// (sqrt damping) beyond the bounds; 300ms drawer curve. Taps still reach the
/// child; a tap while open closes the row.
class SwipeActions extends StatefulWidget {
  final Widget child;
  final List<Widget> actions;
  final double openWidth;

  /// Slides the row open and shut once after it appears, to show that it
  /// can be swiped.
  final bool peek;

  /// Called the first time the user swipes the row themselves.
  final VoidCallback? onSwiped;

  const SwipeActions({
    super.key,
    required this.child,
    required this.actions,
    this.openWidth = 160,
    this.peek = false,
    this.onSwiped,
  });
  @override
  State<SwipeActions> createState() => _SwipeActionsState();
}

class _SwipeActionsState extends State<SwipeActions> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this);
  double _dx = 0; // <= 0
  late Animation<double> _anim;

  void _animateTo(double target) {
    final from = _dx;
    _c.duration = motionDur(context, 300);
    _anim = Tween<double>(begin: from, end: target)
        .animate(CurvedAnimation(parent: _c, curve: MotionCurves.drawer))
      ..addListener(() => setState(() => _dx = _anim.value));
    _c.forward(from: 0);
  }

  bool _userSwiped = false;

  @override
  void initState() {
    super.initState();
    if (widget.peek) _runPeek();
  }

  Future<void> _runPeek() async {
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted || _userSwiped) return;
    if (MediaQuery.maybeDisableAnimationsOf(context) == true) return;
    _animateTo(-widget.openWidth);
    await Future<void>.delayed(const Duration(milliseconds: 1500));
    if (!mounted || _userSwiped) return;
    _animateTo(0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _update(DragUpdateDetails d) {
    if (!_userSwiped) {
      _userSwiped = true;
      widget.onSwiped?.call();
    }
    _c.stop();
    var raw = _dx + d.delta.dx;
    if (raw > 0) raw = 0; // no right overscroll
    final over = -raw - widget.openWidth;
    if (over > 0) {
      raw = -(widget.openWidth + dampedOffset(over, 0));
    }
    setState(() => _dx = raw);
  }

  void _end(DragEndDetails d) {
    final v = d.velocity.pixelsPerSecond.dx / 1000; // px/ms
    final open = swipeShouldSnapOpen(_dx, v, widget.openWidth);
    _animateTo(open ? -widget.openWidth : 0);
  }

  @override
  Widget build(BuildContext context) => ClipRect(
        child: Stack(
          children: [
            Positioned.fill(
              child: Align(
                alignment: Alignment.centerRight,
                child: SizedBox(
                  width: widget.openWidth,
                  child: Row(children: [for (final a in widget.actions) Expanded(child: a)]),
                ),
              ),
            ),
            GestureDetector(
              onHorizontalDragUpdate: _update,
              onHorizontalDragEnd: _end,
              onTap: _dx < -1 ? () => _animateTo(0) : null,
              child: Transform.translate(
                offset: Offset(_dx, 0),
                child: ColoredBox(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  child: widget.child,
                ),
              ),
            ),
          ],
        ),
      );
}
