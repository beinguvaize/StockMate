import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/widgets/banner_carousel.dart';
import 'package:mobile_app/core/widgets/expiry_alert_card.dart';
import 'package:mobile_app/core/widgets/trial_banner.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_aging_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/sales/presentation/sale_type_sheet.dart';
import 'package:mobile_app/widgets/motion/motion_refresh.dart';

import 'dashboard_logic.dart';
import 'dashboard_screen.dart' show showNotificationsSheet;
import 'providers/telemetry_provider.dart';
import 'widgets/dash_canvas.dart';

/// The phone Dashboard: one calm, scrolling screen. Read-only -- every figure
/// comes from providers that already exist; nothing here writes.
class DashboardHome extends ConsumerStatefulWidget {
  final void Function(String feature) onTabSwitch;
  const DashboardHome({super.key, required this.onTabSwitch});

  @override
  ConsumerState<DashboardHome> createState() => _DashboardHomeState();
}

class _DashboardHomeState extends ConsumerState<DashboardHome>
    with WidgetsBindingObserver {
  int _periodIdx = 0;

  static const _periods = DashPeriod.values;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Refresh dashboard data when the app returns to the foreground.
    if (state == AppLifecycleState.resumed) _refresh();
  }

  // Re-fetch everything the screen shows. The period summaries follow
  // recentSalesProvider, so invalidating it refreshes them too.
  Future<void> _refresh() async {
    ref.invalidate(telemetryProvider);
    ref.invalidate(recentSalesProvider);
    ref.invalidate(clientsProvider);
    ref.invalidate(productsProvider);
    try {
      await ref.read(telemetryProvider.future);
    } catch (_) {}
  }

  void _push(Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen))
        .then((_) {
      if (mounted) _refresh();
    });
  }

  bool _can(TenantContext? ctx, String feature) =>
      ctx != null &&
      canAccess(feature,
          roles: ctx.roles, plan: ctx.plan, permissions: ctx.permissions);

  Widget _in(int index, Widget child) => BlEntrance(index: index, child: child);

  static String _periodWord(DashPeriod p) => switch (p) {
        DashPeriod.today => 'today',
        DashPeriod.week => 'in the last 7 days',
        DashPeriod.month => 'this month',
      };

  @override
  Widget build(BuildContext context) {
    final ctx = ref.watch(tenantContextProvider).value;
    final tele = ref.watch(telemetryProvider);
    final m = tele.valueOrNull;
    final now = DateTime.now();
    final period = _periods[_periodIdx];

    final r = periodRange(now, period);
    final today = periodRange(now, DashPeriod.today);
    final summary = ref.watch(
        salesPeriodSummaryProvider((from: r.from, to: r.to)));
    final todaySummary = period == DashPeriod.today
        ? summary
        : ref.watch(salesPeriodSummaryProvider((from: today.from, to: today.to)));

    // ── Hero figure: server first, local telemetry when it is unreachable ──
    final s = summary.valueOrNull;
    double? amount;
    int? bills;
    if (s != null) {
      amount = (s['total'] as num?)?.toDouble();
      bills = (s['bills'] as num?)?.toInt();
    }
    if (amount == null && m != null) {
      if (period == DashPeriod.today) {
        amount = m.todaySales;
        bills = m.todayBillCount;
      } else if (period == DashPeriod.week && m.weeklySales.isNotEmpty) {
        amount = m.weeklySales.fold<double>(0, (a, d) => a + d.amount);
      }
    }
    final heroLoading = summary.isLoading && summary.valueOrNull == null;
    final empty = amount != null && amount <= 0 && (bills ?? 0) == 0;
    final String label;
    if (empty) {
      label = period == DashPeriod.today
          ? 'No bills yet today'
          : 'No bills ${_periodWord(period)}';
    } else {
      final head = switch (period) {
        DashPeriod.today => 'Sales today',
        DashPeriod.week => 'Sales, last 7 days',
        DashPeriod.month => 'Sales this month',
      };
      label = bills == null
          ? head
          : '$head · $bills ${bills == 1 ? 'bill' : 'bills'}';
    }

    final recent = ref.watch(recentSalesProvider).valueOrNull;
    final clients = _can(ctx, 'clients') ? ref.watch(clientsProvider).valueOrNull : null;
    final products = _can(ctx, 'inventory') ? ref.watch(productsProvider).valueOrNull : null;

    final debtors = clients == null
        ? null
        : topDebtors([
            for (final c in clients)
              (
                id: c.id,
                name: (c.name ?? '').trim().isEmpty ? 'Customer' : c.name!.trim(),
                owed: c.outstandingBalance ?? 0,
              )
          ]);
    final reorder = products == null
        ? null
        : reorderSoon([
            for (final p in products) (id: p.id, name: p.name, stock: p.stock)
          ]);
    final sellers = recent == null ? const <BestSeller>[] : bestSellersToday(recent, now);

    final owed = m?.outstandingCollections ?? 0;
    final actions = <DashAction>[
      DashAction(DashAction.newSale, Bl.amber, 'New sale', 'Bill a customer',
          () async {
        await navigateToNewSale(context, ctx?.roles ?? const []);
        if (mounted) _refresh();
      }, primary: true),
      if (_can(ctx, 'clients'))
        DashAction(
            DashAction.collect,
            Bl.green,
            'Collect',
            owed > 0 ? '${Money.inr(owed)} due' : 'Nothing due',
            () => _push(const CRMScreen())),
      if (_can(ctx, 'purchases'))
        DashAction(DashAction.purchase, Bl.blue, 'Purchase',
            'Stock in from a supplier', () => _push(const PurchasesScreen())),
      if (_can(ctx, 'expenses'))
        DashAction(DashAction.expense, const Color(0xFFD2502E), 'Expense',
            'Log money spent', () => _push(const FinanceScreen())),
    ];

    final weekHasData =
        m != null && m.weeklySales.fold<double>(0, (a, d) => a + d.amount) > 0;
    final split = splitSegments(todaySummary.valueOrNull);
    final splitTotal = split.fold<double>(0, (a, e) => a + e.amount);
    final duesTotal = debtors == null
        ? 0.0
        : (m?.outstandingCollections ??
            debtors.top.fold<double>(0, (a, d) => a + d.owed));

    final blocks = <Widget>[
      DashPeriodPills(
        index: _periodIdx,
        onChanged: (v) => setState(() => _periodIdx = v),
      ),
      heroLoading
          ? const _HeroSkeleton()
          : DashHero(
              // Rebuild (and count up again) when the period changes.
              key: ValueKey(period),
              label: label,
              amount: amount,
              deltaPct: period == DashPeriod.today && m != null && !empty
                  ? m.salesDeltaPct
                  : null,
            ),
      if (period == DashPeriod.today && m != null)
        DashHourChart(hourly: m.hourlySales, now: now),
      DashActionTiles(actions: actions),
      if (split.isNotEmpty) ...[
        DashSection('How you were paid', figure: Money.inr(splitTotal)),
        ...dashPaidRows(split),
      ],
      if (m != null) ...[
        const DashSection('Today'),
        DashTodayBox(
          m: m,
          onExpenses:
              _can(ctx, 'expenses') ? () => _push(const FinanceScreen()) : null,
          onPurchases: _can(ctx, 'purchases')
              ? () => _push(const PurchasesScreen())
              : null,
          onCash:
              _can(ctx, 'daybook') ? () => _push(const DayBookScreen()) : null,
          onBills: () => widget.onTabSwitch('sales'),
        ),
      ] else if (tele.isLoading)
        const _TilesSkeleton(),
      if (weekHasData) ...[
        DashSection('This week',
            link: _can(ctx, 'reports') ? 'Reports' : null,
            onLink: () => _push(const ReportsScreen())),
        DashWeek(days: m.weeklySales),
      ],
      if (debtors != null && debtors.count > 0) ...[
        DashSection('Money owed to you', figure: Money.inr(duesTotal)),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
          child: Row(
            children: [
              Text(
                  '${debtors.count} ${debtors.count == 1 ? 'customer' : 'customers'} · ',
                  style: Bl.inter(12,
                      w: FontWeight.w500, c: const Color(0xFF7A8088))),
              BlTap(
                onTap: () => _push(const ClientAgingScreen()),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Text('All dues',
                      style:
                          Bl.inter(12, w: FontWeight.w600, c: Bl.amberDeep)),
                ),
              ),
            ],
          ),
        ),
        for (var k = 0; k < debtors.top.length; k++)
          DashRow(
            lead: DashRow.text(initials(debtors.top[k].name)),
            title: debtors.top[k].name,
            trailing: DashRow.amount(Money.inr(debtors.top[k].owed)),
            chevron: true,
            divider: k < debtors.top.length - 1,
            onTap: () => _push(const CRMScreen()),
          ),
      ],
      if (reorder != null && reorder.top.isNotEmpty) ...[
        DashSection('Reorder soon',
            link: [
              if (reorder.out > 0) '${reorder.out} out',
              if (reorder.low > 0) '${reorder.low} low',
            ].join(' · '),
            onLink: () => widget.onTabSwitch('inventory')),
        for (var k = 0; k < reorder.top.length; k++)
          DashRow(
            lead: DashRow.text(initials(reorder.top[k].name)),
            title: reorder.top[k].name,
            sub: reorder.top[k].isOut
                ? 'Out of stock'
                : stockLeft(reorder.top[k].stock),
            trailing: const DashReorderPill(),
            divider: k < reorder.top.length - 1,
            onTap: _can(ctx, 'purchases')
                ? () => _push(const PurchasesScreen())
                : null,
          ),
      ],
      if (sellers.isNotEmpty) ...[
        const DashSection('Best sellers today'),
        for (var k = 0; k < sellers.length; k++)
          DashRow(
            lead: DashRow.text('${k + 1}'),
            title: sellers[k].name,
            sub: '${qtyText(sellers[k].qty)} sold',
            trailing: DashRow.amount(Money.inr(sellers[k].revenue)),
            divider: k < sellers.length - 1,
          ),
      ],
    ];

    return ColoredBox(
      color: Bl.white,
      child: MotionRefresh(
        onRefresh: _refresh,
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics()),
          padding: EdgeInsets.only(
              bottom: 96 + MediaQuery.of(context).viewPadding.bottom),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DashHeader(
                onMenu: () => Scaffold.of(context).openDrawer(),
                onBell: () => showNotificationsSheet(context),
                showingSavedFigures: m?.fromCache == true,
              ),
              if (ctx != null &&
                  ctx.tenant.status == 'TRIAL' &&
                  ctx.trialDaysLeft <= 7)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
                  child: TrialBanner(daysLeft: ctx.trialDaysLeft),
                ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 14),
                child: ExpiryAlertCard(),
              ),
              for (var k = 0; k < blocks.length; k++) _in(k, blocks[k]),
              const Padding(
                padding: EdgeInsets.fromLTRB(14, 24, 14, 0),
                child: BannerCarousel(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroSkeleton extends StatelessWidget {
  const _HeroSkeleton();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _bar(120, 14),
            const SizedBox(height: 10),
            _bar(200, 42),
          ],
        ),
      );

  static Widget _bar(double w, double h) => Container(
        width: w,
        height: h,
        decoration: BoxDecoration(
          color: const Color(0x0F000000),
          borderRadius: BorderRadius.circular(h > 30 ? 16 : 7),
        ),
      );
}

class _TilesSkeleton extends StatelessWidget {
  const _TilesSkeleton();

  @override
  Widget build(BuildContext context) {
    Widget box() => Expanded(
          child: Container(
            height: 92,
            decoration: BoxDecoration(
              color: const Color(0x0F000000),
              borderRadius: BorderRadius.circular(22),
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
      child: Column(children: [
        Row(children: [box(), const SizedBox(width: 8), box()]),
        const SizedBox(height: 8),
        Row(children: [box(), const SizedBox(width: 8), box()]),
      ]),
    );
  }
}
