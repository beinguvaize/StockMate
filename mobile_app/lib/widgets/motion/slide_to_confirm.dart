import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/features/dashboard/presentation/widgets/dash_common.dart';
import 'package:mobile_app/widgets/motion/save_button.dart';

/// "Slide to ...": the last step of anything that moves money or cannot be
/// undone takes a deliberate slide rather than a tap. Shows the real save
/// state in place. Screen readers reach it as an ordinary button.
class SlideToConfirm extends StatefulWidget {
  final String label;
  final String semanticsLabel;
  /// False greys the control out and ignores the slide.
  final bool enabled;
  final SaveStatus status;
  final String? errorText;
  final VoidCallback onComplete;
  const SlideToConfirm({
    super.key,
    required this.label,
    required this.semanticsLabel,
    this.enabled = true,
    required this.status,
    required this.errorText,
    required this.onComplete,
  });

  @override
  State<SlideToConfirm> createState() => _SlideToConfirmState();
}

class _SlideToConfirmState extends State<SlideToConfirm> {
  static const _h = 52.0;
  static const _thumbW = 64.0;
  double _dx = 0;
  bool _dragging = false;

  bool get _idle => widget.status == SaveStatus.idle;
  bool get _live => _idle && widget.enabled;

  @override
  void didUpdateWidget(covariant SlideToConfirm old) {
    super.didUpdateWidget(old);
    // Back to idle after a save or a failure: the thumb returns to the start.
    if (old.status != SaveStatus.idle && _idle) _dx = 0;
  }

  void _fire() {
    if (!_live) return;
    HapticFeedback.mediumImpact();
    widget.onComplete();
    // If nothing started (the sale was refused before saving), let go.
    Future.delayed(const Duration(milliseconds: 700), () {
      if (mounted && _idle) setState(() => _dx = 0);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_idle) {
      final saved = widget.status == SaveStatus.saved;
      final err = widget.status == SaveStatus.error;
      final bg = saved
          ? const Color(0xFF1E8E5A)
          : err
              ? const Color(0xFFB3261E)
              : DashColors.well;
      final fg = (saved || err) ? Colors.white : DashColors.ink;
      return Container(
        constraints: const BoxConstraints(minHeight: _h),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        alignment: Alignment.center,
        decoration: BoxDecoration(
            color: bg, borderRadius: BorderRadius.circular(999)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (saved)
              Icon(Icons.check_rounded, size: 20, color: fg)
            else if (err)
              Icon(Icons.close_rounded, size: 20, color: fg)
            else
              SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: fg)),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                saved
                    ? 'Saved'
                    : err
                        ? (widget.errorText ?? 'Failed')
                        : 'Saving',
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: DashText.tight(15, w: FontWeight.w600, c: fg, ls: 0),
              ),
            ),
          ],
        ),
      );
    }

    return Semantics(
      button: true,
      label: widget.semanticsLabel,
      enabled: widget.enabled,
      onTap: _fire,
      child: LayoutBuilder(builder: (context, box) {
        final max = (box.maxWidth - _thumbW - 8).clamp(0.0, double.infinity);
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onHorizontalDragStart: (_) => setState(() => _dragging = true),
          onHorizontalDragUpdate: (d) {
            if (!_live) return;
            setState(() => _dx = (_dx + d.delta.dx).clamp(0.0, max));
          },
          onHorizontalDragEnd: (_) {
            final done = max > 0 && _dx >= max * 0.85;
            setState(() {
              _dragging = false;
              _dx = done ? max : 0;
            });
            if (done) _fire();
          },
          child: Opacity(
            opacity: widget.enabled ? 1 : 0.45,
            child: Container(
            height: _h,
            decoration: BoxDecoration(
              color: DashColors.well,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Padding(
                  padding: const EdgeInsets.only(left: 58),
                  child: Opacity(
                    opacity: max > 0 ? (1 - _dx / max).clamp(0.0, 1.0) : 1,
                    child: Text(widget.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: DashText.tight(14.5,
                            w: FontWeight.w600, c: DashColors.mute, ls: 0)),
                  ),
                ),
                AnimatedPositioned(
                  duration: _dragging
                      ? Duration.zero
                      : Motion.durationOf(
                          context, const Duration(milliseconds: 200)),
                  left: 4 + _dx,
                  top: 4,
                  child: Container(
                    width: _thumbW,
                    height: _h - 8,
                    decoration: BoxDecoration(
                      color: DashColors.amber,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: const [
                        BoxShadow(
                            color: Color(0x99B45309),
                            blurRadius: 14,
                            spreadRadius: -6,
                            offset: Offset(0, 6)),
                      ],
                    ),
                    child: const Icon(LucideIcons.chevronsRight,
                        size: 22, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
          ),
        );
      }),
    );
  }
}
