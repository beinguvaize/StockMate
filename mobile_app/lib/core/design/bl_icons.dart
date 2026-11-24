import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The line icons drawn on the canvas, kept as the same shapes.
///
/// Each value is the inside of a 24x24 `<svg>`; [BlIcon] draws it with a
/// 2px round stroke in the given colour, like `.ico` on the canvas.
class BlIcons {
  BlIcons._();

  static const menu = '<path d="M4 7h16M4 12h16M4 17h16"/>';
  static const bell =
      '<path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>';
  static const back = '<path d="M15 18l-6-6 6-6"/>';
  static const close = '<path d="M6 6l12 12M18 6L6 18"/>';
  static const plus = '<path d="M12 5v14M5 12h14"/>';
  static const check = '<path d="M20 6L9 17l-5-5"/>';
  static const chevronRight = '<path d="M9 6l6 6-6 6"/>';
  static const arrowRight = '<path d="M5 12h14M13 6l6 6-6 6"/>';

  static const home =
      '<path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>';
  static const receipt =
      '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>';
  static const box =
      '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>';
  static const truck =
      '<path d="M1 4h14v12H1zM15 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>';
  static const more =
      '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>';

  static const sync =
      '<path d="M21 12a9 9 0 01-15.5 6.2L3 16M3 12a9 9 0 0115.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>';
  static const settings =
      '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>';
  static const signOut = '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>';
  static const lock =
      '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>';

  static const users =
      '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 5.2a3.5 3.5 0 010 5.6M18.5 20a6.5 6.5 0 00-2.5-5"/>';
  static const cash = '<path d="M3 7h18v10H3z"/><circle cx="12" cy="12" r="2.6"/>';
  static const book = '<path d="M5 4h13v16H5z"/><path d="M9 4v16M12 9h3"/>';
  static const cart =
      '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>';
  static const chart = '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>';
  static const idCard =
      '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16a3.5 3.5 0 017 0M15 10h3M15 14h3"/>';
  static const bank =
      '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>';
  static const doc = '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>';
  static const collect = '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>';
  static const route =
      '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 000-6H9a3 3 0 010-6h6.8"/>';

  static const eye =
      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
  static const eyeOff =
      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>';
  static const fingerprint =
      '<path d="M12 11v4M8.5 12.5a3.5 3.5 0 017 0V15M5.5 13a6.5 6.5 0 0113 0v1.5M9 19.5c.7-1.2 1-2.6 1-4.2M14.8 19.5c.4-1 .7-2.2.7-3.4M7.6 6.4A8.6 8.6 0 0112 5.2c1.6 0 3.1.4 4.4 1.2"/>';
  static const whatsappLine =
      '<path d="M4 20l1.4-4.2A8 8 0 1112 20a8 8 0 01-3.8-1z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.6-2-.9-.8.8a4 4 0 01-2-2l.8-.8-.9-2z"/>';

  /// Full-colour marks (drawn as they are, not stroked).
  static const googleColor =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  static const whatsappColor =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#25D366" d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2z"/><path fill="#ffffff" d="M8.6 7.2c-.3 0-.7.1-1 .5-.4.4-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.5 5.4 4.7 2.6 1 3.2.8 3.7.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4l-2-1c-.3-.1-.5-.2-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.5-.5-.5-.7-.5z"/></svg>';
}

String _hex(Color c) {
  final v = c.toARGB32() & 0xFFFFFF;
  return '#${v.toRadixString(16).padLeft(6, '0')}';
}

/// One canvas line icon.
class BlIcon extends StatelessWidget {
  final String shape;
  final double size;
  final Color color;
  final double stroke;
  final String? label;
  const BlIcon(this.shape,
      {super.key,
      this.size = 20,
      this.color = const Color(0xFF111418),
      this.stroke = 2,
      this.label});

  @override
  Widget build(BuildContext context) => SvgPicture.string(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
        'stroke="${_hex(color)}" stroke-opacity="${color.a.toStringAsFixed(3)}" '
        'stroke-width="$stroke" stroke-linecap="round" stroke-linejoin="round">$shape</svg>',
        width: size,
        height: size,
        semanticsLabel: label,
        excludeFromSemantics: label == null,
      );
}

/// A full-colour mark (Google, WhatsApp).
class BlMark extends StatelessWidget {
  final String svg;
  final double size;
  final String label;
  const BlMark(this.svg, {super.key, this.size = 20, required this.label});

  @override
  Widget build(BuildContext context) =>
      SvgPicture.string(svg, width: size, height: size, semanticsLabel: label);
}
