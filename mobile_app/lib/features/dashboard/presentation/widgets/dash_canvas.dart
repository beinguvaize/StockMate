import 'dart:math' as math;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart'
    show connectivityProvider, pendingSyncCountProvider;
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/widgets/logo_mark.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';

import '../dashboard_logic.dart';
import '../providers/telemetry_provider.dart';

/// The Dashboard as drawn on the canvas ("Dashboard (top)" and "Dashboard
/// scrolled"). Each class here is one block of that screen.

// ── Header ──────────────────────────────────────────────────────────────────

/// Logo mark, shop name, "Owner · Synced", then the bell and the menu.
class DashHeader extends ConsumerWidget {
  final VoidCallback onMenu;
  final VoidCallback onBell;
  final bool showingSavedFigures;
  const DashHeader(
      {super.key,
      required this.onMenu,
      required this.onBell,
      this.showingSavedFigures = false});

  static String _role(List<String> roles) {
    if (roles.contains('OWNER')) return 'Owner';
    if (roles.contains('GLOBAL_ADMIN')) return 'Admin';
    if (roles.contains('DRIVER')) return 'Driver';
    if (roles.contains('SALES')) return 'Sales';
    if (roles.contains('STAFF')) return 'Staff';
    return '';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ctx = ref.watch(tenantContextProvider).value;
    final pending = ref.watch(pendingSyncCountProvider).asData?.value ?? 0;
    final offline = ref.watch(connectivityProvider).asData?.value ==
        ConnectivityResult.none;

    // The app tracks whether the queue is empty, not WHEN it last synced, so
    // the line says what is true now instead of inventing "2 min ago".
    final String sync;
    final Color dot;
    if (offline) {
      sync = pending > 0 ? 'Offline · $pending waiting' : 'Offline';
      dot = Bl.amber;
    } else if (pending > 0) {
      sync = '$pending waiting to sync';
      dot = Bl.amber;
    } else if (showingSavedFigures) {
      sync = 'Showing saved figures';
      dot = Bl.amber;
    } else {
      sync = 'Synced';
      dot = Bl.green;
    }
    final role = _role(ctx?.roles ?? const []);
    final name = ctx?.tenant.name ?? '';

    Widget icon(String shape, String label, VoidCallback onTap) => BlTap(
          label: label,
          onTap: onTap,
          child: SizedBox(
              width: 36, height: 44, child: Center(child: BlIcon(shape, size: 20))),
        );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 2, 8, 4),
      child: Row(
        children: [
          const LogoMark(height: 20),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name.isEmpty ? 'bookledger' : name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(16, w: FontWeight.w700, ls: -0.02, h: 1.15)),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                        width: 6,
                        height: 6,
                        decoration:
                            BoxDecoration(color: dot, shape: BoxShape.circle)),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(role.isEmpty ? sync : '$role · $sync',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Bl.inter(10.5, w: FontWeight.w500, c: Bl.mute)),
                    ),
                  ],
                ),
              ],
            ),
          ),
          icon(BlIcons.bell, 'Notifications', onBell),
          icon(BlIcons.menu, 'Menu', onMenu),
        ],
      ),
    );
  }
}

// ── Period pills ────────────────────────────────────────────────────────────

class DashPeriodPills extends StatelessWidget {
  final int index;
  final ValueChanged<int> onChanged;
  const DashPeriodPills({super.key, required this.index, required this.onChanged});

  static const _labels = ['Today', 'Week', 'Month'];

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 2, 16, 0),
        child: Row(
          children: [
            for (var i = 0; i < 3; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              BlTabPill(
                selected: i == index,
                onTap: () => onChanged(i),
                child: Text(_labels[i]),
              ),
            ],
          ],
        ),
      );
}

// ── Big figure ──────────────────────────────────────────────────────────────

/// "Sales today · 38 bills", the total counting up, and the comparison line.
class DashHero extends StatelessWidget {
  final String label;
  final double? amount;
  final double? deltaPct; // null = no comparison line
  const DashHero({super.key, required this.label, this.amount, this.deltaPct});

