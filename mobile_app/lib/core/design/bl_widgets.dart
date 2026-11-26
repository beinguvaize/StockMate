import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';
import 'package:mobile_app/widgets/motion/pressable.dart';

import 'bl_icons.dart';
import 'bl_tokens.dart';

export 'bl_icons.dart';
export 'bl_tokens.dart';

/// Tap target with the canvas press feedback: scale 0.97, 160ms, no ripple.
class BlTap extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final String? label;
  const BlTap({super.key, required this.child, this.onTap, this.label});

  @override
  Widget build(BuildContext context) {
    final w = Pressable(
      enabled: onTap != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: child,
      ),
    );
    return label == null
        ? w
        : Semantics(button: true, label: label, excludeSemantics: true, child: w);
  }
}

enum BlButtonKind { primary, soft, danger, white }

/// The pill button (`.btn`): 46 high, Inter Tight 600 15.
class BlButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  final BlButtonKind kind;
  final bool loading;
  final Widget? leading;
  final double height;
  final double fontSize;
  const BlButton(this.label,
      {super.key,
      this.onTap,
      this.kind = BlButtonKind.primary,
      this.loading = false,
      this.leading,
      this.height = 46,
      this.fontSize = 15});

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg) = switch (kind) {
      BlButtonKind.primary => (Bl.amber, Bl.white),
      BlButtonKind.soft => (const Color(0xFFEFEEEC), Bl.ink),
      BlButtonKind.danger => (const Color(0xFFFEF2F2), Bl.redDeep),
      BlButtonKind.white => (Bl.white, Bl.ink),
    };
    final enabled = onTap != null && !loading;
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: BlTap(
        onTap: enabled ? onTap : null,
        child: Opacity(
          opacity: onTap == null && !loading ? 0.5 : 1,
          child: Container(
            height: height,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: bg, borderRadius: BorderRadius.circular(999)),
            child: loading
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: fg))
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (leading != null) ...[leading!, const SizedBox(width: 8)],
                      Flexible(
                        child: Text(label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.tight(fontSize, w: FontWeight.w600, c: fg)),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

/// "Slide to …" (`.slide`): drag the amber knob to the end to confirm.
///
/// The knob nudges every 2.6s as a hint, as on the canvas. With a screen
/// reader, or with reduced motion on, a tap confirms instead.
class BlSlide extends StatefulWidget {
  final String label;
  final FutureOr<void> Function() onConfirmed;
  final bool enabled;
  const BlSlide(this.label,
      {super.key, required this.onConfirmed, this.enabled = true});

  @override
  State<BlSlide> createState() => _BlSlideState();
}

class _BlSlideState extends State<BlSlide> with TickerProviderStateMixin {
  static const double _h = 50, _knobW = 62, _knobH = 42, _pad = 4;
  late final AnimationController _nudge =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 2600));
  late final AnimationController _settle =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
  double _dx = 0;
  double _from = 0;
  bool _dragging = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _settle.addListener(() {
      setState(() => _dx = _from * (1 - MotionCurves.out.transform(_settle.value)));
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) == true;
    if (reduce || !widget.enabled) {
      _nudge.stop();
    } else if (!_nudge.isAnimating) {
      _nudge.repeat();
    }
  }

  @override
  void dispose() {
    _nudge.dispose();
    _settle.dispose();
    super.dispose();
  }

  // 0 → 0 until 72%, out to 16px at 82%, back by 100%.
  double _nudgeDx(double t) {
    if (t < 0.72) return 0;
    if (t < 0.82) return 16 * MotionCurves.out.transform((t - 0.72) / 0.10);
    return 16 * (1 - MotionCurves.out.transform((t - 0.82) / 0.18));
  }

  Future<void> _confirm() async {
    if (_busy || !widget.enabled) return;
    setState(() => _busy = true);
    HapticFeedback.mediumImpact();
    try {
      await widget.onConfirmed();
    } finally {
      if (mounted) {
        _from = _dx;
        setState(() => _busy = false);
        _settle.forward(from: 0);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tapConfirms = MediaQuery.maybeDisableAnimationsOf(context) == true ||
        MediaQuery.of(context).accessibleNavigation;
    return Semantics(
      button: true,
      enabled: widget.enabled,
      label: widget.label,
      onTap: widget.enabled ? _confirm : null,
      excludeSemantics: true,
      child: Opacity(
        opacity: widget.enabled ? 1 : 0.5,
        child: LayoutBuilder(builder: (context, box) {
          final max = box.maxWidth - _knobW - _pad * 2;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: tapConfirms ? _confirm : null,
            onHorizontalDragStart: (_) {
              if (!widget.enabled || _busy) return;
              _settle.stop();
              setState(() => _dragging = true);
            },
            onHorizontalDragUpdate: (d) {
              if (!_dragging) return;
              setState(() => _dx = (_dx + d.delta.dx).clamp(0.0, max));
            },
            onHorizontalDragEnd: (_) {
              if (!_dragging) return;
              _dragging = false;
              if (_dx >= max * 0.9) {
                setState(() => _dx = max);
                _confirm();
              } else {
                _from = _dx;
                _settle.forward(from: 0);
              }
            },
            child: Container(
              height: _h,
              decoration: BoxDecoration(
                  color: const Color(0xFFF5F4F2),
                  borderRadius: BorderRadius.circular(999)),
              child: Stack(
                alignment: Alignment.centerLeft,
                children: [
                  Positioned.fill(
                    child: Padding(
                      padding: const EdgeInsets.only(left: 58),
                      child: Center(
                        child: Text(widget.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.tight(13.5, w: FontWeight.w600, c: Bl.mute)),
                      ),
                    ),
                  ),
                  AnimatedBuilder(
                    animation: _nudge,
                    builder: (_, child) => Positioned(
                      left: _pad +
                          _dx +
                          ((_dragging || _busy || _dx > 0)
                              ? 0
                              : _nudgeDx(_nudge.value)),
                      top: _pad,
                      child: child!,
                    ),
                    child: Container(
                      width: _knobW,
                      height: _knobH,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Bl.amber,
                        borderRadius: BorderRadius.circular(999),
                        boxShadow: const [
                          BoxShadow(
                              color: Color(0x99B45309),
                              blurRadius: 14,
                              spreadRadius: -6,
                              offset: Offset(0, 6)),
                        ],
                      ),
                      child: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Bl.white))
                          : const BlIcon(BlIcons.arrowRight,
                              size: 20, color: Bl.white, stroke: 2.6),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }
}

/// Round 34px button used in inner headers and sheets (`.cbtn`).
class BlRoundButton extends StatelessWidget {
  final String icon;
  final VoidCallback? onTap;
  final String label;
  final double size;
  final double iconSize;
  final Color iconColor;
  const BlRoundButton(this.icon,
      {super.key,
      required this.onTap,
      required this.label,
      this.size = 34,
      this.iconSize = 18,
      this.iconColor = Bl.ink});

  @override
  Widget build(BuildContext context) => BlTap(
        onTap: onTap,
        label: label,
        // 44dp hit area around the smaller drawn circle.
        child: SizedBox(
          width: size < 44 ? 44 : size,
          height: size < 44 ? 44 : size,
          child: Center(
            child: Container(
              width: size,
              height: size,
              alignment: Alignment.center,
              decoration:
                  const BoxDecoration(color: Bl.well, shape: BoxShape.circle),
              child: BlIcon(icon, size: iconSize, color: iconColor),
            ),
          ),
        ),
      );
}

/// Inner-screen header (`.hdr`): round back button, centred title.
class BlBackHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onBack;
  const BlBackHeader(
      {super.key, this.title = '', this.subtitle, this.trailing, this.onBack});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(7, 1, 7, 0),
        child: Row(
          children: [
            BlRoundButton(BlIcons.back,
                label: 'Back',
                onTap: onBack ?? () => Navigator.of(context).maybePop()),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(15.5, w: FontWeight.w600)),
                  if (subtitle != null)
                    Text(subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(11,
                            w: FontWeight.w500, c: const Color(0xFF616161))),
                ],
              ),
            ),
            trailing ?? const SizedBox(width: 44),
          ],
        ),
      );
}

/// Plays the canvas screen-entrance once: each child rises 10px and fades in,
/// 80ms after the one before it.
class BlEntrance extends StatefulWidget {
  final int index;
  final Widget child;
  const BlEntrance({super.key, required this.index, required this.child});

  /// Wraps each of [children] with its own position in the sequence.
  static List<Widget> all(List<Widget> children) => [
        for (var i = 0; i < children.length; i++)
          BlEntrance(index: i, child: children[i]),
      ];

  @override
  State<BlEntrance> createState() => _BlEntranceState();
}

class _BlEntranceState extends State<BlEntrance>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 480));
  Timer? _t;

  @override
  void initState() {
    super.initState();
    final i = widget.index > 15 ? 15 : widget.index;
    _t = Timer(Duration(milliseconds: 80 * i), () {
      if (!mounted) return;
      if (MediaQuery.maybeDisableAnimationsOf(context) == true) {
        _c.value = 1;
      } else {
        _c.forward();
      }
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, c) {
          if (_c.value == 1) return c!;
          final t = MotionCurves.out.transform(_c.value);
          return Opacity(
            opacity: t,
            child: Transform.translate(offset: Offset(0, 10 * (1 - t)), child: c),
          );
        },
        child: widget.child,
      );
}

