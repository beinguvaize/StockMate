import 'package:flutter/material.dart';
import 'package:mobile_app/core/utils/money.dart';

import '../dashboard_logic.dart';
import 'dash_common.dart';

/// The one number the screen is about: "Sales today · 38 bills" over a huge
/// total. Counts up from zero the first time it is shown, then snaps to any
/// later value (a refresh must not replay a show).
class HeroTotal extends StatefulWidget {
  final String label;

  /// null while there is no figure to show (month, offline).
  final double? amount;
  final String? emptyNote;
  const HeroTotal(
      {super.key, required this.label, required this.amount, this.emptyNote});

  @override
  State<HeroTotal> createState() => _HeroTotalState();
}

class _HeroTotalState extends State<HeroTotal>
    with SingleTickerProviderStateMixin {
  // easeOutQuart
  static const _quart = Cubic(0.165, 0.84, 0.44, 1);
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 900));
  bool _played = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _maybePlay();
  }

  @override
  void didUpdateWidget(HeroTotal old) {
    super.didUpdateWidget(old);
    _maybePlay();
  }

  void _maybePlay() {
    final a = widget.amount;
    if (_played || a == null) return;
    _played = true;
    if (a <= 0 || MediaQuery.maybeDisableAnimationsOf(context) == true) {
      _c.value = 1;
      return;
    }
    _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.amount;
    return Column(
      children: [
        Text(widget.label,
            textAlign: TextAlign.center,
            style: DashText.tight(14, w: FontWeight.w600, c: DashColors.mute)),
        const SizedBox(height: 6),
        if (a == null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(widget.emptyNote ?? '—',
                style: DashText.tight(18, w: FontWeight.w600, c: DashColors.mute)),
          )
        else
          AnimatedBuilder(
            animation: _c,
            builder: (_, _) {
              final shown = a * _quart.transform(_c.value);
              final p = splitRupees(shown);
              return Semantics(
                label: Money.inrExact(a),
                excludeSemantics: true,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Transform.translate(
                          offset: const Offset(0, -16),
                          child: Text('₹',
                              style: DashText.tight(34,
                                  w: FontWeight.w800, c: DashColors.ink2)),
                        ),
                        const SizedBox(width: 2),
                        Text(Money.plain(p.whole),
                            style: DashText.tight(60, w: FontWeight.w800, ls: -0.05)
                                .copyWith(fontFeatures: const [
                              FontFeature.tabularFigures()
                            ])),
                        Text('.${p.paise.toString().padLeft(2, '0')}',
                            style: DashText.tight(30,
                                    w: FontWeight.w800,
                                    c: DashColors.faint,
                                    ls: -0.03)
                                .copyWith(fontFeatures: const [
                              FontFeature.tabularFigures()
                            ])),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}

/// "▲ 12% vs yesterday, same time". Green up, red down, muted when level.
class DeltaPill extends StatelessWidget {
  final double? deltaPct;
  const DeltaPill({super.key, required this.deltaPct});

  @override
  Widget build(BuildContext context) {
    final d = deltaPill(deltaPct);
    if (d == null) return const SizedBox.shrink();
    final Color c = d.dir > 0
        ? DashColors.green
        : (d.dir < 0 ? DashColors.red : DashColors.mute);
    final lead = d.dir > 0 ? '▲ ${d.pct}%' : (d.dir < 0 ? '▼ ${d.pct}%' : 'Level');
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
        decoration: BoxDecoration(
          color: DashColors.card,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text.rich(TextSpan(children: [
          TextSpan(
              text: lead,
              style: DashText.tight(13, w: FontWeight.w600, c: c)),
          TextSpan(
              text: ' vs yesterday, same time',
              style: DashText.tight(13, w: FontWeight.w500, c: DashColors.mute)),
        ])),
      ),
    );
  }
}
