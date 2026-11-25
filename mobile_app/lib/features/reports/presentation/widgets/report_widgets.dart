import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/reports/data/report_params.dart';

const reportGrey = Color(0xFF7A8088);
const reportGreen = Color(0xFF17663A);
const reportMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// Slice colours for a share-of-total ring, biggest first.
const reportShareColors = [
  Bl.ink,
  Bl.brand,
  Color(0xFF3B82F6),
  Color(0xFFC9C8C6),
];

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// The last [days] days, today included.
DateTimeRange reportLastDays(int days) {
  final today = _day(DateTime.now());
  return DateTimeRange(
      start: today.subtract(Duration(days: days - 1)), end: today);
}

/// "2026-11-21" → "21 Nov", with the year when asked or when it is not this
/// year.
String reportDate(String iso, {bool year = false}) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  final showYear = year || d.year != DateTime.now().year;
  return '${d.day} ${reportMonths[d.month - 1]}${showYear ? ' ${d.year}' : ''}';
}

String _rangeLabel(DateTimeRange r) {
  String f(DateTime d, bool y) =>
      '${d.day} ${reportMonths[d.month - 1]}${y ? ' ${d.year}' : ''}';
  final thisYear = DateTime.now().year;
  final years = r.start.year != r.end.year || r.end.year != thisYear;
  return '${f(r.start, r.start.year != r.end.year)} – ${f(r.end, years)}';
}

/// The date pill and the 7D / 30D / 90D switch every report opens with.
class ReportRangeBar extends StatelessWidget {
  final DateTimeRange range;
  final ValueChanged<DateTimeRange> onChanged;
  const ReportRangeBar({super.key, required this.range, required this.onChanged});

  Future<void> _pick(BuildContext context) async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDateRange: range,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(
              primary: Bl.ink, onPrimary: Bl.white, onSurface: Bl.ink),
        ),
        child: child!,
      ),
    );
    if (picked != null) onChanged(picked);
  }

  @override
  Widget build(BuildContext context) {
    final today = _day(DateTime.now());
    final span = _day(range.end) == today
        ? today.difference(_day(range.start)).inDays + 1
        : 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(
            child: Semantics(
              button: true,
              label: 'Dates, ${_rangeLabel(range)}. Change',
              excludeSemantics: true,
              child: BlTap(
                onTap: () => _pick(context),
                child: Container(
                  height: 32,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                      color: Bl.well,
                      borderRadius: BorderRadius.circular(999)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const BlIcon(
                          '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
                          size: 14),
                      const SizedBox(width: 7),
                      Flexible(
                        child: Text(_rangeLabel(range),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.tight(13, w: FontWeight.w600)),
                      ),
                      const SizedBox(width: 7),
                      const BlIcon(BlIcons.chevronDown,
                          size: 13, color: reportGrey),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
                color: Bl.well, borderRadius: BorderRadius.circular(999)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final d in const [7, 30, 90])
                  Semantics(
                    button: true,
                    selected: span == d,
                    label: 'Last $d days',
                    excludeSemantics: true,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => onChanged(reportLastDays(d)),
                      child: Container(
                        height: 26,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: span == d ? Bl.white : null,
                          borderRadius: BorderRadius.circular(999),
                          boxShadow: span == d
                              ? const [
                                  BoxShadow(
                                      color: Color(0x1F000000),
                                      blurRadius: 2,
                                      offset: Offset(0, 1)),
                                ]
                              : null,
                        ),
                        child: Text('${d}D',
                            style: Bl.tight(12,
                                w: FontWeight.w600,
                                ls: 0,
                                c: span == d ? Bl.ink : Bl.body)),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A figure with its label under it, as in a report's stat row.
class ReportStat extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  final bool center;
  const ReportStat(this.value, this.label,
      {super.key, this.color = Bl.ink, this.center = false});

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          crossAxisAlignment:
              center ? CrossAxisAlignment.center : CrossAxisAlignment.start,
          children: [
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(15, w: FontWeight.w700, c: color)),
            const SizedBox(height: 1),
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.inter(11.5, w: FontWeight.w500, c: reportGrey)),
          ],
        ),
      );
}

/// Label, big figure and a row of stats: how most reports open.
class ReportHero extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final List<Widget> stats;
  const ReportHero(
      {super.key,
      required this.label,
      required this.value,
      this.color = Bl.ink,
      this.stats = const []});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Bl.inter(13, w: FontWeight.w500, c: Bl.body)),
            const SizedBox(height: 6),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value,
                  style: Bl.tight(36,
                      w: FontWeight.w700, ls: -0.04, h: 1.05, c: color)),
            ),
            if (stats.isNotEmpty) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  for (var i = 0; i < stats.length; i++) ...[
                    if (i > 0) const SizedBox(width: 10),
                    stats[i],
                  ],
                ],
              ),
            ],
          ],
        ),
      );
}