/// The floating sheet (`.sheet`): inset 6px, 30px corners, slides up in
/// 450ms on the drawer curve over a 42% ink shade.
Future<T?> showBlSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool useRootNavigator = false,
  bool isDismissible = true,
}) {
  final reduce = MediaQuery.maybeDisableAnimationsOf(context) == true;
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useRootNavigator: useRootNavigator,
    isDismissible: isDismissible,
    enableDrag: isDismissible,
    backgroundColor: Colors.transparent,
    barrierColor: Bl.shade,
    elevation: 0,
    sheetAnimationStyle: AnimationStyle(
      curve: MotionCurves.drawer,
      reverseCurve: MotionCurves.drawer,
      duration: reduce ? Duration.zero : const Duration(milliseconds: 450),
      reverseDuration: reduce ? Duration.zero : const Duration(milliseconds: 300),
    ),
    builder: (ctx) {
      final mq = MediaQuery.of(ctx);
      return Padding(
        padding: EdgeInsets.fromLTRB(
            6, 0, 6, 6 + mq.viewInsets.bottom + mq.viewPadding.bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: mq.size.height * 0.92),
          child: Material(
            color: Bl.white,
            borderRadius: BorderRadius.circular(30),
            clipBehavior: Clip.antiAlias,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: builder(ctx),
            ),
          ),
        ),
      );
    },
  );
}

