import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/offline_sales_ui.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/dimens.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/widgets/app_button.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/returns/presentation/providers/returns_provider.dart';
import 'package:mobile_app/features/returns/presentation/sales_returns_tab.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/sales/presentation/sales_view.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';

const _tabular = [FontFeature.tabularFigures()];

class SalesScreen extends ConsumerStatefulWidget {
  const SalesScreen({super.key});

  @override
  ConsumerState<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends ConsumerState<SalesScreen> {
  int _filterIndex = 0; // 0=All, 1=Credit, 2=Failed
  SalesPeriod _period = SalesPeriod.today;
  int _historyIndex = 0; // 0=Sales, 1=Returns
  int _limit = salesPageSize;
  final _scroll = ScrollController();

  static const _filters = ['All', 'Credit', 'Failed'];

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.hasClients &&
          _scroll.position.extentAfter < 400 &&
          _canLoadMore) {
        _loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  bool _canLoadMore = false;

  void _loadMore() {
    _canLoadMore = false;
    setState(() => _limit += salesPageSize);
  }

  ({String? from, String? to}) get _range {
    final r = periodRange(_period, DateTime.now());
    return (
      from: r.from == null ? null : ymd(r.from!),
      to: r.to == null ? null : ymd(r.to!),
    );
  }

  static bool _isFailed(Sale s) {
    final st = (s.paymentStatus ?? '').toUpperCase();
    return st == 'VOIDED' || st == 'FAILED' || s.syncState == 'refused';
  }

  static bool _isCredit(Sale s) {
    final st = (s.paymentStatus ?? '').toUpperCase();
    return st == 'PENDING' || st == 'UNPAID' || st == 'PARTIAL';
  }

  static double _due(Sale s) {
    final d = (s.totalAmount ?? 0) - (s.paidAmount ?? 0);
    return d > 0 ? d : 0;
  }

  /// Owes money and is a real bill: the rule the Collect strip always used.
  static bool _owes(Sale s) {
    final st = (s.paymentStatus ?? '').toUpperCase();
    return st != 'PAID' && st != 'VOIDED' && st != 'FAILED' && _due(s) > 0;
  }

  @override
  Widget build(BuildContext context) {
    final tenantId = ref.watch(tenantContextProvider).valueOrNull?.tenantId;
    final returnsCount = tenantId == null
        ? null
        : ref.watch(salesReturnsProvider(tenantId)).valueOrNull?.length;

    final tabs = SalesHistoryTabs(
      index: _historyIndex,
      returnsCount: returnsCount,
      onChanged: (i) => setState(() => _historyIndex = i),
    );

    if (_historyIndex == 1) {
      return Scaffold(
        backgroundColor: AppColors.canvas,
        body: SafeArea(
          child: Column(
            children: [
              const SizedBox(height: Gap.sm),
              tabs,
              const SizedBox(height: Gap.lg),
              Expanded(child: SalesReturnsTab(tenantId: tenantId)),
            ],
          ),
        ),
      );
    }

    final range = _range;
    final query = (from: range.from, to: range.to, limit: _limit);
    final salesAsync = ref.watch(salesHistoryProvider(query));
    // Keep showing the previous page while the next one loads.
    final sales = salesAsync.valueOrNull;
    final serverSummary = ref.watch(salesPeriodSummaryProvider(range)).valueOrNull;

    // Totals: the server's, over every sale in the period, plus bills still
    // queued on this phone (the server does not have those yet).
    double total = 0, due = 0;
    int bills = 0, creditBills = 0;
    if (serverSummary != null) {
      total = (serverSummary['total'] as num?)?.toDouble() ?? 0;
      bills = (serverSummary['bills'] as num?)?.toInt() ?? 0;
      due = (serverSummary['due'] as num?)?.toDouble() ?? 0;
      creditBills = (serverSummary['credit_bills'] as num?)?.toInt() ?? 0;
      for (final s in sales ?? const <Sale>[]) {
        if (s.syncState == 'pending') {
          total += s.totalAmount ?? 0;
          bills++;
          if (_owes(s)) {
            due += _due(s);
            creditBills++;
          }
        }
      }
    } else {
      for (final s in sales ?? const <Sale>[]) {
        if (s.syncState == 'refused') continue;
        total += s.totalAmount ?? 0;
        bills++;
        if (_owes(s)) {
          due += _due(s);
          creditBills++;
        }
      }
    }

    final all = sales ?? const <Sale>[];
    final shown = all.where((s) {
      if (_filterIndex == 1) return _isCredit(s) && !s.isUnsynced;
      if (_filterIndex == 2) return _isFailed(s);
      return true;
    }).toList();
    _canLoadMore = all.length >= _limit && !salesAsync.isLoading;
    if (_filterIndex != 0 && _canLoadMore && shown.length < 12) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _canLoadMore) _loadMore();
      });
    }

    final groups = groupByDay(shown, DateTime.now());
    final clientById = <String, String>{};
    final clients = ref.watch(clientsProvider).valueOrNull;
    if (clients != null) {
      for (final c in clients) {
        clientById[c.id] = c.name ?? '';
      }
    }

    // Flatten day headers + rows into one sliver list.
    final items = <Object>[];
    for (final g in groups) {
      items.add(g);
      items.addAll(g.sales);
    }

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: CustomScrollView(
          controller: _scroll,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            const SliverToBoxAdapter(
              child: OfflineSalesBanner(
                padding: EdgeInsets.fromLTRB(Gap.xl, Gap.sm, Gap.xl, 4),
              ),
            ),
            SliverPersistentHeader(
              pinned: true,
              delegate: _PinnedHeader(
                height: 206,
                child: _SummaryHeader(
                  total: total,
                  bills: bills,
                  due: due,
                  creditBills: creditBills,
                  period: _period,
                  onPeriod: (p) => setState(() {
                    _period = p;
                    _limit = salesPageSize;
                  }),
                  tabs: tabs,
                  filterIndex: _filterIndex,
                  filters: _filters,
                  onFilter: (i) => setState(() => _filterIndex = i),
                ),
              ),
            ),
            if (sales == null && salesAsync.isLoading)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else if (sales == null && salesAsync.hasError)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(Gap.xl),
                    child: Text(
                      'Could not load sales. Check your internet and try again.',
                      textAlign: TextAlign.center,
                      style: AppText.body.copyWith(color: AppColors.error),
                    ),
                  ),
                ),
              )
            else if (items.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Text(
                    'No sales in this period.',
                    style: AppText.body.copyWith(color: AppColors.inkTertiary),
                  ),
                ),
              )
            else
              SliverList.builder(
                itemCount: items.length,
                itemBuilder: (context, i) {
                  final it = items[i];
                  if (it is DayGroup) return _DayHeader(group: it);
                  final sale = it as Sale;
                  final last = i + 1 >= items.length || items[i + 1] is DayGroup;
                  return _SaleRow(
                    sale: sale,
                    showDivider: !last,
                    name: _name(sale, clientById),
                    owes: _owes(sale) && !sale.isUnsynced,
                    due: _due(sale),
                  );
                },
              ),
            // Clear of the shell's FAB and bottom bar so amounts stay visible.
            const SliverToBoxAdapter(child: SizedBox(height: 160)),
          ],
        ),
      ),
    );
  }

  static String _name(Sale s, Map<String, String> clientById) {
    final fromShop = s.shopId != null ? clientById[s.shopId!] : null;
    if (fromShop != null && fromShop.isNotEmpty) return fromShop;
    final n = s.customerName?.isNotEmpty == true
        ? s.customerName!
        : (s.customerInfo?['name'] as String?) ?? '';
    return n.isEmpty ? 'Walk-in' : n;
  }
}