/// One bar per day for the last seven days of [range], the tallest in amber.
/// [byDate] is keyed by YYYY-MM-DD.
class ReportDayBars extends StatelessWidget {
  final Map<String, double> byDate;
  final DateTimeRange range;
  final double height;
  const ReportDayBars(
      {super.key, required this.byDate, required this.range, this.height = 96});

  @override
  Widget build(BuildContext context) {
    final end = _day(range.end);
    final days = [
      for (var i = 6; i >= 0; i--) end.subtract(Duration(days: i)),
    ];
    String key(DateTime d) =>
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final values = [for (final d in days) byDate[key(d)] ?? 0];
    final top = values.fold<double>(0, math.max);
    return Semantics(
      label: [
        for (var i = 0; i < 7; i++)
          '${days[i].day} ${reportMonths[days[i].month - 1]}: ${Money.inr(values[i])}',
      ].join(', '),
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
        child: Column(
          children: [
            SizedBox(
              height: height,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < 7; i++) ...[
                    if (i > 0) const SizedBox(width: 8),
                    Expanded(
                      child: FractionallySizedBox(
                        heightFactor: top <= 0
                            ? 0.04
                            : (values[i] / top).clamp(0.04, 1.0),
                        child: Container(
                          decoration: BoxDecoration(
                            color: top > 0 && values[i] == top
                                ? Bl.brand
                                : const Color(0xFFD9D8D5),
                            borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(6),
                                bottom: Radius.circular(2)),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                for (var i = 0; i < 7; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child: Text('${days[i].day}',
                        textAlign: TextAlign.center,
                        style: Bl.inter(11, w: FontWeight.w500, c: Bl.mute)),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// One slice of a share-of-total list.
typedef ReportShare = ({String name, double value, int count});

/// The biggest [keep] shares, with the rest folded into "Others".
List<ReportShare> reportTopShares(Map<String, (double, int)> by,
    {int keep = 3}) {
  final sorted = [
    for (final e in by.entries)
      (name: e.key, value: e.value.$1, count: e.value.$2),
  ]..sort((a, b) => b.value.compareTo(a.value));
  if (sorted.length <= keep + 1) return sorted;
  final rest = sorted.skip(keep);
  return [
    ...sorted.take(keep),
    (
      name: 'Others',
      value: rest.fold<double>(0, (s, e) => s + e.value),
      count: rest.fold<int>(0, (s, e) => s + e.count),
    ),
  ];
}

/// A ring split by share, with the total in the middle.
class ReportDonut extends StatelessWidget {
  final List<double> values;
  final String total;
  final String label;
  const ReportDonut(
      {super.key, required this.values, required this.total, required this.label});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 16),
        child: Center(
          child: SizedBox(
            width: 164,
            height: 164,
            child: CustomPaint(
              painter: _DonutPainter(values),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 30),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(total,
                            style: Bl.tight(21,
                                w: FontWeight.w700, ls: -0.03)),
                      ),
                      const SizedBox(height: 2),
                      Text(label,
                          style: Bl.inter(11.5,
                              w: FontWeight.w500, c: reportGrey)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _DonutPainter extends CustomPainter {
  final List<double> values;
  _DonutPainter(this.values);

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 24.0;
    final rect = Offset.zero & size;
    final arc = rect.deflate(stroke / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    final sum = values.fold<double>(0, (s, v) => s + (v > 0 ? v : 0));
    if (sum <= 0) {
      canvas.drawArc(arc, 0, math.pi * 2, false,
          paint..color = const Color(0xFFE9E8E6));
      return;
    }
    final live = values.where((v) => v > 0).length;
    final gap = live > 1 ? 0.075 : 0.0;
    var start = -math.pi / 2;
    for (var i = 0; i < values.length; i++) {
      if (values[i] <= 0) continue;
      final sweep = values[i] / sum * math.pi * 2;
      canvas.drawArc(
          arc,
          start,
          math.max(sweep - gap, 0.01),
          false,
          paint
            ..color = reportShareColors[
                math.min(i, reportShareColors.length - 1)]);
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) => old.values != values;
}

/// A dot, a name, a count, an amount and its share of the total.
class ReportShareRow extends StatelessWidget {
  final Color color;
  final String name;
  final String sub;
  final double amount;
  final double total;
  const ReportShareRow(
      {super.key,
      required this.color,
      required this.name,
      required this.sub,
      required this.amount,
      required this.total});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Bl.sep))),
        child: Row(
          children: [
            Container(
                width: 10,
                height: 10,
                decoration:
                    BoxDecoration(color: color, shape: BoxShape.circle)),
            const SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(
                      text: name,
                      style: Bl.tight(14.5, w: FontWeight.w600)),
                  TextSpan(
                      text: '  $sub', style: Bl.inter(12, c: reportGrey)),
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Text(Money.inr(amount),
                style: Bl.tight(14.5, w: FontWeight.w600)),
            SizedBox(
              width: 36,
              child: Text(
                  total > 0 ? '${(amount / total * 100).round()}%' : '',
                  textAlign: TextAlign.right,
                  style:
                      Bl.inter(12, w: FontWeight.w500, c: reportGrey)),
            ),
          ],
        ),
      );
}

/// An avatar, two lines and an amount: one entry in a report's list.
class ReportEntryRow extends StatelessWidget {
  final String name;
  final String sub;
  final String amount;
  final Color amountColor;
  final Widget? leading;
  final VoidCallback? onTap;
  const ReportEntryRow(
      {super.key,
      required this.name,
      required this.sub,
      required this.amount,
      this.amountColor = Bl.ink,
      this.leading,
      this.onTap});

  @override
  Widget build(BuildContext context) {
    final row = Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Bl.sep))),
      child: Row(
        children: [
          leading ?? BlTintAvatar(name),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(14.5, w: FontWeight.w600)),
                const SizedBox(height: 1),
                Text(sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.inter(12, c: reportGrey)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(amount,
              style: Bl.tight(14.5, w: FontWeight.w600, c: amountColor)),
        ],
      ),
    );
    return onTap == null ? row : BlTap(onTap: onTap, child: row);
  }
}

/// The frame every report shares: back header, the shop it is for, and the
/// loading and failure states. [builder] gets the range as query params.
class ReportPage extends ConsumerWidget {
  final String title;
  final DateTimeRange range;
  final Widget? trailing;
  final Widget Function(BuildContext context, ReportParams params) builder;
  const ReportPage(
      {super.key,
      required this.title,
      required this.range,
      required this.builder,
      this.trailing});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantAsync = ref.watch(tenantContextProvider);
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(title: title, trailing: trailing),
            Expanded(
              child: tenantAsync.when(
                loading: () => const ReportLoading(),
                error: (e, _) => ReportError(e),
                data: (ctx) => ctx == null
                    ? const ReportError('Sign out and back in.')
                    : builder(
                        context,
                        ReportParams(
                            tenantId: ctx.tenantId,
                            from: range.start,
                            to: range.end)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ReportLoading extends StatelessWidget {
  const ReportLoading({super.key});

  @override
  Widget build(BuildContext context) => const Center(
      child: CircularProgressIndicator(color: Bl.amber, strokeWidth: 2));
}

class ReportError extends StatelessWidget {
  final Object error;
  const ReportError(this.error, {super.key});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
              'Could not load this report. Check your internet and try again. ($error)',
              textAlign: TextAlign.center,
              style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
        ),
      );
}

const reportMonthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/// Month stepper for the GST returns: back, "October 2026", forward. Forward
/// stops at the current month.
class ReportMonthBar extends StatelessWidget {
  final int year;
  final int month;
  final void Function(int year, int month) onChanged;
  const ReportMonthBar(
      {super.key, required this.year, required this.month, required this.onChanged});

  Widget _btn(String icon, String label, VoidCallback? onTap) => Semantics(
        button: true,
        enabled: onTap != null,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: onTap,
          child: Opacity(
            opacity: onTap == null ? 0.4 : 1,
            child: Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                  color: Bl.white, shape: BoxShape.circle),
              child: BlIcon(icon, size: 18),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final atEnd = year > now.year || (year == now.year && month >= now.month);
    void step(int by) {
      final d = DateTime(year, month + by, 1);
      onChanged(d.year, d.month);
    }

    return Container(
      height: 46,
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
          color: Bl.wellSoft, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: [
          _btn(BlIcons.back, 'Previous month', () => step(-1)),
          Expanded(
            child: Text('${reportMonthsFull[month - 1]} $year',
                textAlign: TextAlign.center,
                style: Bl.tight(15, w: FontWeight.w600)),
          ),
          _btn(BlIcons.chevronRight, 'Next month', atEnd ? null : () => step(1)),
        ],
      ),
    );
  }
}

/// A plain label and value line inside a report card.
class ReportLine extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final bool total;
  final bool last;
  const ReportLine(this.label, this.value,
      {super.key, this.color = Bl.ink, this.total = false, this.last = false});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: last || total
            ? null
            : const BoxDecoration(
                border: Border(bottom: BorderSide(color: Bl.sep))),
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  style: Bl.inter(13.5,
                      w: FontWeight.w500, c: total ? Bl.ink : Bl.body)),
            ),
            const SizedBox(width: 10),
            Text(value,
                style: Bl.tight(14,
                    w: total ? FontWeight.w700 : FontWeight.w600, c: color)),
          ],
        ),
      );
}