  @override
  Widget build(BuildContext context) {
    final d = deltaPill(deltaPct);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Bl.inter(13, w: FontWeight.w500)),
          const SizedBox(height: 6),
          if (amount == null)
            Text('Not available offline',
                style: Bl.tight(22, w: FontWeight.w700, c: Bl.mute, h: 1.9))
          else
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: amount!),
              duration: motionDur(context, 900),
              curve: Curves.easeOutCubic,
              builder: (_, v, _) {
                final cents = (v * 100).round();
                final whole = Money.inr((cents ~/ 100).toDouble());
                final paise = (cents % 100).toString().padLeft(2, '0');
                return FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Semantics(
                    label: Money.inr(amount!),
                    excludeSemantics: true,
                    child: Text.rich(
                      TextSpan(
                        text: whole.split('.').first,
                        style: Bl.tight(40,
                            w: FontWeight.w700, ls: -0.04, h: 1.05),
                        children: [
                          TextSpan(
                              text: '.$paise',
                              style: Bl.tight(24,
                                  w: FontWeight.w700,
                                  ls: -0.04,
                                  c: const Color(0xFF9AA0A6))),
                        ],
                      ),
                      maxLines: 1,
                    ),
                  ),
                );
              },
            ),
          if (d != null) ...[
            const SizedBox(height: 6),
            Text.rich(
              TextSpan(
                style: Bl.inter(12.5, w: FontWeight.w500, c: const Color(0xFF7A8088)),
                children: [
                  TextSpan(
                      text: d.dir == 0
                          ? 'Same '
                          : '${d.dir > 0 ? '▲' : '▼'} ${d.pct}% ',
                      style: Bl.inter(12.5,
                          w: FontWeight.w600,
                          c: d.dir > 0
                              ? Bl.green
                              : d.dir < 0
                                  ? Bl.red
                                  : const Color(0xFF7A8088))),
                  TextSpan(
                      text: d.dir == 0
                          ? 'as yesterday, same time'
                          : 'vs yesterday, same time'),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Sales by hour ───────────────────────────────────────────────────────────

/// Amber line of sales per hour, 9 am to 9 pm, edge to edge, with a soft fill
/// under it and a ring on the best hour. The line draws itself once.
class DashHourChart extends StatefulWidget {
  final List<double> hourly;
  final DateTime now;
  const DashHourChart({super.key, required this.hourly, required this.now});

  @override
  State<DashHourChart> createState() => _DashHourChartState();
}

class _DashHourChartState extends State<DashHourChart>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1280));

  static const _labels = ['9 am', '12', '3 pm', '6', '9 pm'];

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

  @override
  Widget build(BuildContext context) {
    final h = widget.hourly;
    if (h.isEmpty || h.every((v) => v <= 0)) return const SizedBox.shrink();
    // Only the hours that have happened: the line must not draw a drop to
    // zero for the rest of the day.
    final upTo = (widget.now.hour - kFirstTradingHour + 1).clamp(2, h.length);
    final vals = h.sublist(0, upTo);
    final peak = tallestIndex(vals);
    final peakHour = (kFirstTradingHour + (peak < 0 ? 0 : peak)) % 24;
    final hr = peakHour % 12 == 0 ? 12 : peakHour % 12;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        children: [
          Semantics(
            image: true,
            label:
                'Sales by hour today, highest around $hr ${peakHour < 12 ? 'am' : 'pm'}',
            child: SizedBox(
              height: 112,
              width: double.infinity,
              child: AnimatedBuilder(
                animation: _c,
                builder: (_, _) => CustomPaint(
                    painter: _HourPainter(vals, h.length, peak, _c.value)),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final l in _labels)
                  Text(l,
                      style: Bl.inter(10.5,
                          w: FontWeight.w500, c: const Color(0xFF9AA0A6))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HourPainter extends CustomPainter {
  final List<double> vals;
  final int slots;
  final int peak;
  final double t; // 0..1 across the whole entrance
  const _HourPainter(this.vals, this.slots, this.peak, this.t);

  static double _seg(double t, double a, double b) =>
      t <= a ? 0 : (t >= b ? 1 : MotionCurves.out.transform((t - a) / (b - a)));

  @override
  void paint(Canvas canvas, Size size) {
    final maxV = vals.reduce(math.max);
    if (maxV <= 0) return;
    const top = 30.0, bottom = 20.0;
    final usable = size.height - top - bottom;
    final dx = size.width / (slots - 1);
    final pts = [
      for (var i = 0; i < vals.length; i++)
        Offset(i * dx, top + usable * (1 - vals[i] / maxV)),
    ];
    final line = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final p in pts.skip(1)) {
      line.lineTo(p.dx, p.dy);
    }

    // Fill fades in after the line is most of the way across.
    final fill = _seg(t, 0.55, 1);
    if (fill > 0) {
      final area = Path.from(line)
        ..lineTo(pts.last.dx, size.height)
        ..lineTo(0, size.height)
        ..close();
      canvas.drawPath(
        area,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Bl.amber.withValues(alpha: 0.28 * fill),
              Bl.amber.withValues(alpha: 0),
            ],
          ).createShader(Offset.zero & size),
      );
    }

    final draw = _seg(t, 0, 0.8);
    final metric = line.computeMetrics().first;
    canvas.drawPath(
      metric.extractPath(0, metric.length * draw),
      Paint()
        ..color = Bl.amber
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );

    final dot = _seg(t, 0.75, 1);
    if (peak >= 0 && dot > 0) {
      final c = pts[peak];
      final r = 5 * (0.5 + 0.5 * dot);
      canvas.drawCircle(
          c, r, Paint()..color = Colors.white.withValues(alpha: dot));
      canvas.drawCircle(
          c,
          r,
          Paint()
            ..color = Bl.amber.withValues(alpha: dot)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2.5);
    }
  }

  @override
  bool shouldRepaint(_HourPainter old) =>
      old.t != t || old.vals != vals || old.peak != peak;
}

// ── Four action tiles ───────────────────────────────────────────────────────

class DashAction {
  final String svg; // inside of a 24x24 filled icon
  final Color tint;
  final String title;
  final String sub;
  final VoidCallback onTap;
  final bool primary;
  const DashAction(this.svg, this.tint, this.title, this.sub, this.onTap,
      {this.primary = false});

  static const newSale =
      '<path opacity=".45" d="M5 8h14l1 12a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M8.5 8V7a3.5 3.5 0 017 0v1h-1.6V7a1.9 1.9 0 00-3.8 0v1z"/><path d="M11.2 12.5h1.6v2.2H15v1.6h-2.2v2.2h-1.6v-2.2H9v-1.6h2.2z"/>';
  static const collect =
      '<path opacity=".4" d="M3 7a3 3 0 013-3h11a2 2 0 012 2v1H6a1 1 0 000 2h13a2 2 0 012 2v7a2 2 0 01-2 2H6a3 3 0 01-3-3z"/><path d="M15.5 12H21v4h-5.5a2 2 0 010-4z"/>';
  static const purchase =
      '<path opacity=".4" d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M12 12.6l8.6-4.8.8 1.4-8.6 4.8V21h-1.6v-7L2.6 9.2l.8-1.4z"/>';
  static const expense =
      '<path opacity=".4" d="M5 3h14v18l-2.3-1.6L14.3 21 12 19.4 9.7 21l-2.4-1.6L5 21z"/><path d="M8 7.2h8v1.6H8zM8 11.2h8v1.6H8zM8 15.2h5v1.6H8z"/>';
}

String _hex(Color c) =>
    '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

class DashActionTiles extends StatelessWidget {
  final List<DashAction> actions;
  const DashActionTiles({super.key, required this.actions});

  Widget _tile(DashAction a) {
    final fg = a.primary ? Bl.white : Bl.ink;
    return BlTap(
      label: '${a.title}. ${a.sub}',
      onTap: a.onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: a.primary ? Bl.amber : const Color(0xFFF6F5F3),
            borderRadius: BorderRadius.circular(18)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: a.primary ? const Color(0x38FFFFFF) : Bl.white,
                  borderRadius: BorderRadius.circular(11)),
              child: SvgPicture.string(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${_hex(a.primary ? Bl.white : a.tint)}">${a.svg}</svg>',
                width: 20,
                height: 20,
              ),
            ),
            const SizedBox(height: 10),
            Text(a.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(14.5, w: FontWeight.w700, c: fg)),
            const SizedBox(height: 1),
            Text(a.sub,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.inter(11.5,
                    w: FontWeight.w500,
                    c: a.primary
                        ? const Color(0xD9FFFFFF)
                        : const Color(0xFF7A8088))),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
        child: Column(
          children: [
            for (var r = 0; r < actions.length; r += 2) ...[
              if (r > 0) const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: _tile(actions[r])),
                  const SizedBox(width: 8),
                  Expanded(
                      child: r + 1 < actions.length
                          ? _tile(actions[r + 1])
                          : const SizedBox.shrink()),
                ],
              ),
            ],
          ],
        ),
      );
}

