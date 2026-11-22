import 'dart:ui' show FontFeature, ImageFilter;
import 'package:flutter/widgets.dart';
import 'motion_curves.dart';

/// Item 3: text where only the changed characters slide up (70%->0) with a
/// 2px blur fade-in, 260ms. Tabular figures keep widths stable.
class RollingNumber extends StatefulWidget {
  final String text;
  final TextStyle style;
  const RollingNumber({super.key, required this.text, required this.style});
  @override
  State<RollingNumber> createState() => _RollingNumberState();
}

class _RollingNumberState extends State<RollingNumber>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 260), value: 1);
  Set<int> _changed = {};

  @override
  void didUpdateWidget(RollingNumber old) {
    super.didUpdateWidget(old);
    if (old.text != widget.text) {
      _changed = changedDigitIndexes(old.text, widget.text);
      if (MediaQuery.maybeDisableAnimationsOf(context) == true) {
        _c.value = 1;
      } else {
        _c.forward(from: 0);
      }
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final style = widget.style.copyWith(
        fontFeatures: const [FontFeature.tabularFigures()]);
    final chars = widget.text.split('');
    return Semantics(
      label: widget.text,
      excludeSemantics: true,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, __) {
          final t = MotionCurves.out.transform(_c.value);
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < chars.length; i++)
                if (_changed.contains(i) && t < 1)
                  Opacity(
                    opacity: t,
                    child: ImageFiltered(
                      imageFilter: ImageFilter.blur(
                          sigmaX: 2 * (1 - t), sigmaY: 2 * (1 - t)),
                      child: Transform.translate(
                        offset: Offset(0, (style.fontSize ?? 14) * 0.7 * (1 - t)),
                        child: Text(chars[i], style: style),
                      ),
                    ),
                  )
                else
                  Text(chars[i], style: style),
            ],
          );
        },
      ),
    );
  }
}
