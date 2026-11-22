import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/offline_sales_ui.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/utils/stock_levels.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/core/widgets/banner_carousel.dart' show bannersProvider;
import 'package:mobile_app/core/widgets/expiry_alert_card.dart';
import 'package:mobile_app/core/widgets/trial_banner.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_logic.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';
import 'package:mobile_app/features/finance/presentation/add_expense_screen.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/sales/presentation/sale_type_sheet.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';
import 'package:mobile_app/features/sales/presentation/sales_view.dart'
    show methodLabel, shortSaleId, timeLabel, ymd;
import 'package:mobile_app/widgets/motion/motion_curves.dart';
import 'package:mobile_app/widgets/motion/motion_refresh.dart';
import 'package:mobile_app/widgets/motion/stagger_in.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _promoKey = 'dash.promo.dismissed';

class DashboardHome extends ConsumerStatefulWidget {
  final void Function(String feature) onTabSwitch;
  const DashboardHome({super.key, required this.onTabSwitch});

  @override
  ConsumerState<DashboardHome> createState() => _DashboardHomeState();
}

class _DashboardHomeState extends ConsumerState<DashboardHome>
    with WidgetsBindingObserver {
  bool _introPending = true; // first open of the day only
  bool _playIntro = false;
  String? _dismissedPromo;

  @override
  void initState() {
    super.initState();
    claimFirstOpenToday().then((v) {
      if (mounted) setState(() { _introPending = false; _playIntro = v; });
    });
    _loadPromo();
    WidgetsBinding.instance.addObserver(this);
  }

  Future<void> _loadPromo() async {
    try {
      final p = await SharedPreferences.getInstance();
      if (mounted) setState(() => _dismissedPromo = p.getString(_promoKey));
    } catch (_) {}
  }

  Future<void> _dismissPromo(String id) async {
    setState(() => _dismissedPromo = id);
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_promoKey, id);
    } catch (_) {}
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    ref.invalidate(telemetryProvider);
    ref.invalidate(recentSalesProvider);
    ref.invalidate(productsProvider);
    ref.invalidate(clientsProvider);
    try {
      await ref.read(recentSalesProvider.future);
    } catch (_) {}
  }

  void _push(Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final ctx = ref.watch(tenantContextProvider).valueOrNull;
    final roles = ctx?.roles ?? const <String>[];
    bool can(String f) => canAccess(f,
        roles: roles, plan: ctx?.plan ?? 'FREE', permissions: ctx?.permissions);

    final now = DateTime.now();
    final day = ymd(now);
    final telemetry = ref.watch(telemetryProvider).valueOrNull;
    final summary =
        ref.watch(salesPeriodSummaryProvider((from: day, to: day))).valueOrNull;
    final recent = ref.watch(recentSalesProvider).valueOrNull ?? const <Sale>[];
    final clients = ref.watch(clientsProvider).valueOrNull;
    final products = ref.watch(productsProvider).valueOrNull;
    final unsynced = ref.watch(unsyncedSaleCountProvider).valueOrNull ?? 0;
    final refused = ref.watch(refusedJobCountProvider).valueOrNull ?? 0;
    final promos = ref.watch(bannersProvider).valueOrNull;

    // Total + bills: the server's, plus bills still queued on this phone.
    var total = (summary?['total'] as num?)?.toDouble() ?? telemetry?.todaySales ?? 0;
    var bills = (summary?['bills'] as num?)?.toInt() ?? telemetry?.todayBillCount ?? 0;
    var split = PaymentSplit.fromSummary(summary);
    if (summary != null) {
      for (final s in recent) {
        if (s.syncState == 'pending') {
          total += s.totalAmount ?? 0;
          bills++;
          split = split?.plus(s.paymentMethod, s.totalAmount ?? 0);
        }
      }
    }

    double toCollect = 0;
    var customers = 0;
    for (final c in clients ?? const []) {
      final b = c.outstandingBalance ?? 0;
      if (b > 0) {
        toCollect += b;
        customers++;
      }
    }
    final stock = StockLevels.counts((products ?? const []).map((p) => p.stock));
    final attention = attentionItems(
      toCollect: toCollect,
      customers: customers,
      low: stock.low,
      out: stock.out,
      notSent: unsynced + refused,
    );

    final promo = (promos == null || promos.isEmpty) ? null : promos.first;
    final promoId = promo == null ? null : '${promo['id'] ?? promo['title']}';
    final showPromo = promo != null &&
        (promo['title'] ?? '').toString().isNotEmpty &&
        promoId != _dismissedPromo;

    final latest = recent.take(5).toList();
    final names = <String, String>{
      for (final c in clients ?? const []) c.id: c.name ?? '',
    };

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        top: false,
        child: MotionRefresh(
          onRefresh: _refresh,
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.sm, Gap.xl, 120),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (ctx != null && ctx.tenant.status == 'TRIAL' && ctx.trialDaysLeft <= 7) ...[
                  TrialBanner(daysLeft: ctx.trialDaysLeft),
                  Gap.h12,
                ],
                const ExpiryAlertCard(),
                StaggerIn(
                  pending: _introPending,
                  play: _playIntro,
                  index: 0,
                  child: _Summary(
                    date: DateFormat('EEE, d MMM').format(now),
                    total: total,
                    bills: bills,
                    split: split,
                    offline: telemetry?.fromCache == true,
                  ),
                ),
                const SizedBox(height: Gap.xl),
                StaggerIn(
                  pending: _introPending,
                  play: _playIntro,
                  index: 1,
                  child: Row(
                    children: [
                      Expanded(
                        child: _QuickAction(
                          label: 'New bill',
                          // Same entry as the Sales FAB: role-gated sheet / POS.
                          onTap: () => navigateToNewSale(context, roles),
                        ),
                      ),
                      if (can('clients')) ...[
                        Gap.w8,
                        Expanded(
                          child: _QuickAction(
                              label: 'Collect', onTap: () => _push(const CRMScreen())),
                        ),
                      ],
                      if (can('purchases')) ...[
                        Gap.w8,
                        Expanded(
                          child: _QuickAction(
                              label: 'Purchase',
                              onTap: () => _push(const PurchasesScreen())),
                        ),
                      ],
                      if (can('expenses')) ...[
                        Gap.w8,
                        Expanded(
                          child: _QuickAction(
                              label: 'Expense',
                              onTap: () => _push(const AddExpenseScreen())),
                        ),
                      ],
                    ],
                  ),
                ),
                if (attention.isNotEmpty) ...[
                  const SizedBox(height: Gap.xl),
                  Text('Needs attention',
                      style: AppText.body.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: Gap.xs),
                  for (var i = 0; i < attention.length; i++)
                    _AttentionRow(
                      item: attention[i],
                      last: i == attention.length - 1,
                      onTap: () {
                        switch (attention[i].kind) {
                          case AttentionKind.collect:
                            _push(const CRMScreen());
                          case AttentionKind.stock:
                            // Low if there are any, else Out.
                            _push(InventoryScreen(
                                initialFilter: stock.low > 0 ? 1 : 2));
                          case AttentionKind.notSent:
                            _push(const SalesScreen(initialFilter: 2));
                        }
                      },
                    ),
                ],
                const SizedBox(height: Gap.xl),
                Row(
                  children: [
                    Expanded(
                      child: Text('Latest bills',
                          style: AppText.body.copyWith(fontWeight: FontWeight.w600)),
                    ),
                    AppTappable(
                      ripple: false,
                      onTap: () => widget.onTabSwitch('sales'),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: Gap.sm),
                        child: Text('All sales',
                            style: AppText.body.copyWith(
                                color: AppColors.primary, fontWeight: FontWeight.w500)),
                      ),
                    ),
                  ],
                ),
                if (latest.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: Gap.lg),
                    child: Text('No bills yet. Tap New bill to ring the first one.',
                        style: AppText.body.copyWith(color: AppColors.inkTertiary)),
                  )
                else
                  for (var i = 0; i < latest.length; i++)
                    _BillRow(
                      sale: latest[i],
                      name: _billName(latest[i], names),
                      last: i == latest.length - 1,
                    ),
                if (showPromo) ...[
                  const SizedBox(height: Gap.xl),
                  _PromoLine(
                    text: promo['title'].toString(),
                    onDismiss: () => _dismissPromo(promoId!),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _billName(Sale s, Map<String, String> names) {
    final shop = s.shopId != null ? names[s.shopId!] : null;
    if (shop != null && shop.isNotEmpty) return shop;
    final n = s.customerName?.isNotEmpty == true
        ? s.customerName!
        : (s.customerInfo?['name'] as String?) ?? '';
    return n.isEmpty ? 'Walk-in' : n;
  }
}

class _Summary extends StatelessWidget {
  final String date;
  final double total;
  final int bills;
  final PaymentSplit? split;
  final bool offline;
  const _Summary({
    required this.date,
    required this.total,
    required this.bills,
    required this.split,
    required this.offline,
  });

  @override
  Widget build(BuildContext context) {
    final s = split;
    final hasSplit = s != null && s.total > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(offline ? '$date · offline, saved figures' : date, style: AppText.caption),
        const SizedBox(height: Gap.xs),
        Text(
          Money.inr(total),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          // Proportional figures: this font pads a tabular '1'.
          style: AppText.moneyLarge.copyWith(fontSize: 34, fontWeight: FontWeight.w600),
        ),
        Text('$bills ${bills == 1 ? 'bill' : 'bills'}', style: AppText.caption),
        if (hasSplit) ...[
          const SizedBox(height: Gap.md),
          _SplitBar(split: s),
          const SizedBox(height: Gap.sm),
          Text(s.legend(), style: AppText.caption),
        ],
      ],
    );
  }
}

