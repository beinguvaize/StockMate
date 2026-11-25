import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client_payment.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';

const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const _upiIcon =
    '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z"/>';
const _chequeIcon = '<path d="M3 7h18v10H3z"/><path d="M6 13h6M14 13l2 1.5 3-3"/>';

(String, String) _method(String m) => switch (m.toUpperCase()) {
      'UPI' => ('UPI', _upiIcon),
      'BANK' => ('Bank transfer', BlIcons.bank),
      'CHEQUE' => ('Cheque', _chequeIcon),
      'CARD' => ('Card', _chequeIcon),
      _ => ('Cash', BlIcons.cash),
    };

/// Which heading a payment falls under, by its date.
String _bucket(String date, DateTime now) {
  final d = DateTime.tryParse(date);
  if (d == null) return 'Earlier';
  final today = DateTime(now.year, now.month, now.day);
  final weekStart =
      DateTime(today.year, today.month, today.day - (today.weekday - 1));
  final day = DateTime(d.year, d.month, d.day);
  if (!day.isBefore(weekStart)) return 'This week';
  if (day.year == today.year && day.month == today.month) return 'This month';
  return 'Earlier';
}

/// "Payment History" (canvas): everything collected from clients, newest
/// first, grouped by week.
class ClientPaymentsScreen extends ConsumerStatefulWidget {
  const ClientPaymentsScreen({super.key});

  @override
  ConsumerState<ClientPaymentsScreen> createState() =>
      _ClientPaymentsScreenState();
}

class _ClientPaymentsScreenState extends ConsumerState<ClientPaymentsScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(
      () => setState(() => _query = _searchController.text),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Widget _stat(String value, String label) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(15, w: FontWeight.w700)),
            const SizedBox(height: 1),
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.inter(11.5,
                    w: FontWeight.w500, c: const Color(0xFF7A8088))),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final paymentsAsync = ref.watch(clientPaymentsProvider);
    final names = <String, String>{
      for (final c in ref.watch(clientsProvider).valueOrNull ?? const [])
        c.id: c.name ?? '',
    };

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Payment History'),
            Expanded(
              child: paymentsAsync.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'Could not load payments. Check your internet and try again.',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                  ),
                ),
                data: (payments) {
                  final now = DateTime.now();
                  final sorted = [...payments]
                    ..sort((a, b) => b.date.compareTo(a.date));
                  final q = _query.toLowerCase().trim();
                  String nameOf(ClientPayment p) =>
                      (names[p.clientId] ?? '').isEmpty
                          ? 'Unknown client'
                          : names[p.clientId]!;
                  final shown = q.isEmpty
                      ? sorted
                      : sorted
                          .where((p) =>
                              nameOf(p).toLowerCase().contains(q) ||
                              (p.notes ?? '').toLowerCase().contains(q))
                          .toList();
                  final total =
                      payments.fold<double>(0, (s, p) => s + p.amount);
                  final clients =
                      payments.map((p) => p.clientId).toSet().length;

                  final rows = <Widget>[];
                  String? bucket;
                  for (final p in shown) {
                    final b = _bucket(p.date, now);
                    if (b != bucket) {
                      bucket = b;
                      final sum = shown
                          .where((x) => _bucket(x.date, now) == b)
                          .fold<double>(0, (t, x) => t + x.amount);
                      rows.add(
                          BlGroupHeader(b, trailing: Money.inr(sum)));
                    }
                    final (label, icon) = _method(p.paymentMethod);
                    final d = DateTime.tryParse(p.date);
                    final when = d == null
                        ? p.date
                        : '${d.day} ${_mon[d.month - 1]}${d.year == now.year ? '' : ' ${d.year}'}';
                    rows.add(Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 11),
                      decoration: const BoxDecoration(
                          border:
                              Border(bottom: BorderSide(color: Bl.sep))),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                                color: Color(0xFFE3F5EA),
                                shape: BoxShape.circle),
                            child: BlIcon(icon,
                                size: 17, color: const Color(0xFF17663A)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(nameOf(p),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.tight(14.5,
                                        w: FontWeight.w600)),
                                const SizedBox(height: 1),
                                Text(
                                    [
                                      when,
                                      label,
                                      if ((p.notes ?? '').trim().isNotEmpty)
                                        p.notes!.trim(),
                                    ].join(' · '),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.inter(12,
                                        c: const Color(0xFF7A8088))),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text('+ ${Money.inr(p.amount)}',
                              style: Bl.tight(14.5,
                                  w: FontWeight.w600,
                                  c: const Color(0xFF17663A))),
                        ],
                      ),
                    ));
                  }

                  return ListView(
                    padding: const EdgeInsets.only(bottom: 20),
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Collected from clients',
                                style: Bl.inter(13, w: FontWeight.w500)),
                            const SizedBox(height: 6),
                            Text(Money.inr(total),
                                style: Bl.tight(36,
                                    w: FontWeight.w700,
                                    ls: -0.04,
                                    h: 1.05,
                                    c: const Color(0xFF17663A))),
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                _stat('${payments.length}', 'Payments'),
                                const SizedBox(width: 10),
                                _stat('$clients', 'Clients paid'),
                                const SizedBox(width: 10),
                                _stat(
                                    payments.isEmpty
                                        ? '—'
                                        : Money.inr(total / payments.length),
                                    'Average payment'),
                              ],
                            ),
                          ],
                        ),
                      ),
                      Container(
                        height: 44,
                        margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
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
                                  hintText: 'Search by client name or notes',
                                  hintStyle: Bl.inter(14,
                                      w: FontWeight.w500, c: Bl.mute),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (rows.isEmpty)
                        BlEmpty(
                          icon: BlIcons.cash,
                          title: q.isEmpty
                              ? 'No payments recorded yet'
                              : 'No results for "$_query"',
                        )
                      else
                        ...rows,
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
