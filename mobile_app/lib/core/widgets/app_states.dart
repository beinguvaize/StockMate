import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/core/widgets/app_button.dart';

/// Loading, empty and skeleton states.
///
/// The app had 91 inline `CircularProgressIndicator`s across 53 files, six
/// independently-written empty-state classes, and exactly one skeleton (private
/// to the dashboard). These are the shared versions.

/// Centred spinner. Use while a screen's first load is in flight.
class AppSpinner extends StatelessWidget {
  final String? label;
  final double size;

  const AppSpinner({super.key, this.label, this.size = 22});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: const CircularProgressIndicator(
              strokeWidth: 2.4,
              color: AppColors.primary,
            ),
          ),
          if (label != null) ...[
            Gap.h12,
            Text(
              label!,
              style: GoogleFonts.manrope(
                fontSize: 13,
                color: AppColors.inkTertiary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Empty state with an optional action.
///
/// Reads as an invitation, not an apology — name the thing that would be here
/// and offer the action that creates it, rather than saying "nothing found".
class AppEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Gap.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: const BoxDecoration(
                color: AppColors.surfaceContainer,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 22, color: AppColors.inkTertiary),
            ),
            Gap.h16,
            Text(
              title,
              textAlign: TextAlign.center,
              style: GoogleFonts.manrope(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppColors.onSurface,
              ),
            ),
            if (message != null) ...[
              Gap.h8,
              Text(
                message!,
                textAlign: TextAlign.center,
                style: GoogleFonts.manrope(
                  fontSize: 13,
                  height: 1.5,
                  color: AppColors.inkTertiary,
                ),
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              Gap.h16,
              AppButton(
                label: actionLabel!,
                onPressed: onAction,
                size: AppButtonSize.small,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Placeholder block for content that is still loading.
///
/// Pulses rather than sitting static, so a slow load looks busy instead of
/// broken. Prefer this over a spinner where the shape of the content is known.
class AppSkeleton extends StatefulWidget {
  final double? width;
  final double height;
  final BorderRadius radius;

  const AppSkeleton({
    super.key,
    this.width,
    this.height = 14,
    this.radius = Radii.rXs,
  });

  @override
  State<AppSkeleton> createState() => _AppSkeletonState();
}

class _AppSkeletonState extends State<AppSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1.0).animate(
        CurvedAnimation(parent: _c, curve: Motion.standard),
      ),
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: AppColors.secondaryContainer,
          borderRadius: widget.radius,
        ),
      ),
    );
  }
}