class _SplitBar extends StatelessWidget {
  final PaymentSplit split;
  const _SplitBar({required this.split});

  @override
  Widget build(BuildContext context) {
    final parts = <(double, Color)>[
      (split.cash, AppColors.accountCash),
      (split.upi, AppColors.accountUpi),
      (split.bank, AppColors.accountBank),
      (split.credit, AppColors.warning),
    ].where((p) => p.$1 > 0).toList();
    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: SizedBox(
        height: 6,
        child: Row(
          children: [
            for (final p in parts)
              Expanded(
                flex: (p.$1 * 100).round().clamp(1, 1 << 30),
                child: ColoredBox(color: p.$2),
              ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _QuickAction({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AppTappable(
      ripple: false,
      onTap: onTap,
      child: Container(
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: Radii.rSm,
          border: Border.all(color: AppColors.outlineVariant),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppText.body.copyWith(fontWeight: FontWeight.w500),
        ),
      ),
    );
  }
}

class _AttentionRow extends StatelessWidget {
  final AttentionItem item;
  final bool last;
  final VoidCallback onTap;
  const _AttentionRow({required this.item, required this.last, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final (icon, color, action) = switch (item.kind) {
      AttentionKind.collect => (LucideIcons.wallet, AppColors.warning, 'Collect'),
      AttentionKind.stock => (LucideIcons.alertTriangle, AppColors.warning, 'View'),
      AttentionKind.notSent => (LucideIcons.alertCircle, AppColors.danger, 'View'),
    };
    return AppTappable(
      ripple: false,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: Gap.md),
        decoration: BoxDecoration(
          border: last
              ? null
              : const Border(bottom: BorderSide(color: AppColors.outlineVariant)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: color),
            Gap.w12,
            Expanded(
              child: Text(item.text,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body.copyWith(fontWeight: FontWeight.w500)),
            ),
            Gap.w12,
            Text(action,
                style: AppText.body.copyWith(
                    color: AppColors.primary, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}

class _BillRow extends StatelessWidget {
  final Sale sale;
  final String name;
  final bool last;
  const _BillRow({required this.sale, required this.name, required this.last});

  @override
  Widget build(BuildContext context) {
    final st = (sale.paymentStatus ?? '').toUpperCase();
    final voided = st == 'VOIDED' || st == 'FAILED';
    final meta = [
      shortSaleId(sale.id),
      // On a screen titled "Today", a bill from another day says which day.
      _whenLabel(sale.createdAt),
      methodLabel(sale.paymentMethod),
    ].where((e) => e.isNotEmpty).join(' · ');
    return AppTappable(
      ripple: false,
      onTap: () => sale.isUnsynced
          ? UnsyncedSalesSheet.show(context)
          : Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => InvoiceDetailScreen(invoice: Invoice.fromSale(sale))),
            ),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: Gap.md),
        decoration: BoxDecoration(
          border: last
              ? null
              : const Border(bottom: BorderSide(color: AppColors.outlineVariant)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body.copyWith(fontWeight: FontWeight.w500)),
                  const SizedBox(height: 2),
                  Text(sale.isUnsynced ? '$meta · not sent' : meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.caption.copyWith(
                          color: sale.isUnsynced ? AppColors.danger : null)),
                ],
              ),
            ),
            Gap.w12,
            Text(
              Money.inr(sale.totalAmount ?? 0),
              style: AppText.body.copyWith(
                fontWeight: FontWeight.w500,
                color: voided ? AppColors.inkTertiary : AppColors.onSurface,
                decoration: voided ? TextDecoration.lineThrough : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One quiet line, not a carousel. Dismissal is remembered (see _dismissPromo).
class _PromoLine extends StatelessWidget {
  final String text;
  final VoidCallback onDismiss;
  const _PromoLine({required this.text, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return AnimatedSize(
      duration: motionDur(context, 200),
      curve: MotionCurves.out,
      child: Row(
        children: [
          Expanded(
            child: Text(text,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppText.caption),
          ),
          AppTappable(
            ripple: false,
            onTap: onDismiss,
            child: const SizedBox(
              width: 36,
              height: 36,
              child: Icon(LucideIcons.x, size: 16, color: AppColors.inkTertiary),
            ),
          ),
        ],
      ),
    );
  }
}

String _whenLabel(DateTime? at) {
  if (at == null) return '';
  final l = at.toLocal(), n = DateTime.now();
  final sameDay = l.year == n.year && l.month == n.month && l.day == n.day;
  if (sameDay) return timeLabel(at);
  final y = n.subtract(const Duration(days: 1));
  final yest = l.year == y.year && l.month == y.month && l.day == y.day;
  return '${yest ? 'Yesterday' : DateFormat('d MMM').format(l)}, ${timeLabel(at)}';
}
