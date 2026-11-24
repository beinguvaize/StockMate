import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/offline_sales_ui.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoice_detail_screen.dart';
import 'package:mobile_app/features/returns/presentation/providers/returns_provider.dart';
import 'package:mobile_app/features/returns/presentation/sales_returns_tab.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/sales/presentation/sales_view.dart';

// This font pads a tabular '1' visibly ("₹8,1 10"), so figures stay proportional.

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

    final returnsOpen = _historyIndex == 1;
    final tabs = SalesHistoryTabs(
      index: _historyIndex,
      returnsCount: returnsCount,
      onChanged: (i) => setState(() => _historyIndex = i),
    );

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

    return ColoredBox(
      color: Bl.white,
      child: CustomScrollView(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          const SliverToBoxAdapter(
            child: OfflineSalesBanner(
              padding: EdgeInsets.fromLTRB(16, 4, 16, 4),
            ),
          ),
          SliverPersistentHeader(
            pinned: true,
            delegate: _PinnedHeader(
              height: returnsOpen ? 152 : 194,
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
                filters: returnsOpen ? const [] : _filters,
                onFilter: (i) => setState(() => _filterIndex = i),
              ),
            ),
          ),
          if (returnsOpen)
            SliverToBoxAdapter(
              child: SalesReturnsTab(tenantId: tenantId, embedded: true),
            )
          else if (sales == null && salesAsync.isLoading)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child:
                    CircularProgressIndicator(color: Bl.amber, strokeWidth: 2),
              ),
            )
          else if (sales == null && salesAsync.hasError)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'Could not load sales. Check your internet and try again.',
                    textAlign: TextAlign.center,
                    style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5),
                  ),
                ),
              ),
            )
          else if (items.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: BlEmpty(
                    icon: BlIcons.receipt, title: 'No sales in this period.'),
              ),
            )
          else
            SliverList.builder(
              itemCount: items.length,
              itemBuilder: (context, i) {
                final it = items[i];
                if (it is DayGroup) {
                  return BlGroupHeader(it.label,
                      trailing: Money.inr(it.total));
                }
                final sale = it as Sale;
                return _SaleRow(
                  sale: sale,
                  name: _name(sale, clientById),
                  owes: _owes(sale) && !sale.isUnsynced,
                  due: _due(sale),
                );
              },
            ),
          SliverToBoxAdapter(
              child: SizedBox(
                  height: 96 + MediaQuery.of(context).viewPadding.bottom)),
        ],
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
      ColoredBox(color: Bl.white, child: child);

  @override
  bool shouldRebuild(covariant _PinnedHeader old) => true;
}

