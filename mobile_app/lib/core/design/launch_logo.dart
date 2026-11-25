import 'package:flutter/material.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';

/// The app-launch logo animation from the canvas ("App launch"): the book
/// opens from its spine, the bookmark drops in, then the letters of
/// "bookledger" rise one after another. Plays once per app start.
///
/// It is drawn from the real logo file, cut into pieces with clips, so the
/// finished frame is exactly the logo.
class LaunchLogo extends StatefulWidget {
  final double width;
  const LaunchLogo({super.key, this.width = 210});

  /// Length of the whole sequence.
  static const total = Duration(milliseconds: 1420);

  static DateTime? _startedAt;

  /// Time left before the animation that is (or was) playing finishes.
  /// Zero when it has finished, or when it has not started.
  static Duration get remaining {
    final s = _startedAt;
    if (s == null) return Duration.zero;
    final left = total - DateTime.now().difference(s);
    return left.isNegative ? Duration.zero : left;
  }

  @override
  State<LaunchLogo> createState() => _LaunchLogoState();
}

class _LaunchLogoState extends State<LaunchLogo>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: LaunchLogo.total);

  @override
  void initState() {
    super.initState();
    // The splash is shown from two places in a row (waiting for the session,
    // then for the shop). Carry on from where the first one got to.
    final now = DateTime.now();
    LaunchLogo._startedAt ??= now;
    final done = now.difference(LaunchLogo._startedAt!).inMilliseconds /
        LaunchLogo.total.inMilliseconds;
    _c.value = done.clamp(0.0, 1.0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (MediaQuery.maybeDisableAnimationsOf(context) == true) {
        _c.value = 1;
      } else if (_c.value < 1) {
        _c.forward();
      }
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.width;
    final h = w * 357 / 738;
    return Semantics(
      image: true,
      label: 'bookledger',
      child: SizedBox(
        width: w,
        height: h,
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, _) =>
              _frame(w, h, _c.value * LaunchLogo.total.inMilliseconds),
        ),
      ),
    );
  }

  // Canvas keyframes are percentages of a 4.6s loop.
  static double _seg(double ms, double fromPct, double toPct) {
    final a = fromPct * 46, b = toPct * 46;
    if (ms <= a) return 0;
    if (ms >= b) return 1;
    return MotionCurves.out.transform((ms - a) / (b - a));
  }

  static const _img = Image(
    image: AssetImage('assets/images/logo.png'),
    fit: BoxFit.fill,
    filterQuality: FilterQuality.high,
    excludeFromSemantics: true,
  );

  Widget _piece(Rect r, {Rect? hole}) => Positioned.fill(
        child: ClipPath(clipper: _RectClip(r, hole), child: _img),
      );

  // Letter edges of the wordmark, as fractions of the logo width.
  static const _letters = [
    0.0, 0.1646, 0.2676, 0.3706, 0.4695, 0.4946, 0.5921, 0.6951, 0.7927,
    0.8882, 1.0,
  ];

  Widget _frame(double w, double h, double ms) {
    final open = _seg(ms, 2, 14);
    final mark = 0.94 + 0.06 * _seg(ms, 2, 17);
    final bm = _seg(ms, 9, 16);
    const spine = 0.4993, top = 0.0, bottom = 0.3641;
    const bmRect = Rect.fromLTRB(0.5095, 0.1709, 0.5393, 0.2549);

    return Opacity(
      opacity: (ms / 46).clamp(0.0, 1.0),
      child: Stack(
        children: [
          Positioned.fill(
            child: Transform.scale(
              scale: mark,
              alignment: const FractionalOffset(0.4993, 0.182),
              child: Stack(
                children: [
                  // Left page opens leftwards from the spine.
                  _piece(Rect.fromLTRB(
                      spine - (spine - 0.3902) * open, top, spine, bottom)),
                  // Right page opens rightwards; the bookmark is cut out of
                  // it so it can arrive on its own.
                  _piece(
                      Rect.fromLTRB(
                          spine, top, spine + (0.6084 - spine) * open, bottom),
                      hole: bmRect),
                  Positioned.fill(
                    child: Opacity(
                      opacity: bm,
                      child: Transform.translate(
                        offset: Offset(0, -4 * (1 - bm)),
                        child: Stack(children: [_piece(bmRect)]),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          for (var i = 0; i < 10; i++)
            () {
              final t = _seg(ms, 13 + 1.2 * i, 20 + 1.2 * i);
              return Positioned.fill(
                child: Opacity(
                  opacity: t,
                  child: Transform.translate(
                    offset: Offset(0, 10 * (1 - t)),
                    child: Stack(children: [
                      _piece(Rect.fromLTRB(_letters[i], 0.5, _letters[i + 1], 1)),
                    ]),
                  ),
                ),
              );
            }(),
        ],
      ),
    );
  }
}

/// Clips to a rectangle given in fractions of the box, minus an optional hole.
class _RectClip extends CustomClipper<Path> {
  final Rect r;
  final Rect? hole;
  const _RectClip(this.r, this.hole);

  Rect _px(Rect f, Size s) => Rect.fromLTRB(
      f.left * s.width, f.top * s.height, f.right * s.width, f.bottom * s.height);

  @override
  Path getClip(Size size) {
    final p = Path()..addRect(_px(r, size));
    if (hole == null) return p;
    return Path.combine(
        PathOperation.difference, p, Path()..addRect(_px(hole!, size)));
  }

  @override
  bool shouldReclip(_RectClip old) => old.r != r || old.hole != hole;
}
