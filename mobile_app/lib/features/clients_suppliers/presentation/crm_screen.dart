import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/data/party_aging.dart';
import 'package:mobile_app/widgets/motion/motion_refresh.dart';
import 'package:mobile_app/widgets/motion/swipe_actions.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/supplier.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_client_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_supplier_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/supplier_detail_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_aging_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_payments_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_settlement_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_detail_sheet.dart';

// ─── Helpers ─────────────────────────────────────────────────────────────────
class CRMScreen extends ConsumerStatefulWidget {
  const CRMScreen({super.key});

  @override
  ConsumerState<CRMScreen> createState() => _CRMScreenState();
}

const _kSwipeHintSeen = 'crm.swipeHintSeen';

class _CRMScreenState extends ConsumerState<CRMScreen> {
  final _searchController = TextEditingController();
  int _tab = 0; // 0 clients, 1 suppliers
  int _filter = 0; // 0 owing, 1 settled, 2 all
  String _query = '';
  bool _showSwipeHint = false;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(
        () => setState(() => _query = _searchController.text));
    // The first row slides open by itself until the owner has swiped once.
    SharedPreferences.getInstance().then((p) {
      if (mounted && !(p.getBool(_kSwipeHintSeen) ?? false)) {
        setState(() => _showSwipeHint = true);
      }
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _swipeHintDone() {
    if (!_showSwipeHint) return;
    _showSwipeHint = false;
    SharedPreferences.getInstance()
        .then((p) => p.setBool(_kSwipeHintSeen, true))
        .catchError((_) => false);
  }

  void _refreshAll() {
    ref.invalidate(clientsProvider);
    ref.invalidate(suppliersProvider);
    ref.invalidate(supplierOutstandingProvider);
    ref.invalidate(supplierAgingProvider);
    ref.invalidate(clientPaymentsProvider);
  }

  void _openAdd() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            _tab == 0 ? const AddClientScreen() : const AddSupplierScreen(),
      ),
    ).then((_) => _refreshAll());
  }

  void _showClientDetail(Client client) {
    ClientDetailSheet.show(context, client).then((_) {
      if (mounted) _refreshAll();
    });
  }

  Widget _legend(Color c, String t) => Padding(
        padding: const EdgeInsets.only(right: 12),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
            const SizedBox(width: 5),
            Text(t,
                style: Bl.inter(12,
                    w: FontWeight.w500, c: const Color(0xFF5E646C))),
          ],
        ),
      );

  /// Total, how many owe, and the three-band age bar.
  Widget _summary({
    required double total,
    required String caption,
    required double a,
    required double b,
    required double c,
    VoidCallback? onTap,
  }) {
    final sum = a + b + c;
    int flex(double v) => sum <= 0 ? 0 : (v / sum * 1000).round().clamp(20, 1000);
    final body = Padding(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(
                child: Text(Money.inr(total),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        Bl.tight(28, w: FontWeight.w700, ls: -0.035, h: 1.1)),
              ),
              Text(caption,
                  style: Bl.inter(12.5,
                      w: FontWeight.w500, c: const Color(0xFF7A8088))),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 6,
            child: sum <= 0
                ? const DecoratedBox(
                    decoration: BoxDecoration(
                        color: Bl.well,
                        borderRadius: BorderRadius.all(Radius.circular(3))))
                : Row(
                    children: [
                      for (final (v, col) in [
                        (a, const Color(0xFF1E9E5A)),
                        (b, Bl.brand),
                        (c, Bl.red),
                      ])
                        if (v > 0)
                          Expanded(
                            flex: flex(v),
                            child: Container(
                              margin: const EdgeInsets.only(right: 3),
                              decoration: BoxDecoration(
                                  color: col,
                                  borderRadius: BorderRadius.circular(3)),
                            ),
                          ),
                    ],
                  ),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _legend(const Color(0xFF1E9E5A), '0–30 days ${Money.inr(a)}'),
                _legend(Bl.brand, '31–60 ${Money.inr(b)}'),
                _legend(Bl.red, '60+ ${Money.inr(c)}'),
              ],
            ),
          ),
        ],
      ),
    );
    return onTap == null
        ? body
        : Semantics(
            button: true,
            label: 'Open the overdue report',
            child: GestureDetector(
                behavior: HitTestBehavior.opaque, onTap: onTap, child: body));
  }

  Widget _filterPill(int i, String label, int count) {
    final on = _filter == i;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Semantics(
        button: true,
        selected: on,
        label: '$label, $count',
        excludeSemantics: true,
        child: BlTap(
          onTap: () => setState(() => _filter = i),
          child: Container(
            height: 32,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: on ? Bl.ink : null,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: on ? Bl.ink : const Color(0xFFDADADA)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    style: Bl.tight(13,
                        w: FontWeight.w600,
                        ls: 0,
                        c: on ? Bl.white : const Color(0xFF303030))),
                const SizedBox(width: 5),
                Text('$count',
                    style: Bl.tight(12,
                        w: FontWeight.w500,
                        ls: 0,
                        c: (on ? Bl.white : const Color(0xFF303030))
                            .withValues(alpha: 0.6))),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final clientsAsync = ref.watch(clientsProvider);
    final suppliersAsync = ref.watch(suppliersProvider);
    final clients = clientsAsync.valueOrNull ?? const <Client>[];
    final suppliers = suppliersAsync.valueOrNull ?? const <Supplier>[];
    final isClient = _tab == 0;
    final now = DateTime.now();
    final q = _query.trim().toLowerCase();

    // ── Clients ──────────────────────────────────────────────────────────
    final cAging = clientAging(
        ref.watch(recentSalesProvider).valueOrNull ?? const [], now);
    double cOwed(Client c) => c.outstandingBalance ?? 0;
    final cOwing = clients.where((c) => cOwed(c) > 0.5).toList();

    // ── Suppliers ────────────────────────────────────────────────────────
    final derivedOut = ref.watch(supplierOutstandingProvider).valueOrNull;
    final sAging = ref.watch(supplierAgingProvider).valueOrNull ?? const {};
    double sOwed(Supplier s) => supplierOutstanding(s, derivedOut);
    final sOwing = suppliers.where((s) => sOwed(s) > 0.5).toList();

    final total = isClient
        ? cOwing.fold<double>(0, (t, c) => t + cOwed(c))
        : sOwing.fold<double>(0, (t, s) => t + sOwed(s));
    // Bands are scaled to each balance, so they add up to the total above.
    final ages = isClient
        ? [
            for (final c in cOwing)
              cAging[c.id] == null
                  ? null
                  : agingScaledTo(cAging[c.id]!, cOwed(c)),
          ]
        : [
            for (final s in sOwing)
              sAging[s.id] == null
                  ? null
                  : agingScaledTo(sAging[s.id]!, sOwed(s)),
          ];
    double band(double Function(PartyAging) f) =>
        ages.fold<double>(0, (t, a) => t + (a == null ? 0 : f(a)));

    final owingCount = isClient ? cOwing.length : sOwing.length;
    final allCount = isClient ? clients.length : suppliers.length;

    final loading = isClient
        ? clientsAsync.isLoading && !clientsAsync.hasValue
        : suppliersAsync.isLoading && !suppliersAsync.hasValue;
    final failed = isClient
        ? clientsAsync.hasError && !clientsAsync.hasValue
        : suppliersAsync.hasError && !suppliersAsync.hasValue;

    final List<Widget> rows;
    if (isClient) {
      final list = clients.where((c) {
        final owes = cOwed(c) > 0.5;
        if (_filter == 0 && !owes) return false;
        if (_filter == 1 && owes) return false;
        if (q.isEmpty) return true;
        return (c.name ?? '').toLowerCase().contains(q) ||
            (c.phone ?? '').contains(q) ||
            (c.email ?? '').toLowerCase().contains(q);
      }).toList()
        ..sort((x, y) {
          final d = cOwed(y).compareTo(cOwed(x));
          return d != 0
              ? d
              : (x.name ?? '').toLowerCase().compareTo((y.name ?? '').toLowerCase());
        });
      rows = [
        for (var i = 0; i < list.length; i++)
          () {
            final c = list[i];
            final phone = (c.phone ?? '').trim();
            return SwipeActions(
              key: ValueKey('client-${c.id}'),
              openWidth: phone.isEmpty ? 66 : 132,
              peek: _showSwipeHint && i == 0,
              onSwiped: _swipeHintDone,
              actions: [
                if (phone.isNotEmpty)
                  _SwipeAction(
                    icon:
                        '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
                    label: 'Call',
                    color: Bl.ink,
                    onTap: () => launchUrl(Uri(scheme: 'tel', path: phone)),
                  ),
                _SwipeAction(
                  icon: '<path d="M7 5h10M7 9h10M7 5c5 0 6 4 0 4h0l7 10"/>',
                  label: 'Collect',
                  color: Bl.amber,
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => ClientSettlementScreen(client: c)),
                  ).then((_) => _refreshAll()),
                ),
              ],
              child: _PartyRow(
                name: c.name ?? 'Unnamed',
                owed: cOwed(c),
                aging: cAging[c.id],
                detail: null,
                onTap: () => _showClientDetail(c),
              ),
            );
          }(),
      ];
    } else {
      final list = suppliers.where((s) {
        final owes = sOwed(s) > 0.5;
        if (_filter == 0 && !owes) return false;
        if (_filter == 1 && owes) return false;
        if (q.isEmpty) return true;
        return (s.name ?? '').toLowerCase().contains(q) ||
            (s.phone ?? '').contains(q) ||
            (s.contactPerson ?? '').toLowerCase().contains(q);
      }).toList()
        ..sort((x, y) {
          final d = sOwed(y).compareTo(sOwed(x));
          return d != 0
              ? d
              : (x.name ?? '').toLowerCase().compareTo((y.name ?? '').toLowerCase());
        });
      rows = [
        for (final s in list)
          _PartyRow(
            key: ValueKey('supplier-${s.id}'),
            name: s.name ?? 'Unnamed',
            owed: sOwed(s),
            aging: sAging[s.id],
            detail: (s.contactPerson ?? '').trim().isNotEmpty
                ? s.contactPerson!.trim()
                : ((s.phone ?? '').trim().isNotEmpty ? s.phone!.trim() : null),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => SupplierDetailScreen(supplier: s)),
            ).then((_) => _refreshAll()),
          ),
      ];
    }

    final noun = isClient ? 'client' : 'supplier';

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              title: isClient ? 'Clients' : 'Suppliers',
              trailing: isClient
                  ? BlRoundButton(
                      '<path d="M4 6h16M4 12h16M4 18h10"/>',
                      label: 'Payment history',
                      onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => const ClientPaymentsScreen())),
                    )
                  : null,
            ),
            Expanded(
              child: MotionRefresh(
                onRefresh: () async {
                  _refreshAll();
                  try {
                    await ref.read(clientsProvider.future);
                  } catch (_) {}
                },
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: 16),
                  children: [
                    _summary(
                      total: total,
                      caption:
                          '${isClient ? 'to collect' : 'to pay'} · $owingCount $noun${owingCount == 1 ? '' : 's'}',
                      a: band((x) => x.d0to30),
                      b: band((x) => x.d31to60),
                      c: band((x) => x.d60plus),
                      onTap: isClient
                          ? () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (_) => const ClientAgingScreen()))
                          : null,
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: BlSegmented(
                        labels: const ['Clients', 'Suppliers'],
                        index: _tab,
                        onChanged: (i) => setState(() {
                          _tab = i;
                          _filter = 0;
                          _searchController.clear();
                        }),
                      ),
                    ),
                    Container(
                      height: 44,
                      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                          color: Bl.well,
                          borderRadius: BorderRadius.circular(999)),
                      child: Row(
                        children: [
                          const BlIcon(BlIcons.search,
                              size: 20, color: Bl.mute),
                          const SizedBox(width: 10),
                          Expanded(
                            child: TextField(
                              controller: _searchController,
                              cursorColor: Bl.brand,
                              style: Bl.inter(14,
                                  w: FontWeight.w500, c: Bl.ink),
                              decoration: InputDecoration(
                                isCollapsed: true,
                                filled: false,
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                hintText:
                                    isClient ? 'Search clients' : 'Search suppliers',
                                hintStyle: Bl.inter(14,
                                    w: FontWeight.w500, c: Bl.mute),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _filterPill(
                                0, isClient ? 'Owes you' : 'You owe', owingCount),
                            _filterPill(1, 'Settled', allCount - owingCount),
                            _filterPill(2, 'All', allCount),
                          ],
                        ),
                      ),
                    ),
                    if (loading)
                      const Padding(
                        padding: EdgeInsets.only(top: 60),
                        child: Center(
                            child: CircularProgressIndicator(
                                color: Bl.amber, strokeWidth: 2)),
                      )
                    else if (failed)
                      Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                            'Could not load ${noun}s. Check your internet and try again.',
                            textAlign: TextAlign.center,
                            style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                      )
                    else if (rows.isEmpty)
                      BlEmpty(
                        icon: BlIcons.users,
                        title: q.isNotEmpty
                            ? 'No results for "$_query"'
                            : _filter == 0
                                ? (isClient
                                    ? 'Nobody owes you'
                                    : 'You owe nobody')
                                : 'No ${noun}s here',
                        message: q.isEmpty && _filter == 0
                            ? 'Tap All to see every $noun.'
                            : null,
                      )
                    else
                      ...rows,
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
              child: BlButton(
                isClient ? 'Add client' : 'Add supplier',
                leading: const BlIcon(BlIcons.plus, size: 16, color: Bl.white),
                onTap: _openAdd,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One of the buttons a swiped row uncovers.
class _SwipeAction extends StatelessWidget {
  final String icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _SwipeAction(
      {required this.icon,
      required this.label,
      required this.color,
      required this.onTap});

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: ColoredBox(
            color: color,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                BlIcon(icon, size: 18, color: Bl.white),
                const SizedBox(height: 4),
                Text(label,
                    style: Bl.tight(11.5,
                        w: FontWeight.w600, ls: 0, c: Bl.white)),
              ],
            ),
          ),
        ),
      );
}