/// Sheet title row: title on the left, round close button on the right.
class BlSheetTitle extends StatelessWidget {
  final String title;
  final bool divider;
  final double size;
  const BlSheetTitle(this.title,
      {super.key, this.divider = false, this.size = 19});

  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.only(bottom: divider ? 12 : 0),
        decoration: divider
            ? const BoxDecoration(
                border: Border(bottom: BorderSide(color: Bl.sep)))
            : null,
        child: Row(
          children: [
            Expanded(
              child: Text(title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.tight(size, w: FontWeight.w700, ls: -0.02)),
            ),
            BlTap(
              label: 'Close',
              onTap: () => Navigator.of(context).maybePop(),
              child: Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration:
                    const BoxDecoration(color: Bl.well, shape: BoxShape.circle),
                child: const BlIcon(BlIcons.close, size: 15),
              ),
            ),
          ],
        ),
      );
}

/// The centred dialog (`.dlg`): 26px corners, title, body, actions.
Future<T?> showBlDialog<T>({
  required BuildContext context,
  required String title,
  required String message,
  required List<Widget> Function(BuildContext) actions,
  bool dismissible = true,
  bool useRootNavigator = true,
}) {
  final reduce = MediaQuery.maybeDisableAnimationsOf(context) == true;
  return showGeneralDialog<T>(
    context: context,
    useRootNavigator: useRootNavigator,
    barrierDismissible: dismissible,
    barrierLabel: 'Dismiss',
    barrierColor: Bl.shade,
    transitionDuration: reduce ? Duration.zero : const Duration(milliseconds: 240),
    pageBuilder: (ctx, _, _) => Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 22),
        child: Material(
          color: Bl.white,
          borderRadius: BorderRadius.circular(26),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: Bl.tight(16, w: FontWeight.w700)),
                const SizedBox(height: 8),
                Flexible(
                  child: SingleChildScrollView(
                    child: Text(message,
                        style:
                            Bl.inter(13, c: const Color(0xFF55595F), h: 1.5)),
                  ),
                ),
                const SizedBox(height: 14),
                ...actions(ctx),
              ],
            ),
          ),
        ),
      ),
    ),
    transitionBuilder: (_, a, _, child) {
      final t = MotionCurves.out.transform(a.value);
      return Opacity(
        opacity: t,
        child: Transform.scale(scale: 0.96 + 0.04 * t, child: child),
      );
    },
  );
}

/// Small status pill (`.cp`): grey by default, or yellow / red / green.
enum BlPillTone { neutral, warn, bad, good }

class BlPill extends StatelessWidget {
  final String text;
  final BlPillTone tone;
  const BlPill(this.text, {super.key, this.tone = BlPillTone.neutral});

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg) = switch (tone) {
      BlPillTone.neutral => (const Color(0xFFEBEBEB), const Color(0xFF303030)),
      BlPillTone.warn => (const Color(0xFFFFE48A), const Color(0xFF4F3B00)),
      BlPillTone.bad => (const Color(0xFFFEE2E2), Bl.redDeep),
      BlPillTone.good => (const Color(0xFFDCFCE7), const Color(0xFF166534)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(text, style: Bl.inter(10.5, w: FontWeight.w600, c: fg)),
    );
  }
}

