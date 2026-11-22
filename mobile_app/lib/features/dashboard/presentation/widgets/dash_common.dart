import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';
import 'package:mobile_app/widgets/motion/pressable.dart';

/// Tokens for the phone Dashboard, from the approved mock-up
/// (mockups/app-dashboard.html). Local to this screen on purpose: the rest of
/// the app has not been redesigned yet and must not shift under it.
class DashColors {
  DashColors._();
  static const ink = Color(0xFF111418);
  static const ink2 = Color(0xFF2E343B);
  static const mute = Color(0xFF8A9099);
  static const faint = Color(0xFFB7BCC2);
  static const bg = Color(0xFFF4F3F1);
  static const card = Color(0xFFFFFFFF);
  static const sep = Color(0xFFEFEEEC);
  static const well = Color(0xFFF3F2F0);
  static const amber = Color(0xFFE8890C);
  static const amberDeep = Color(0xFFB45309);
  static const amberSoft = Color(0xFFFFF1DE);
  static const green = Color(0xFF16A34A);
  static const greenSoft = Color(0xFFE6F6EC);
  static const red = Color(0xFFDC2626);
  static const redSoft = Color(0xFFFDECEC);
  static const blue = Color(0xFF5B8DEF);
  static const bar = Color(0xFFECEAE6);
}

/// Inter Tight for headings and figures, Inter for small text.
class DashText {
  DashText._();
  static TextStyle tight(double size,
          {FontWeight w = FontWeight.w700,
          Color c = DashColors.ink,
          double ls = -0.01,
          double? h}) =>
      GoogleFonts.interTight(
          fontSize: size,
          fontWeight: w,
          color: c,
          letterSpacing: size * ls,
          height: h);

  static TextStyle inter(double size,
          {FontWeight w = FontWeight.w500, Color c = DashColors.mute}) =>
      GoogleFonts.inter(fontSize: size, fontWeight: w, color: c);
}

/// White rounded card. Radius 24, no border, no shadow.
class DashCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final double radius;
  const DashCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(16, 14, 16, 14),
    this.margin = const EdgeInsets.fromLTRB(14, 12, 14, 0),
    this.radius = 24,
  });

  @override
  Widget build(BuildContext context) => Container(
        margin: margin,
        padding: padding,
        decoration: BoxDecoration(
          color: DashColors.card,
          borderRadius: BorderRadius.circular(radius),
        ),
        child: child,
      );
}

/// "This week" with an optional amber link on the right. 15px bold, sentence
/// case.
class SectionHeader extends StatelessWidget {
  final String title;
  final String? link;
  final VoidCallback? onLink;
  const SectionHeader(this.title, {super.key, this.link, this.onLink});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(22, 22, 22, 0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Expanded(child: Text(title, style: DashText.tight(15))),
            if (link != null)
              Tap(
                onTap: onLink,
                child: Padding(
                  padding: const EdgeInsets.only(left: 12, top: 6, bottom: 6),
                  child: Text(link!,
                      style: DashText.tight(13,
                          w: FontWeight.w600, c: DashColors.amberDeep)),
                ),
              ),
          ],
        ),
      );
}

/// Tap target with the 0.97 press scale (160ms, ease-out) and nothing else:
/// no ripple, no colour change.
class Tap extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  const Tap({super.key, required this.child, this.onTap});

  @override
  Widget build(BuildContext context) => Pressable(
        enabled: onTap != null,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: child,
        ),
      );
}

/// Duration that is zero when the OS asks for reduced motion.
Duration dashDur(BuildContext context, int ms) => motionDur(context, ms);

const Curve dashOut = MotionCurves.out;

/// Initials avatar: 36px, 12px radius.
class InitialsTile extends StatelessWidget {
  final String text;
  final Color bg;
  final Color fg;
  const InitialsTile(this.text,
      {super.key, this.bg = DashColors.amberSoft, this.fg = DashColors.amberDeep});

  @override
  Widget build(BuildContext context) => Container(
        width: 36,
        height: 36,
        alignment: Alignment.center,
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
        child: Text(text, style: DashText.tight(12, w: FontWeight.w800, c: fg)),
      );
}

/// One row of a list card: leading, title + sub line, trailing; hairline
/// between rows (not under the last).
class ListRow extends StatelessWidget {
  final Widget leading;
  final String title;
  final String? sub;
  final Color subColor;
  final Widget? trailing;
  final bool last;
  final VoidCallback? onTap;
  final Widget? under;
  const ListRow({
    super.key,
    required this.leading,
    required this.title,
    this.sub,
    this.subColor = DashColors.mute,
    this.trailing,
    this.last = false,
    this.onTap,
    this.under,
  });

  @override
  Widget build(BuildContext context) {
    final row = Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: last
            ? null
            : const Border(bottom: BorderSide(color: DashColors.sep)),
      ),
      child: Row(
        children: [
          leading,
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: DashText.tight(14.5, w: FontWeight.w600)),
                if (sub != null) ...[
                  const SizedBox(height: 2),
                  Text(sub!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: DashText.inter(12, w: FontWeight.w400, c: subColor)),
                ],
                ?under,
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 10), trailing!],
        ],
      ),
    );
    return onTap == null ? row : Tap(onTap: onTap, child: row);
  }
}