String _periodPhrase(SalesPeriod p) => switch (p) {
      SalesPeriod.today => 'Sales today',
      SalesPeriod.yesterday => 'Sales yesterday',
      SalesPeriod.week => 'Sales this week',
      SalesPeriod.month => 'Sales this month',
      SalesPeriod.all => 'All sales',
    };

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
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_periodPhrase(period)} · $bills ${bills == 1 ? 'bill' : 'bills'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.inter(13, w: FontWeight.w500),
                    ),
                    const SizedBox(height: 6),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        Money.inr(total),
                        maxLines: 1,
                        style: Bl.tight(36,
                            w: FontWeight.w700, ls: -0.04, h: 1.05),
                      ),
                    ),
                    const SizedBox(height: 6),
                    // Line kept even when nothing is due, so the header does
                    // not change height between periods.
                    Text(
                      due > 0
                          ? '${Money.inr(due)} due · $creditBills on credit'
                          : 'Nothing due',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.inter(12.5,
                          w: FontWeight.w600,
                          c: due > 0 ? Bl.amberDeep : Bl.mute),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              PopupMenuButton<SalesPeriod>(
                tooltip: 'Change period',
                position: PopupMenuPosition.under,
                color: Bl.white,
                elevation: 3,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16)),
                onSelected: onPeriod,
                itemBuilder: (_) => [
                  for (final p in SalesPeriod.values)
                    PopupMenuItem(
                      value: p,
                      height: 44,
                      child: Text(
                        p.label,
                        style: Bl.tight(14,
                            w: p == period ? FontWeight.w700 : FontWeight.w500),
                      ),
                    ),
                ],
                child: Container(
                  height: 34,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                      color: Bl.well,
                      borderRadius: BorderRadius.circular(999)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(period.label,
                          style: Bl.tight(13,
                              w: FontWeight.w600,
                              ls: 0,
                              c: const Color(0xFF303030))),
                      const SizedBox(width: 5),
                      const BlIcon(BlIcons.chevronDown,
                          size: 16, color: Color(0xFF303030)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        tabs,
        if (filters.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 5, 16, 0),
            child: Row(
              children: [
                for (var i = 0; i < filters.length; i++) ...[
                  if (i > 0) const SizedBox(width: 6),
                  BlOutlinePill(filters[i],
                      selected: filterIndex == i, onTap: () => onFilter(i)),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _SaleRow extends StatelessWidget {
  final Sale sale;
  final String name;
  final bool owes;
  final double due;
  const _SaleRow({
    required this.sale,
    required this.name,
    required this.owes,
    required this.due,
  });

  void _openInvoice(BuildContext context) => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => InvoiceDetailScreen(invoice: Invoice.fromSale(sale)),
        ),
      );

  void _open(BuildContext context) =>
      sale.isUnsynced ? UnsyncedSalesSheet.show(context) : _openInvoice(context);

  @override
  Widget build(BuildContext context) {
    final st = (sale.paymentStatus ?? '').toUpperCase();
    final voided = st == 'VOIDED' || st == 'FAILED';
    final meta = [
      shortSaleId(sale.id),
      timeLabel(sale.createdAt),
      methodLabel(sale.paymentMethod),
    ].where((e) => e.isNotEmpty).join(' · ');

    return BlTap(
      onTap: () => _open(context),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BlPartyAvatar(name),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.tight(14.5, w: FontWeight.w600)),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        Money.inr(sale.totalAmount ?? 0),
                        style: Bl.tight(14.5,
                                w: FontWeight.w600,
                                c: voided ? const Color(0xFF9AA0A6) : Bl.ink)
                            .copyWith(
                                decoration:
                                    voided ? TextDecoration.lineThrough : null,
                                decorationColor: const Color(0xFF9AA0A6)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 1),
                  Text(meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.inter(12, c: const Color(0xFF7A8088))),
                  if (sale.isUnsynced)
                    Padding(
                      padding: const EdgeInsets.only(top: 5),
                      child: Text('Not sent · tap to retry',
                          style: Bl.inter(12, w: FontWeight.w600, c: Bl.red)),
                    )
                  else if (voided)
                    Padding(
                      padding: const EdgeInsets.only(top: 5),
                      child: Text(st == 'VOIDED' ? 'Voided' : 'Failed',
                          style: Bl.inter(12, w: FontWeight.w600, c: Bl.red)),
                    )
                  else if (owes)
                    Padding(
                      padding: const EdgeInsets.only(top: 1),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text('Due ${Money.inr(due)}',
                                style: Bl.inter(12,
                                    w: FontWeight.w600, c: Bl.amberDeep)),
                          ),
                          BlTap(
                            label: 'Collect from $name',
                            onTap: () => _openInvoice(context),
                            child: Padding(
                              padding: const EdgeInsets.only(top: 6, left: 12),
                              child: Container(
                                height: 28,
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 13),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                    color: Bl.amber,
                                    borderRadius: BorderRadius.circular(999)),
                                child: Text('Collect',
                                    style: Bl.tight(12.5,
                                        w: FontWeight.w600,
                                        ls: 0,
                                        c: Bl.white)),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