/// A client or supplier row: avatar, name, how old the debt is, how much.
class _PartyRow extends StatelessWidget {
  final String name;
  final double owed;
  final PartyAging? aging;
  final String? detail;
  final VoidCallback onTap;
  const _PartyRow({
    super.key,
    required this.name,
    required this.owed,
    required this.aging,
    required this.detail,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final owes = owed > 0.5;
    final days = aging?.oldestDays;
    final bills = aging?.unpaidBills ?? 0;
    final sub = [
      ?detail,
      if (owes && bills > 0) '$bills unpaid bill${bills == 1 ? '' : 's'}',
      if (!owes) owed < -0.5 ? 'In advance' : 'Settled',
    ].join(' · ');

    return BlTap(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: const BoxDecoration(
            color: Bl.white,
            border: Border(bottom: BorderSide(color: Bl.sep))),
        child: Row(
          children: [
            BlTintAvatar(name),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(14.5, w: FontWeight.w600)),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      if (owes && days != null) ...[
                        days > 60
                            ? BlStatusPill.red('$days days')
                            : days > 30
                                ? BlStatusPill.yellow('$days days')
                                : BlStatusPill.green('$days days'),
                        const SizedBox(width: 6),
                      ],
                      Flexible(
                        child: Text(sub,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.inter(12,
                                c: const Color(0xFF7A8088))),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Text(owes ? Money.inr(owed) : (owed < -0.5 ? Money.inr(-owed) : ''),
                style: Bl.tight(14.5,
                    w: FontWeight.w600,
                    c: owes ? Bl.redDeep : const Color(0xFF17663A))),
            const SizedBox(width: 6),
            const BlIcon(BlIcons.chevronRight,
                size: 16, color: Color(0xFFB8BCC2)),
          ],
        ),
      ),
    );
  }
}
