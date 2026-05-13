import 'package:flutter/material.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:lucide_icons/lucide_icons.dart';

class TrialBanner extends StatelessWidget {
  final int daysLeft;
  final VoidCallback? onUpgrade;

  const TrialBanner({
    super.key,
    required this.daysLeft,
    this.onUpgrade,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.4), width: 1),
      ),
      child: Row(
        children: [
          Icon(LucideIcons.clock, color: AppColors.warning, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.inkPrimary,
                  fontWeight: FontWeight.w600,
                ),
                children: [
                  TextSpan(
                    text: daysLeft == 0
                        ? 'Trial expires today. '
                        : '$daysLeft ${daysLeft == 1 ? 'day' : 'days'} left in trial. ',
                  ),
                  const TextSpan(
                    text: 'Upgrade now →',
                    style: TextStyle(
                      color: AppColors.warning,
                      fontWeight: FontWeight.w800,
                      decoration: TextDecoration.underline,
                      decorationColor: AppColors.warning,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: onUpgrade,
            child: const Icon(LucideIcons.arrowRight, color: AppColors.warning, size: 18),
          ),
        ],
      ),
    );
  }
}