// ── Section line and rows ───────────────────────────────────────────────────

/// Section title on a thick grey rule (`.lh`), with a figure or a link on the
/// right.
class DashSection extends StatelessWidget {
  final String title;
  final String? figure;
  final String? link;
  final VoidCallback? onLink;
  const DashSection(this.title, {super.key, this.figure, this.link, this.onLink});

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Bl.well, width: 6))),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Expanded(
                child: Text(title, style: Bl.tight(14, w: FontWeight.w600))),
            if (figure != null)
              Text(figure!, style: Bl.tight(15, w: FontWeight.w700)),
            if (link != null && link!.isNotEmpty)
              BlTap(
                onTap: onLink,
                child: Padding(
                  padding: const EdgeInsets.only(left: 12, top: 4, bottom: 4),
                  child: Text(link!,
                      style: Bl.inter(14, w: FontWeight.w500, c: Bl.amberDeep)),
                ),
              ),
          ],
        ),
      );
}

/// One list row (`.br.ctr`): round 34px lead, title, small line, figure.
class DashRow extends StatelessWidget {
  final Widget lead;
  final String title;
  final String? sub;
  final Widget? trailing;
  final bool chevron;
  final bool divider;
  final VoidCallback? onTap;
  const DashRow({
    super.key,
    required this.lead,
    required this.title,
    this.sub,
    this.trailing,
    this.chevron = false,
    this.divider = true,
    this.onTap,
  });

