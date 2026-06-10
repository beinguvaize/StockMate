import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/theme/colors.dart';

class ReportKpiTile extends StatelessWidget {
  final String label;
  final String value;
  final String? subtitle;
  final Color? color;
  final IconData? icon;

  const ReportKpiTile({
    super.key,
    required this.label,
    required this.value,
    this.subtitle,
    this.color,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final valueColor = color ?? AppColors.inkPrimary;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [AppColors.cardShadow],
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Stack(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label.toUpperCase(),
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                  color: AppColors.inkSecondary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                value,
                style: GoogleFonts.manrope(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: valueColor,
                  letterSpacing: -0.5,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  style: GoogleFonts.manrope(
                    fontSize: 11,
                    color: AppColors.inkSecondary,
                  ),
                ),
              ],
            ],
          ),
          if (icon != null)
            Positioned(
              top: 0,
              right: 0,
              child: Icon(icon, size: 18, color: valueColor.withValues(alpha: 0.4)),
            ),
        ],
      ),
    );
  }
}
