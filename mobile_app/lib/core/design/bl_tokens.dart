import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Colours of the approved phone redesign (the canvas, `mockup.css`).
///
/// Sizes on the canvas are drawn for a 340px-wide phone and are used here
/// 1:1 as logical pixels, the same way the Dashboard was built.
class Bl {
  Bl._();

  static const ink = Color(0xFF111418);
  static const ink2 = Color(0xFF2E343B);
  static const ink3 = Color(0xFF30343A);
  static const body = Color(0xFF6E737A);
  static const mute = Color(0xFF8A9099);
  static const faint = Color(0xFFB7BCC2);

  static const white = Color(0xFFFFFFFF);
  static const grey = Color(0xFFF4F3F1);
  static const well = Color(0xFFF1F1F1);
  static const wellSoft = Color(0xFFF4F4F3);
  static const tile = Color(0xFFF7F7F6);
  static const sep = Color(0xFFF0EFED);
  static const line = Color(0xFFEDEDED);

  static const amber = Color(0xFFE8890C);
  static const amberDeep = Color(0xFFB45309);
  static const amberSoft = Color(0xFFFFF1DE);
  static const brand = Color(0xFFF09935);

  static const green = Color(0xFF16A34A);
  static const greenDot = Color(0xFF22C55E);
  static const greenSoft = Color(0xFFE6F6EC);
  static const red = Color(0xFFDC2626);
  static const redDeep = Color(0xFFB91C1C);
  static const redSoft = Color(0xFFFDECEC);
  static const blue = Color(0xFF2563EB);
  static const blueSoft = Color(0xFFE8EFFD);

  static const shade = Color(0x6B111418); // rgba(17,20,24,.42)
  static const dark = Color(0xFF0C0C0D);

  /// Inter Tight: headings, figures, buttons. [ls] is in em, as on the canvas.
  static TextStyle tight(double size,
          {FontWeight w = FontWeight.w600,
          Color c = ink,
          double ls = -0.01,
          double? h}) =>
      GoogleFonts.interTight(
          fontSize: size,
          fontWeight: w,
          color: c,
          letterSpacing: size * ls,
          height: h);

  /// Inter: small supporting text.
  static TextStyle inter(double size,
          {FontWeight w = FontWeight.w400, Color c = body, double? h}) =>
      // letterSpacing 0: otherwise the Material text theme's tracking leaks in.
      GoogleFonts.inter(
          fontSize: size,
          fontWeight: w,
          color: c,
          height: h,
          letterSpacing: 0);

  /// Small uppercase section label ("MODULES", drawer group names).
  static TextStyle get eyebrow =>
      tight(11, w: FontWeight.w600, c: mute, ls: 0.07);
}