  /// Round grey lead holding a line icon.
  static Widget icon(String shape) => Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        decoration: const BoxDecoration(color: Bl.well, shape: BoxShape.circle),
        child: BlIcon(shape, size: 15, color: const Color(0xFF5C5F62)),
      );

  /// Round grey lead holding initials or a rank.
  static Widget text(String t) => Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        decoration: const BoxDecoration(color: Bl.well, shape: BoxShape.circle),
        child: Text(t,
            style: Bl.tight(11,
                w: FontWeight.w700, ls: 0, c: const Color(0xFF5C5F62))),
      );

  static Widget amount(String t, {Color c = Bl.ink}) =>
      Text(t, style: Bl.tight(14, w: FontWeight.w600, c: c));

  @override
  Widget build(BuildContext context) {
    final row = Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
      decoration: divider
          ? const BoxDecoration(
              border: Border(bottom: BorderSide(color: Bl.line)))
          : null,
      child: Row(
        children: [
          lead,
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(14, w: FontWeight.w600)),
                if (sub != null) ...[
                  const SizedBox(height: 1),
                  Text(sub!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.inter(12, c: const Color(0xFF616161))),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 10), trailing!],
          if (chevron) ...[
            const SizedBox(width: 6),
            const BlIcon(BlIcons.chevronRight,
                size: 16, color: Color(0xFFC4C8CC)),
          ],
        ],
      ),
    );
    return onTap == null ? row : BlTap(onTap: onTap, child: row);
  }
}

// ── How you were paid ───────────────────────────────────────────────────────

const _payIcons = {
  'cash':
      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  'upi': '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  'credit':
      '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0114 0M19 8v6M16 11h6"/>',
  'bank': BlIcons.bank,
};

List<Widget> dashPaidRows(List<SplitSegment> segments) => [
      for (var i = 0; i < segments.length; i++)
        DashRow(
          lead: DashRow.icon(_payIcons[segments[i].key] ?? BlIcons.cash),
          title: segments[i].label,
          trailing: DashRow.amount(Money.inr(segments[i].amount)),
          divider: i < segments.length - 1,
        ),
    ];

// ── Today box ───────────────────────────────────────────────────────────────

class DashTodayBox extends StatelessWidget {
  final DashboardMetrics m;
  final VoidCallback? onExpenses;
  final VoidCallback? onPurchases;
  final VoidCallback? onCash;
  final VoidCallback? onBills;
  const DashTodayBox(
      {super.key,
      required this.m,
      this.onExpenses,
      this.onPurchases,
      this.onCash,
      this.onBills});

  static String _n(int n, String one, String many) =>
      n == 0 ? 'None yet' : '$n ${n == 1 ? one : many}';