/// Filter pill (`.chip`): plain text, grey fill when selected.
class BlChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  const BlChip(this.label, {super.key, this.selected = false, this.onTap});

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 32),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
            decoration: BoxDecoration(
                color: selected ? Bl.well : Colors.transparent,
                borderRadius: BorderRadius.circular(999)),
            child: Text(label,
                style: Bl.inter(12,
                    w: selected ? FontWeight.w600 : FontWeight.w500,
                    c: selected ? Bl.ink : Bl.body)),
          ),
        ),
      );
}

/// On/off switch (`.toggle`): 38x22, green when on.
class BlToggle extends StatelessWidget {
  final bool value;
  final ValueChanged<bool>? onChanged;
  final String label;
  const BlToggle(
      {super.key, required this.value, required this.onChanged, required this.label});

  @override
  Widget build(BuildContext context) => Semantics(
        toggled: value,
        label: label,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onChanged == null ? null : () => onChanged!(!value),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 3),
            child: AnimatedContainer(
              duration: motionDur(context, 160),
              curve: MotionCurves.out,
              width: 38,
              height: 22,
              padding: const EdgeInsets.all(2),
              alignment: value ? Alignment.centerRight : Alignment.centerLeft,
              decoration: BoxDecoration(
                  color: value ? Bl.green : Bl.faint,
                  borderRadius: BorderRadius.circular(11)),
              child: Container(
                width: 18,
                height: 18,
                decoration:
                    const BoxDecoration(color: Bl.white, shape: BoxShape.circle),
              ),
            ),
          ),
        ),
      );
}

/// Initials in a circle.
class BlInitials extends StatelessWidget {
  final String text;
  final double size;
  final Color bg;
  final Color fg;
  const BlInitials(this.text,
      {super.key, this.size = 34, this.bg = Bl.well, this.fg = Bl.ink});

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
        child: Text(text,
            style: Bl.tight(size * 0.38, w: FontWeight.w700, c: fg)),
      );
}

/// A line icon on a soft rounded square.
class BlIconTile extends StatelessWidget {
  final String icon;
  final double size;
  final double radius;
  final double iconSize;
  final Color bg;
  final Color fg;
  const BlIconTile(this.icon,
      {super.key,
      this.size = 34,
      this.radius = 9,
      this.iconSize = 15,
      this.bg = Bl.well,
      this.fg = Bl.ink3});

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(radius)),
        child: BlIcon(icon, size: iconSize, color: fg),
      );
}

/// Empty state (`.empty`): icon, one bold line, one quiet line.
class BlEmpty extends StatelessWidget {
  final String icon;
  final String title;
  final String? message;
  const BlEmpty({super.key, required this.icon, required this.title, this.message});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 36),
        child: Column(
          children: [
            BlIcon(icon, size: 34, color: const Color(0xFFC4C8CC), stroke: 1.5),
            const SizedBox(height: 6),
            Text(title,
                textAlign: TextAlign.center,
                style: Bl.tight(14, w: FontWeight.w600)),
            if (message != null) ...[
              const SizedBox(height: 6),
              Text(message!,
                  textAlign: TextAlign.center,
                  style: Bl.inter(12, c: Bl.mute, h: 1.45)),
            ],
          ],
        ),
      );
}

/// Solid choice pill (`Sales` / `Returns`, `Today` / `Week`): 34 high, ink
/// when selected, grey otherwise.
class BlTabPill extends StatelessWidget {
  final Widget child;
  final bool selected;
  final VoidCallback? onTap;
  final String? label;
  final EdgeInsets padding;
  const BlTabPill(
      {super.key,
      required this.child,
      this.selected = false,
      this.onTap,
      this.label,
      this.padding = const EdgeInsets.symmetric(horizontal: 16)});

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        child: BlTap(
          onTap: onTap,
          child: AnimatedContainer(
            duration: motionDur(context, 160),
            curve: MotionCurves.out,
            height: 34,
            padding: padding,
            alignment: Alignment.center,
            decoration: BoxDecoration(
                color: selected ? Bl.ink : Bl.well,
                borderRadius: BorderRadius.circular(999)),
            child: DefaultTextStyle.merge(
              style: Bl.tight(13,
                  w: FontWeight.w600,
                  ls: 0,
                  c: selected ? Bl.white : const Color(0xFF303030)),
              child: child,
            ),
          ),
        ),
      );
}

