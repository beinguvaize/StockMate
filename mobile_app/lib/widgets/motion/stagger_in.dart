import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'motion_curves.dart';

const _kKey = 'motion.dashboard.lastSeen';

/// Item 13: whether the dashboard entrance should play. True only for the
/// first open of the day; marks today seen. Any storage failure -> false
/// (instant, never block the screen).
Future<bool> claimFirstOpenToday({DateTime? now}) async {
  try {
    final p = await SharedPreferences.getInstance();
    final n = now ?? DateTime.now();
    if (!isFirstOpenToday(p.getString(_kKey), n)) return false;
    await p.setString(_kKey, firstOpenStamp(n));
    return true;
  } catch (_) {
    return false;
  }
}

/// Wrap each dashboard card: opacity 0->1 + translateY(8)->0, 300ms, 60ms
/// stagger by [index]. While [pending] (storage not read yet) the child is
/// held invisible; once resolved it either animates ([play]) or snaps in.
class StaggerIn extends StatefulWidget {
  final bool pending;
  final bool play;
  final int index;
  final Widget child;
  const StaggerIn({
    super.key,
    required this.play,
    required this.index,
    required this.child,
    this.pending = false,
  });
  @override
  State<StaggerIn> createState() => _StaggerInState();
}

class _StaggerInState extends State<StaggerIn> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
      value: (widget.pending || widget.play) ? 0 : 1);

  @override
  void initState() {
    super.initState();
    if (!widget.pending && widget.play) _start();
  }

  @override
  void didUpdateWidget(StaggerIn old) {
    super.didUpdateWidget(old);
    if (old.pending && !widget.pending) {
      if (widget.play) {
        _start();
      } else {
        _c.value = 1;
      }
    }
  }

  void _start() {
    Future.delayed(Duration(milliseconds: 60 * widget.index), () {
      if (!mounted) return;
      if (MediaQuery.maybeDisableAnimationsOf(context) == true) {
        _c.value = 1;
      } else {
        _c.forward();
      }
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, c) {
          if (_c.value == 1) return c!;
          final t = MotionCurves.out.transform(_c.value);
          return Opacity(
              opacity: t, child: Transform.translate(offset: Offset(0, 8 * (1 - t)), child: c));
        },
        child: widget.child,
      );
}
