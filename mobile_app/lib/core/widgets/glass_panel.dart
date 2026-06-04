import 'package:flutter/material.dart';
import '../theme/colors.dart';

class GlassPanel extends StatelessWidget {
  final Widget child;
  final double blur;
  final double opacity;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;
  final double? width;
  final double? height;

  const GlassPanel({
    super.key,
    required this.child,
    this.blur = 20.0,
    this.opacity = 0.7,
    this.borderRadius = 20.0,
    this.padding,
    this.width,
    this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      padding: padding ?? const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface, // Solid white like the web App
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(
          color: Colors.black.withValues(alpha: 0.05), // Subtle web-like border
          width: 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08), // --shadow-premium
            blurRadius: 30,
            spreadRadius: -10,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: child,
      ),
    );
  }
}