/// Outline filter pill (`All` / `Credit` / `Failed`): 30 high.
class BlOutlinePill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  const BlOutlinePill(this.label, {super.key, this.selected = false, this.onTap});

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: onTap,
          // 44dp tall tap area around the 30dp pill.
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Container(
              height: 30,
              padding: const EdgeInsets.symmetric(horizontal: 13),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                    width: selected ? 1.5 : 1,
                    color: selected ? Bl.ink : const Color(0xFFD9D6D1)),
              ),
              child: Text(label,
                  style: Bl.tight(12.5,
                      w: FontWeight.w600,
                      ls: 0,
                      c: selected ? Bl.ink : const Color(0xFF55595F))),
            ),
          ),
        ),
      );
}

/// Uppercase group line with a figure on the right ("TODAY   ₹24,860").
class BlGroupHeader extends StatelessWidget {
  final String label;
  final String? trailing;
  const BlGroupHeader(this.label, {super.key, this.trailing});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Row(
          children: [
            Expanded(child: Text(label.toUpperCase(), style: Bl.eyebrow)),
            if (trailing != null) Text(trailing!, style: Bl.eyebrow),
          ],
        ),
      );
}

/// Round 38px party avatar: initials, or a person outline for a walk-in.
class BlPartyAvatar extends StatelessWidget {
  final String name;
  final double size;
  const BlPartyAvatar(this.name, {super.key, this.size = 38});

  /// True for the nameless counter customer ("Walk-in", "Walk-in Customer").
  static bool isWalkIn(String name) {
    final n = name.trim().toLowerCase();
    return n.isEmpty || n.startsWith('walk-in') || n.startsWith('walk in');
  }

  /// Two letters for a name; empty for a walk-in, which gets the person icon.
  static String initials(String name) {
    if (isWalkIn(name)) return '';
    // Letters and digits only, so "Eggs (tray 30)" gives ET, not E(.
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .map((p) => p.replaceAll(RegExp(r'[^\p{L}\p{N}]', unicode: true), ''))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '';
    final a = parts.first.characters.first;
    final b = parts.length > 1 ? parts[1].characters.first : '';
    return (a + b).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final walkIn = isWalkIn(name);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: Bl.well, shape: BoxShape.circle),
      child: walkIn
          ? const BlIcon(BlIcons.person, size: 16, color: Color(0xFF5C5F62))
          : Text(initials(name),
              style: Bl.tight(11,
                  w: FontWeight.w700, ls: 0, c: const Color(0xFF5C5F62))),
    );
  }
}

/// The success mark on "done" sheets: a ring that draws itself, then a tick
/// (or a clock hand for "saved on this phone, not yet sent").
///
/// [progress] runs 0..1; the ring takes the first 60%, the mark the rest.
class BlDoneMark extends StatelessWidget {
  final double progress;
  final bool waiting;
  final double size;
  const BlDoneMark(
      {super.key, required this.progress, this.waiting = false, this.size = 96});

  @override
  Widget build(BuildContext context) => Semantics(
        image: true,
        label: waiting ? 'Waiting to sync' : 'Done',
        child: CustomPaint(
            size: Size.square(size), painter: _DonePainter(progress, waiting)),
      );
}

class _DonePainter extends CustomPainter {
  final double t;
  final bool waiting;
  const _DonePainter(this.t, this.waiting);

  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 96;
    final ring = MotionCurves.out.transform((t / 0.6).clamp(0.0, 1.0));
    final mark = MotionCurves.out.transform(((t - 0.45) / 0.55).clamp(0.0, 1.0));
    canvas.drawArc(
      Rect.fromCircle(center: Offset(48 * k, 48 * k), radius: 44 * k),
      -1.5707963,
      6.2831853 * ring,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4 * k
        ..strokeCap = StrokeCap.round
        ..color = waiting ? const Color(0xFFD9DCE0) : const Color(0xFFF6C27F),
    );
    if (mark <= 0) return;
    final path = Path();
    if (waiting) {
      path
        ..moveTo(48 * k, 26 * k)
        ..lineTo(48 * k, 48 * k)
        ..lineTo(62 * k, 57 * k);
    } else {
      path
        ..moveTo(30 * k, 49 * k)
        ..lineTo(42 * k, 61 * k)
        ..lineTo(66 * k, 35 * k);
    }
    final m = path.computeMetrics().first;
    canvas.drawPath(
      m.extractPath(0, m.length * mark),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5 * k
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = waiting ? Bl.body : Bl.amber,
    );
  }

  @override
  bool shouldRepaint(_DonePainter old) => old.t != t || old.waiting != waiting;
}