  static const _file =
      '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>';
  static const _ledger =
      '<path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z"/><path d="M4 19.5V21h16"/>';

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(12, 6, 12, 0),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFECEAE7)),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          children: [
            DashRow(
              lead: DashRow.icon(_file),
              title: 'Expenses today',
              sub: _n(m.expenseCount, 'entry', 'entries'),
              trailing: DashRow.amount(Money.inr(m.todayExpenses)),
              chevron: onExpenses != null,
              onTap: onExpenses,
            ),
            DashRow(
              lead: DashRow.icon(BlIcons.box),
              title: 'Purchases today',
              sub: _n(m.purchaseCount, 'purchase', 'purchases'),
              trailing: DashRow.amount(Money.inr(m.todayPurchases)),
              chevron: onPurchases != null,
              onTap: onPurchases,
            ),
            if (m.hasDayBook)
              DashRow(
                lead: DashRow.icon(_ledger),
                title: 'Cash in hand',
                sub: 'Day book balance',
                trailing: DashRow.amount(Money.inr(m.currentCashBalance)),
                chevron: onCash != null,
                onTap: onCash,
              )
            else
              DashRow(
                lead: DashRow.icon(BlIcons.receipt),
                title: 'Bills today',
                sub: m.todayBillCount == 0 ? 'None yet' : 'Rung today',
                trailing: DashRow.amount('${m.todayBillCount}'),
                chevron: onBills != null,
                onTap: onBills,
              ),
            DashRow(
              lead: DashRow.icon(BlIcons.receipt),
              title: 'Average bill',
              sub: m.todayBillCount == 0
                  ? 'No bills yet'
                  : 'Across ${m.todayBillCount} ${m.todayBillCount == 1 ? 'bill' : 'bills'}',
              trailing: DashRow.amount(
                  m.todayBillCount == 0 ? '—' : Money.inr(m.averageBill)),
              divider: false,
            ),
          ],
        ),
      );
}

// ── This week ───────────────────────────────────────────────────────────────

class DashWeek extends StatelessWidget {
  final List<DayTotals> days;
  const DashWeek({super.key, required this.days});

  static const _wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  @override
  Widget build(BuildContext context) {
    final vals = [for (final d in days) d.amount];
    final total = vals.fold<double>(0, (a, b) => a + b);
    final maxV = vals.fold<double>(0, math.max);
    final last = days.length - 1;

    Widget stat(String label, String value) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Bl.inter(11, c: const Color(0xFF616161))),
              Text(value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.tight(14.5, w: FontWeight.w700)),
            ],
          ),
        );

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
          child: Row(children: [
            stat('Sales', Money.inr(total)),
            const SizedBox(width: 8),
            stat('Daily average',
                Money.inr(days.isEmpty ? 0 : total / days.length)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
          child: Column(
            children: [
              SizedBox(
                height: 74,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    for (var i = 0; i < days.length; i++) ...[
                      if (i > 0) const SizedBox(width: 5),
                      Expanded(
                        child: Semantics(
                          label:
                              '${i == last ? 'Today' : _wd[days[i].date.weekday - 1]} ${Money.inr(vals[i])}',
                          child: TweenAnimationBuilder<double>(
                            tween: Tween(begin: 0, end: 1),
                            duration: motionDur(context, 420 + 40 * i),
                            curve: MotionCurves.out,
                            builder: (_, t, _) => FractionallySizedBox(
                              heightFactor: maxV <= 0
                                  ? 0.04
                                  : (vals[i] / maxV * t).clamp(0.04, 1.0),
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(5),
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: i == last
                                        ? const [Color(0xFFF6B964), Bl.amber]
                                        : const [
                                            Color(0xFFFCE7C8),
                                            Color(0xFFF8CF95)
                                          ],
                                  ),
                                ),
                              ),
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
                  for (var i = 0; i < days.length; i++) ...[
                    if (i > 0) const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                          i == last ? 'Today' : _wd[days[i].date.weekday - 1],
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          softWrap: false,
                          overflow: TextOverflow.visible,
                          style: Bl.inter(10.5,
                              w: FontWeight.w500, c: const Color(0xFF9AA0A6))),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Yellow "Reorder" pill on a stock row.
class DashReorderPill extends StatelessWidget {
  const DashReorderPill({super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
            color: const Color(0xFFFFE48A),
            borderRadius: BorderRadius.circular(6)),
        child: Text('Reorder',
            style: Bl.inter(10.5,
                w: FontWeight.w600, c: const Color(0xFF4F3B00))),
      );
}
