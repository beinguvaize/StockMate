import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/dimens.dart';

/// The app's button.
///
/// Replaces 21 bespoke `GestureDetector` + `Container` button classes (four of
/// which were separately-written copies of the same stepper) and the ad-hoc
/// `styleFrom` overrides scattered across the Material buttons.
///
/// Two things it fixes beyond looks:
///
///  * **Press feedback.** `onTapDown`/`onTapUp` appeared nowhere in the
///    codebase, so 116 GestureDetector buttons — including the dashboard's
///    main tab bar — gave no response to touch at all. This scales to 0.97 on
///    press and carries a ripple.
///  * **Double-tap during async work.** Only 19 of ~260 buttons had any
///    disabled state. Passing [loading] blocks the callback and shows a
///    spinner, so a slow save cannot be fired twice.
enum AppButtonVariant { primary, secondary, ghost, danger }

enum AppButtonSize { small, medium, large }

class AppButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final IconData? icon;

  /// Shows a spinner and blocks taps. Use for the duration of an async action.
  final bool loading;

  /// Stretch to the width of the parent.
  final bool fullWidth;

  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.medium,
    this.icon,
    this.loading = false,
    this.fullWidth = false,
  });

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _pressed = false;

  bool get _enabled => widget.onPressed != null && !widget.loading;

  double get _height => switch (widget.size) {
        AppButtonSize.small => 36,
        AppButtonSize.medium => 44,
        AppButtonSize.large => 52,
      };

  double get _fontSize => switch (widget.size) {
        AppButtonSize.small => 13,
        AppButtonSize.medium => 14,
        AppButtonSize.large => 15,
      };

  EdgeInsets get _padding => switch (widget.size) {
        AppButtonSize.small => const EdgeInsets.symmetric(horizontal: Gap.md),
        AppButtonSize.medium => const EdgeInsets.symmetric(horizontal: Gap.lg),
        AppButtonSize.large => const EdgeInsets.symmetric(horizontal: Gap.xl),
      };

  // Only pairings verified by tool/check_contrast.mjs.
  Color get _bg => switch (widget.variant) {
        AppButtonVariant.primary => AppColors.primary,
        AppButtonVariant.secondary => AppColors.canvas,
        AppButtonVariant.ghost => Colors.transparent,
        AppButtonVariant.danger => AppColors.error,
      };

  Color get _fg => switch (widget.variant) {
        AppButtonVariant.primary => AppColors.onPrimary,
        AppButtonVariant.secondary => AppColors.onSurface,
        AppButtonVariant.ghost => AppColors.primary,
        AppButtonVariant.danger => AppColors.onPrimary,
      };

  Color? get _border => switch (widget.variant) {
        AppButtonVariant.secondary => AppColors.outline,
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    final fg = _enabled ? _fg : _fg.withValues(alpha: 0.45);
    final bg = _enabled ? _bg : _bg.withValues(alpha: 0.5);

    return Semantics(
      button: true,
      enabled: _enabled,
      label: widget.label,
      child: AnimatedScale(
        // The press response the app has never had.
        scale: _pressed ? 0.97 : 1.0,
        duration: Motion.fast,
        curve: Motion.standard,
        child: Material(
          color: bg,
          borderRadius: Radii.rMd,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: _enabled ? widget.onPressed : null,
            onTapDown: _enabled ? (_) => setState(() => _pressed = true) : null,
            onTapUp: _enabled ? (_) => setState(() => _pressed = false) : null,
            onTapCancel: _enabled ? () => setState(() => _pressed = false) : null,
            splashColor: fg.withValues(alpha: 0.12),
            highlightColor: fg.withValues(alpha: 0.06),
            child: Container(
              height: _height,
              width: widget.fullWidth ? double.infinity : null,
              padding: _padding,
              decoration: BoxDecoration(
                borderRadius: Radii.rMd,
                border: _border == null
                    ? null
                    : Border.all(color: _enabled ? _border! : AppColors.outlineVariant),
              ),
              child: Row(
                mainAxisSize: widget.fullWidth ? MainAxisSize.max : MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (widget.loading) ...[
                    SizedBox(
                      width: _fontSize,
                      height: _fontSize,
                      child: CircularProgressIndicator(strokeWidth: 2, color: fg),
                    ),
                    Gap.w8,
                  ] else if (widget.icon != null) ...[
                    Icon(widget.icon, size: _fontSize + 3, color: fg),
                    Gap.w8,
                  ],
                  Flexible(
                    child: Text(
                      widget.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        fontSize: _fontSize,
                        fontWeight: FontWeight.w600,
                        color: fg,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
