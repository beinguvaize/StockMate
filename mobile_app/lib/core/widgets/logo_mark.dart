import 'package:flutter/material.dart';

/// The bookledger mark (the real logo, cropped to the book + brick square).
class LogoMark extends StatelessWidget {
  /// Height of the mark; width follows the image's own proportions.
  final double height;
  const LogoMark({super.key, this.height = 22});

  @override
  Widget build(BuildContext context) => Image.asset(
        'assets/images/logo_mark.png',
        height: height,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
        semanticLabel: 'bookledger',
      );
}
