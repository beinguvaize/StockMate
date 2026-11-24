import 'dart:async';
import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'motion_curves.dart';

/// Item 8: copy icon crossfades to a check (scale 0.25->1, blur 4->0, 300ms),
/// back after 1.6s. The check is the static cue as well.
class CopyButton extends StatefulWidget {
  final String text;
  final double size;
  final Color color;
  const CopyButton({super.key, required this.text, this.size = 18, this.color = const Color(0xFF444444)});
  @override
  State<CopyButton> createState() => _CopyButtonState();
}

class _CopyButtonState extends State<CopyButton> {
  bool _copied = false;
  Timer? _t;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.text));
    if (!mounted) return;
    setState(() => _copied = true);
    _t?.cancel();
    _t = Timer(const Duration(milliseconds: 1600), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: _copied ? 'Copied' : 'Copy',
        onPressed: _copy,
        icon: AnimatedSwitcher(
          duration: motionDur(context, 300),
          switchInCurve: MotionCurves.out,
          transitionBuilder: (c, a) => FadeTransition(
            opacity: a,
            child: ScaleTransition(
              scale: Tween<double>(begin: 0.25, end: 1).animate(a),
              child: AnimatedBuilder(
                animation: a,
                builder: (_, ch) => ImageFiltered(
                    imageFilter: ImageFilter.blur(
                        sigmaX: 4 * (1 - a.value), sigmaY: 4 * (1 - a.value)),
                    child: ch),
                child: c,
              ),
            ),
          ),
          child: Icon(
            _copied ? Icons.check_rounded : Icons.copy_rounded,
            key: ValueKey(_copied),
            size: widget.size,
            color: _copied ? const Color(0xFF1E8E5A) : widget.color,
          ),
        ),
      );
}
