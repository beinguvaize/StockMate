import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'motion_curves.dart';
import 'pressable.dart';

enum SaveStatus { idle, saving, saved, error }

/// Item 2: idle -> spinner "Saving" -> tick "Saved" -> idle. Reflects the REAL
/// [status] only; on error shows [errorText] (the real reason) with a cross.
/// After [SaveStatus.saved]/[SaveStatus.error] the parent resets to idle.
class SaveButton extends StatelessWidget {
  final SaveStatus status;
  final String idleLabel;
  final IconData? idleIcon;
  final String? errorText;
  final VoidCallback? onPressed;
  final Color background;
  final Color foreground;
  final Color successColor;
  final EdgeInsetsGeometry padding;
  final TextStyle? textStyle;

  const SaveButton({
    super.key,
    required this.status,
    required this.idleLabel,
    required this.onPressed,
    this.idleIcon,
    this.errorText,
    required this.background,
    required this.foreground,
    this.successColor = const Color(0xFF1E8E5A),
    this.padding = const EdgeInsets.symmetric(vertical: 18),
    this.textStyle,
    this.shape = const StadiumBorder(),
  });
  final OutlinedBorder shape;

  @override
  Widget build(BuildContext context) {
    final saved = status == SaveStatus.saved;
    final err = status == SaveStatus.error;
    final bg = saved ? successColor : (err ? const Color(0xFFB3261E) : background);
    final fg = (saved || err) ? Colors.white : foreground;
    final label = switch (status) {
      SaveStatus.idle => idleLabel,
      SaveStatus.saving => 'Saving',
      SaveStatus.saved => 'Saved',
      SaveStatus.error => errorText ?? 'Failed',
    };
    final icon = switch (status) {
      SaveStatus.idle => idleIcon == null ? null : Icon(idleIcon, size: 18),
      SaveStatus.saving => SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2, color: fg)),
      SaveStatus.saved => const Icon(Icons.check_rounded, size: 20),
      SaveStatus.error => const Icon(Icons.close_rounded, size: 20),
    };
    final d = motionDur(context, 180);
    return Pressable(
      enabled: status == SaveStatus.idle,
      child: AnimatedContainer(
        duration: d,
        curve: MotionCurves.out,
        decoration: ShapeDecoration(color: bg, shape: shape),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            customBorder: shape,
            onTap: (status == SaveStatus.idle) ? onPressed : null,
            child: Padding(
              padding: padding,
              child: DefaultTextStyle(
                style: (textStyle ?? const TextStyle(fontWeight: FontWeight.w700))
                    .copyWith(color: fg),
                child: IconTheme(
                  data: IconThemeData(color: fg),
                  child: AnimatedSwitcher(
                    duration: d,
                    switchInCurve: MotionCurves.out,
                    transitionBuilder: (child, a) => FadeTransition(
                      opacity: a,
                      child: AnimatedBuilder(
                        animation: a,
                        builder: (_, c) => ImageFiltered(
                          imageFilter: ImageFilter.blur(
                              sigmaX: 2 * (1 - a.value), sigmaY: 2 * (1 - a.value)),
                          child: c,
                        ),
                        child: child,
                      ),
                    ),
                    child: Row(
                      key: ValueKey(status),
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (icon != null) ...[icon, const SizedBox(width: 8)],
                        Flexible(
                            child: Text(label,
                                maxLines: 2,
                                textAlign: TextAlign.center,
                                overflow: TextOverflow.ellipsis)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