class _PinnedHeader extends SliverPersistentHeaderDelegate {
  final double height;
  final Widget child;
  _PinnedHeader({required this.height, required this.child});

  @override
  double get minExtent => height;
  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) =>
      Container(
        color: AppColors.canvas,
        foregroundDecoration: overlapsContent
            ? const BoxDecoration(
                border: Border(bottom: BorderSide(color: AppColors.outlineVariant)),
              )
            : null,
        child: child,
      );

  @override
  bool shouldRebuild(covariant _PinnedHeader old) => true;
}

class _SummaryHeader extends StatelessWidget {
  final double total, due;
  final int bills, creditBills;
  final SalesPeriod period;
  final ValueChanged<SalesPeriod> onPeriod;
  final Widget tabs;
  final int filterIndex;
  final List<String> filters;
  final ValueChanged<int> onFilter;

  const _SummaryHeader({
    required this.total,
    required this.due,
    required this.bills,
    required this.creditBills,
    required this.period,
    required this.onPeriod,
    required this.tabs,
    required this.filterIndex,
    required this.filters,
    required this.onFilter,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.sm, Gap.xl, 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text(
                  Money.inr(total),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.moneyLarge.copyWith(
                    fontSize: 32,
                    fontWeight: FontWeight.w600,
                    fontFeatures: _tabular,
                  ),
                ),
              ),
              PopupMenuButton<SalesPeriod>(
                tooltip: 'Change period',
                position: PopupMenuPosition.under,
                color: AppColors.canvas,
                elevation: 2,
                onSelected: onPeriod,
                itemBuilder: (_) => [
                  for (final p in SalesPeriod.values)
                    PopupMenuItem(
                      value: p,
                      height: 44,
                      child: Text(
                        p.label,
                        style: AppText.body.copyWith(
                          fontWeight: p == period ? FontWeight.w600 : FontWeight.w400,
                        ),
                      ),
                    ),
                ],
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: Gap.sm),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        period.label,
                        style: AppText.body.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const Icon(Icons.arrow_drop_down,
                          size: 20, color: AppColors.primary),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Gap.xl),
          child: Text(
            '$bills ${bills == 1 ? 'bill' : 'bills'} · ${period.label.toLowerCase()}',
            style: AppText.caption,
          ),
        ),
        if (due > 0)
          Padding(
            padding: const EdgeInsets.fromLTRB(Gap.xl, 2, Gap.xl, 0),
            child: Text(
              '${Money.inr(due)} due · $creditBills on credit',
              style: AppText.caption.copyWith(
                color: AppColors.warning,
                fontWeight: FontWeight.w500,
                fontFeatures: _tabular,
              ),
            ),
          ),
        const SizedBox(height: Gap.md),
        tabs,
        const SizedBox(height: Gap.xs),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Gap.xl),
          child: Row(
            children: [
              for (var i = 0; i < filters.length; i++) ...[
                if (i > 0)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Gap.xs),
                    child: Text('·', style: AppText.caption),
                  ),
                AppTappable(
                  ripple: false,
                  onTap: () => onFilter(i),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: Gap.sm, vertical: Gap.md),
                    child: AnimatedDefaultTextStyle(
                      duration: motionDur(context, 160),
                      curve: MotionCurves.out,
                      style: AppText.body.copyWith(
                        fontWeight: filterIndex == i ? FontWeight.w600 : FontWeight.w400,
                        color: filterIndex == i
                            ? AppColors.onSurface
                            : AppColors.inkTertiary,
                      ),
                      child: Text(filters[i]),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _DayHeader extends StatelessWidget {
  final DayGroup group;
  const _DayHeader({required this.group});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Gap.xl, Gap.lg, Gap.xl, Gap.xs),
      child: Row(
        children: [
          Expanded(
            child: Text(
              group.label,
              style: AppText.caption.copyWith(
                color: AppColors.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Text(
            Money.inr(group.total),
            style: AppText.caption.copyWith(
              color: AppColors.onSurfaceVariant,
              fontFeatures: _tabular,
            ),
          ),
        ],
      ),
    );
  }
}

class _SaleRow extends StatelessWidget {
  final Sale sale;
  final String name;
  final bool owes;
  final double due;
  final bool showDivider;
  const _SaleRow({
    required this.sale,
    required this.name,
    required this.owes,
    required this.due,
    required this.showDivider,
  });

  void _open(BuildContext context) => sale.isUnsynced
      ? UnsyncedSalesSheet.show(context)
      : Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => InvoiceDetailScreen(invoice: Invoice.fromSale(sale)),
          ),
        );

  @override
  Widget build(BuildContext context) {
    final st = (sale.paymentStatus ?? '').toUpperCase();
    final voided = st == 'VOIDED' || st == 'FAILED';
    final meta = [
      shortSaleId(sale.id),
      timeLabel(sale.createdAt),
      methodLabel(sale.paymentMethod),
    ].where((e) => e.isNotEmpty).join(' · ');

    return AppTappable(
      ripple: false,
      onTap: () => _open(context),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.canvas,
          border: showDivider
              ? const Border(
                  bottom: BorderSide(color: AppColors.outlineVariant),
                )
              : null,
        ),
        margin: const EdgeInsets.symmetric(horizontal: Gap.xl),
        padding: const EdgeInsets.symmetric(vertical: Gap.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.body.copyWith(fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 2),
                      Text(meta, style: AppText.caption, maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                const SizedBox(width: Gap.md),
                Text(
                  Money.inr(sale.totalAmount ?? 0),
                  style: AppText.body.copyWith(
                    fontWeight: FontWeight.w500,
                    fontFeatures: _tabular,
                    color: voided ? AppColors.inkTertiary : AppColors.onSurface,
                    decoration: voided ? TextDecoration.lineThrough : null,
                  ),
                ),
              ],
            ),
            if (sale.isUnsynced) ...[
              const SizedBox(height: 4),
              Text(
                'Not sent · tap to retry',
                style: AppText.caption.copyWith(
                  color: AppColors.danger,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ] else if (voided) ...[
              const SizedBox(height: 4),
              Text(
                st == 'VOIDED' ? 'Voided' : 'Failed',
                style: AppText.caption.copyWith(color: AppColors.danger),
              ),
            ] else if (owes) ...[
              Row(
                children: [
                  Text(
                    'Due ${Money.inr(due)}',
                    style: AppText.caption.copyWith(
                      color: AppColors.warning,
                      fontWeight: FontWeight.w500,
                      fontFeatures: _tabular,
                    ),
                  ),
                  Text(' · ', style: AppText.caption),
                  AppTappable(
                    ripple: false,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            InvoiceDetailScreen(invoice: Invoice.fromSale(sale)),
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Text(
                        'Collect',
                        style: AppText.caption.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
