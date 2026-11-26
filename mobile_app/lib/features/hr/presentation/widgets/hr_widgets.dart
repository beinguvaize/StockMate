import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';

/// The big figure at the top of Payroll with three small ones under it.
class PayHero extends StatelessWidget {
  final String label;
  final String figure;
  final List<({String value, String label, Color? color})> stats;
  const PayHero(
      {super.key, required this.label, required this.figure, required this.stats});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Bl.inter(13, w: FontWeight.w500)),
            const SizedBox(height: 6),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(figure,
                  style: Bl.tight(36, w: FontWeight.w700, ls: -0.04, h: 1.05)),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                for (final s in stats)
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(s.value,
                              maxLines: 1,
                              style: Bl.tight(15,
                                  w: FontWeight.w700, c: s.color ?? Bl.ink)),
                        ),
                        const SizedBox(height: 1),
                        Text(s.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.inter(11.5,
                                w: FontWeight.w500, c: const Color(0xFF7A8088))),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      );
}

/// Active / On leave / Inactive.
class StaffStatusPill extends StatelessWidget {
  /// ACTIVE, ON_LEAVE or INACTIVE.
  final String statusKey;
  const StaffStatusPill(this.statusKey, {super.key});

  @override
  Widget build(BuildContext context) => switch (statusKey) {
        'ACTIVE' => const BlStatusPill('Active',
            fg: Color(0xFF17663A), bg: Color(0xFFE3F5EA)),
        'ON_LEAVE' => const BlStatusPill('On leave',
            fg: Color(0xFF1D4E9E), bg: Color(0xFFE4EEFF)),
        _ => const BlStatusPill('Inactive',
            fg: Color(0xFF6E737A), bg: Color(0xFFEFEEEC)),
      };
}

/// A label on the left and its value on the right, with a hairline under it.
class PayFact extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final bool strong;
  final bool last;
  const PayFact(this.label, this.value,
      {super.key, this.valueColor, this.strong = false, this.last = false});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 11),
        decoration: BoxDecoration(
            border:
                last ? null : const Border(bottom: BorderSide(color: Bl.sep))),
        child: Row(
          children: [
            Expanded(
                child: Text(label,
                    style: strong
                        ? Bl.tight(14.5, w: FontWeight.w600)
                        : Bl.inter(13.5))),
            Text(value,
                style: Bl.tight(strong ? 15.5 : 14,
                    w: strong ? FontWeight.w700 : FontWeight.w600,
                    c: valueColor ?? Bl.ink)),
          ],
        ),
      );
}

/// The red box a failed save explains itself in.
class PayError extends StatelessWidget {
  final String text;
  const PayError(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
            color: Bl.redSoft, borderRadius: BorderRadius.circular(12)),
        child: Text(text,
            style: Bl.inter(12.5, w: FontWeight.w500, c: Bl.redDeep)),
      );
}

/// One of a few choices in a well (pay type, status).
class PayChoice extends StatelessWidget {
  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;
  const PayChoice(
      {super.key,
      required this.labels,
      required this.index,
      required this.onChanged});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
            color: Bl.wellSoft, borderRadius: BorderRadius.circular(14)),
        child: Row(
          children: [
            for (var i = 0; i < labels.length; i++)
              Expanded(
                child: Semantics(
                  button: true,
                  selected: index == i,
                  label: labels[i],
                  excludeSemantics: true,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => onChanged(i),
                    child: Container(
                      height: 44,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: index == i ? Bl.white : null,
                        borderRadius: BorderRadius.circular(11),
                        boxShadow: index == i
                            ? const [
                                BoxShadow(
                                    color: Color(0x1F000000),
                                    blurRadius: 2,
                                    offset: Offset(0, 1)),
                              ]
                            : null,
                      ),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: Text(labels[i],
                              maxLines: 1,
                              style: Bl.tight(13.5,
                                  w: FontWeight.w600,
                                  ls: 0,
                                  c: index == i ? Bl.ink : Bl.body)),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}