/// Runs a "done" sheet's entrance once and hands out each part's progress:
/// ring and mark first, then the figure, the line under it and the buttons.
class BlDoneSequence extends StatefulWidget {
  final Widget Function(BuildContext context, double Function(double from, double to) part)
      builder;
  const BlDoneSequence({super.key, required this.builder});

  @override
  State<BlDoneSequence> createState() => _BlDoneSequenceState();
}

class _BlDoneSequenceState extends State<BlDoneSequence>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1500));

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (MediaQuery.maybeDisableAnimationsOf(context) == true) {
        _c.value = 1;
      } else {
        _c.forward();
      }
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  double _part(double from, double to) =>
      ((_c.value - from) / (to - from)).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: _c, builder: (ctx, _) => widget.builder(ctx, _part));
}

/// Fades and lifts [child] in by [t] (0..1), used with [BlDoneSequence].
class BlRise extends StatelessWidget {
  final double t;
  final Widget child;
  final bool scale;
  const BlRise({super.key, required this.t, required this.child, this.scale = false});

  @override
  Widget build(BuildContext context) {
    final e = MotionCurves.out.transform(t);
    return Opacity(
      opacity: e,
      child: scale
          ? Transform.scale(scale: 0.9 + 0.1 * e, child: child)
          : Transform.translate(offset: Offset(0, 8 * (1 - e)), child: child),
    );
  }
}

/// A centred dialog (same card as [showBlDialog]) with any content.
Future<T?> showBlCustomDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool dismissible = true,
}) {
  final reduce = MediaQuery.maybeDisableAnimationsOf(context) == true;
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: dismissible,
    barrierLabel: 'Dismiss',
    barrierColor: Bl.shade,
    transitionDuration:
        reduce ? Duration.zero : const Duration(milliseconds: 240),
    // Centred when it fits; scrolls when the keyboard leaves too little room.
    pageBuilder: (ctx, _, _) => SafeArea(
      child: Padding(
        padding:
            EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: LayoutBuilder(
          builder: (ctx, box) => SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight - 32),
              child: Center(
                child: Material(
                  color: Bl.white,
                  borderRadius: BorderRadius.circular(26),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
                    child: builder(ctx),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    transitionBuilder: (_, a, _, child) {
      final t = MotionCurves.out.transform(a.value);
      return Opacity(
        opacity: t,
        child: Transform.scale(scale: 0.96 + 0.04 * t, child: child),
      );
    },
  );
}

/// The three-step form frame from the canvas: back button, a bar per step,
/// "Step 1 of 3" with the step names, one big question, the fields, and one
/// button at the bottom. Back returns to the step before.
class BlStepFrame extends StatelessWidget {
  final String title;
  final int step; // 0-based
  final List<String> stepNames;
  final String question;
  final List<Widget> children;
  final String buttonLabel;
  final VoidCallback? onNext;
  final VoidCallback onBack;
  final bool loading;
  const BlStepFrame({
    super.key,
    required this.title,
    required this.step,
    required this.stepNames,
    required this.question,
    required this.children,
    required this.buttonLabel,
    required this.onNext,
    required this.onBack,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Bl.white,
        body: SafeArea(
          child: Column(
            children: [
              BlBackHeader(title: title, onBack: onBack),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 4, 18, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      label: 'Step ${step + 1} of ${stepNames.length}',
                      child: Row(
                        children: [
                          for (var i = 0; i < stepNames.length; i++) ...[
                            if (i > 0) const SizedBox(width: 5),
                            Expanded(
                              child: AnimatedContainer(
                                duration: motionDur(context, 220),
                                curve: MotionCurves.out,
                                height: 4,
                                decoration: BoxDecoration(
                                    color: i <= step
                                        ? Bl.brand
                                        : const Color(0xFFE9E8E6),
                                    borderRadius: BorderRadius.circular(2)),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                              'Step ${step + 1} of ${stepNames.length}',
                              style: Bl.inter(12.5,
                                  w: FontWeight.w500,
                                  c: const Color(0xFF7A8088))),
                        ),
                        Text(stepNames.join(' · '),
                            style: Bl.inter(12.5,
                                w: FontWeight.w500,
                                c: const Color(0xFF7A8088))),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(question,
                        style: Bl.tight(24, w: FontWeight.w700, ls: -0.03)),
                  ],
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  // A new key per step replays the entrance for that step.
                  key: ValueKey('step-$step'),
                  padding: const EdgeInsets.fromLTRB(18, 4, 18, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: BlEntrance.all(children),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
                child:
                    BlButton(buttonLabel, loading: loading, onTap: onNext),
              ),
            ],
          ),
        ),
      );
}

/// A labelled form field in a soft grey well (50 high, 14 corners).
class BlField extends StatelessWidget {
  final String label;
  final String? hint;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final String? prefix;
  final Widget? trailing;
  final ValueChanged<String>? onChanged;
  final TextCapitalization capitalization;
  final String? helper;

  /// When set, the well shows this text and opens a picker on tap instead of
  /// taking typing.
  final String? value;
  final VoidCallback? onTap;

  const BlField({
    super.key,
    required this.label,
    this.hint,
    this.controller,
    this.keyboardType,
    this.inputFormatters,
    this.prefix,
    this.trailing,
    this.onChanged,
    this.capitalization = TextCapitalization.none,
    this.helper,
    this.value,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final picker = onTap != null;
    final well = Container(
      height: 50,
      padding: EdgeInsets.only(left: 14, right: trailing == null ? 14 : 8),
      decoration: BoxDecoration(
          color: Bl.wellSoft, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: [
          if (prefix != null) ...[
            Text(prefix!,
                style: Bl.tight(15.5, w: FontWeight.w600, ls: 0, c: Bl.ink3)),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: picker
                ? Text(value ?? hint ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(15.5,
                        w: value == null ? FontWeight.w500 : FontWeight.w600,
                        ls: 0,
                        c: value == null ? const Color(0xFFA8ADB4) : Bl.ink))
                : TextField(
                    controller: controller,
                    keyboardType: keyboardType,
                    inputFormatters: inputFormatters,
                    textCapitalization: capitalization,
                    onChanged: onChanged,
                    cursorColor: Bl.brand,
                    style: Bl.tight(15.5, w: FontWeight.w600, ls: 0),
                    decoration: InputDecoration(
                      isCollapsed: true,
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      hintText: hint,
                      hintStyle: Bl.tight(15.5,
                          w: FontWeight.w500,
                          ls: 0,
                          c: const Color(0xFFA8ADB4)),
                    ),
                  ),
          ),
          if (trailing != null) trailing!,
          if (picker && trailing == null)
            const BlIcon(BlIcons.chevronDown,
                size: 16, color: Color(0xFF7A8088)),
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: Bl.tight(13, w: FontWeight.w600, ls: 0, c: Bl.ink3)),
          const SizedBox(height: 6),
          picker
              ? Semantics(
                  button: true,
                  label: '$label, ${value ?? 'not set'}',
                  excludeSemantics: true,
                  child: BlTap(onTap: onTap, child: well))
              : well,
          if (helper != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(helper!,
                  style: Bl.inter(12.5, c: const Color(0xFF7A8088))),
            ),
        ],
      ),
    );
  }
}

/// Picks one of [options] from a sheet. Returns the choice, or null.
Future<String?> showBlPicker(
  BuildContext context, {
  required String title,
  required List<String> options,
  String? selected,
}) =>
    showBlSheet<String>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BlSheetTitle(title, size: 16, divider: true),
          for (final o in options)
            Semantics(
              button: true,
              selected: o == selected,
              child: BlTap(
                onTap: () => Navigator.pop(ctx, o),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(o,
                            style: Bl.tight(14.5,
                                w: o == selected
                                    ? FontWeight.w700
                                    : FontWeight.w500)),
                      ),
                      if (o == selected)
                        const BlIcon(BlIcons.check,
                            size: 16, color: Bl.amber, stroke: 2.6),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );

/// A row of choice pills that wrap (units, quick reasons): ink when chosen.
class BlChoicePills extends StatelessWidget {
  final List<String> options;
  final String selected;
  final ValueChanged<String> onChanged;
  const BlChoicePills(
      {super.key,
      required this.options,
      required this.selected,
      required this.onChanged});

  @override
  Widget build(BuildContext context) => Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final o in options)
            Semantics(
              button: true,
              selected: o == selected,
              label: o,
              excludeSemantics: true,
              child: BlTap(
                onTap: () => onChanged(o),
                child: Container(
                  height: 38,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                      color: o == selected ? Bl.ink : Bl.wellSoft,
                      borderRadius: BorderRadius.circular(999)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(o,
                          style: Bl.tight(13.5,
                              w: FontWeight.w600,
                              ls: 0,
                              c: o == selected ? Bl.white : Bl.ink3)),
                    ],
                  ),
                ),
              ),
            ),
        ],
      );
}

/// Segmented control (grey tray, white selected segment), with an optional
/// count beside each label.
class BlSegmented extends StatelessWidget {
  final List<String> labels;
  final List<int>? counts;
  final int index;
  final ValueChanged<int> onChanged;
  const BlSegmented(
      {super.key,
      required this.labels,
      required this.index,
      required this.onChanged,
      this.counts});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
            color: Bl.well, borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            for (var i = 0; i < labels.length; i++)
              Expanded(
                child: Semantics(
                  button: true,
                  selected: index == i,
                  label: counts == null
                      ? labels[i]
                      : '${labels[i]}, ${counts![i]}',
                  excludeSemantics: true,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => onChanged(i),
                    child: AnimatedContainer(
                      duration: motionDur(context, 160),
                      curve: MotionCurves.out,
                      height: 32,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color:
                            index == i ? Bl.white : const Color(0x00FFFFFF),
                        borderRadius: BorderRadius.circular(9),
                        boxShadow: index == i
                            ? const [
                                BoxShadow(
                                    color: Color(0x1F000000),
                                    blurRadius: 2,
                                    offset: Offset(0, 1)),
                              ]
                            : null,
                      ),
                      child: Text.rich(
                        TextSpan(
                          text: labels[i],
                          children: [
                            if (counts != null)
                              TextSpan(
                                  text: '  ${counts![i]}',
                                  style: Bl.tight(12,
                                      w: FontWeight.w500,
                                      ls: 0,
                                      c: (index == i ? Bl.ink : Bl.body)
                                          .withValues(alpha: 0.55))),
                          ],
                        ),
                        maxLines: 1,
                        style: Bl.tight(13,
                            w: FontWeight.w600,
                            ls: 0,
                            c: index == i ? Bl.ink : Bl.body),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}

/// Small rounded status pill with its own colours (Paid, Overdue, Ordered…).
class BlStatusPill extends StatelessWidget {
  final String text;
  final Color fg;
  final Color bg;
  const BlStatusPill(this.text, {super.key, required this.fg, required this.bg});

  const BlStatusPill.grey(this.text, {super.key})
      : fg = const Color(0xFF6E737A),
        bg = const Color(0xFFEFEEEC);
  const BlStatusPill.green(this.text, {super.key})
      : fg = const Color(0xFF17663A),
        bg = const Color(0xFFE3F5EA);
  const BlStatusPill.yellow(this.text, {super.key})
      : fg = const Color(0xFF8A5A00),
        bg = const Color(0xFFFFF1C9);
  const BlStatusPill.red(this.text, {super.key})
      : fg = const Color(0xFFB91C1C),
        bg = const Color(0xFFFDE2E2);

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
        child: Text(text,
            style: Bl.tight(11, w: FontWeight.w600, ls: 0, c: fg)),
      );
}

/// Round 40px avatar with a soft tint picked from the name.
class BlTintAvatar extends StatelessWidget {
  final String name;
  final double size;
  const BlTintAvatar(this.name, {super.key, this.size = 40});

  static const _tints = [
    Color(0xFFFFF3D6),
    Color(0xFFE6F6EC),
    Color(0xFFE8F1FF),
    Color(0xFFF1ECFF),
    Color(0xFFFDECEC),
  ];

  @override
  Widget build(BuildContext context) {
    final initials = BlPartyAvatar.initials(name);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
          color: _tints[name.hashCode.abs() % _tints.length],
          shape: BoxShape.circle),
      child: initials.isEmpty
          ? BlIcon(BlIcons.person, size: size * 0.4, color: Bl.ink3)
          : Text(initials,
              style: Bl.tight(size * 0.32,
                  w: FontWeight.w700, ls: 0, c: Bl.ink3)),
    );
  }
}

/// A dashed rounded outline drawn over its child (the "Run payroll" card, the "Add photo" tile).
class DashedOutline extends StatelessWidget {
  final Widget child;
  final Color color;
  final double radius;
  const DashedOutline(
      {super.key, required this.child, required this.color, this.radius = 16});

  @override
  Widget build(BuildContext context) => CustomPaint(
        foregroundPainter: _OutlinePainter(color, radius),
        child: child,
      );
}

class _OutlinePainter extends CustomPainter {
  final Color color;
  final double radius;
  _OutlinePainter(this.color, this.radius);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(
          (Offset.zero & size).deflate(0.75), Radius.circular(radius)));
    for (final m in path.computeMetrics()) {
      for (double d = 0; d < m.length; d += 9) {
        final end = d + 5 > m.length ? m.length : d + 5;
        canvas.drawPath(m.extractPath(d, end), paint);
      }
    }
  }

  @override
  bool shouldRepaint(_OutlinePainter old) =>
      old.color != color || old.radius != radius;
}
