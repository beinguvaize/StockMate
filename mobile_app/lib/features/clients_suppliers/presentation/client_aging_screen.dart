import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/party_aging.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_settlement_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';

const _green = Color(0xFF1E9E5A);
const _orange = Color(0xFFE2603A);

/// "Overdue Report" (canvas): what clients owe, split by how old it is, and
/// who owes it, oldest first.
///
/// Each client's bands are scaled to their balance, so the report adds up to
/// the same total as the Clients screen.
class ClientAgingScreen extends ConsumerWidget {
  const ClientAgingScreen({super.key});

  Widget _band(Color c, String label, double v) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
              color: Bl.tile, borderRadius: BorderRadius.circular(14)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                      width: 8,
                      height: 8,
                      decoration:
                          BoxDecoration(color: c, shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                  Text(label,
                      style: Bl.inter(12,
                          w: FontWeight.w500, c: const Color(0xFF5E646C))),
                ],
              ),
              const SizedBox(height: 3),
              Text(Money.inr(v),
                  style: Bl.tight(17, w: FontWeight.w700, ls: -0.02)),
            ],
          ),
        ),
      );

  /// A row of coloured segments, one per band that has money in it.
  Widget _bar(PartyAging a, {double height = 8, double gap = 3}) {
    final parts = [
      (a.d0to30, _green),
      (a.d31to60, Bl.brand),
      (a.d61to90, _orange),
      (a.d90plus, Bl.red),
    ].where((p) => p.$1 > 0).toList();
    if (parts.isEmpty) {
      return Container(
          height: height,
          decoration: BoxDecoration(
              color: Bl.well, borderRadius: BorderRadius.circular(height / 2)));
    }
    final sum = parts.fold<double>(0, (t, p) => t + p.$1);
    return SizedBox(
      height: height,
      child: Row(
        children: [
          for (var i = 0; i < parts.length; i++)
            Expanded(
              flex: (parts[i].$1 / sum * 1000).round().clamp(20, 1000),
              child: Container(
                margin:
                    EdgeInsets.only(right: i == parts.length - 1 ? 0 : gap),
                decoration: BoxDecoration(
                    color: parts[i].$2,
                    borderRadius: BorderRadius.circular(height / 2)),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clientsAsync = ref.watch(clientsProvider);
    final salesAsync = ref.watch(recentSalesProvider);
    final loading = (clientsAsync.isLoading && !clientsAsync.hasValue) ||
        (salesAsync.isLoading && !salesAsync.hasValue);
    final clients = clientsAsync.valueOrNull ?? const <Client>[];
    final aging =
        clientAging(salesAsync.valueOrNull ?? const [], DateTime.now());

    final rows = <(Client, PartyAging?, double)>[];
    for (final c in clients) {
      final owed = c.outstandingBalance ?? 0;
      if (owed <= 0.5) continue;
      final a = aging[c.id];
      rows.add((c, a == null ? null : agingScaledTo(a, owed), owed));
    }
    rows.sort((x, y) =>
        (y.$2?.oldestDays ?? -1).compareTo(x.$2?.oldestDays ?? -1));

    final total = rows.fold<double>(0, (t, r) => t + r.$3);
    double sum(double Function(PartyAging) f) =>
        rows.fold<double>(0, (t, r) => t + (r.$2 == null ? 0 : f(r.$2!)));
    final all = PartyAging(
      d0to30: sum((a) => a.d0to30),
      d31to60: sum((a) => a.d31to60),
      d60plus: sum((a) => a.d60plus),
      d90plus: sum((a) => a.d90plus),
    );

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Overdue Report'),
            Expanded(
              child: loading
                  ? const Center(
                      child: CircularProgressIndicator(
                          color: Bl.amber, strokeWidth: 2))
                  : rows.isEmpty
                      ? const Center(
                          child: BlEmpty(
                            icon: BlIcons.check,
                            title: 'Nobody owes you',
                            message: 'Every client is settled.',
                          ),
                        )
                      : ListView(
                          padding: const EdgeInsets.only(bottom: 20),
                          children: [
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(18, 8, 18, 0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                      'Overdue from ${rows.length} client${rows.length == 1 ? '' : 's'}',
                                      style: Bl.inter(13,
                                          w: FontWeight.w500)),
                                  const SizedBox(height: 6),
                                  Text(Money.inr(total),
                                      style: Bl.tight(36,
                                          w: FontWeight.w700,
                                          ls: -0.04,
                                          h: 1.05)),
                                  const SizedBox(height: 14),
                                  _bar(all),
                                ],
                              ),
                            ),
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(18, 12, 18, 0),
                              child: Column(
                                children: [
                                  Row(children: [
                                    _band(_green, '0–30 days', all.d0to30),
                                    const SizedBox(width: 8),
                                    _band(Bl.brand, '31–60 days',
                                        all.d31to60),
                                  ]),
                                  const SizedBox(height: 8),
                                  Row(children: [
                                    _band(_orange, '61–90 days',
                                        all.d61to90),
                                    const SizedBox(width: 8),
                                    _band(Bl.red, '90+ days', all.d90plus),
                                  ]),
                                ],
                              ),
                            ),
                            const BlGroupHeader('Who owes',
                                trailing: 'OLDEST FIRST'),
                            for (final (c, a, owed) in rows)
                              BlTap(
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        ClientSettlementScreen(client: c),
                                  ),
                                ).then((_) {
                                  ref.invalidate(clientsProvider);
                                  ref.invalidate(recentSalesProvider);
                                }),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 18, vertical: 11),
                                  decoration: const BoxDecoration(
                                      border: Border(
                                          bottom:
                                              BorderSide(color: Bl.sep))),
                                  child: Row(
                                    children: [
                                      BlTintAvatar(c.name ?? ''),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              children: [
                                                Flexible(
                                                  child: Text(
                                                      c.name ?? 'Unnamed',
                                                      maxLines: 1,
                                                      overflow: TextOverflow
                                                          .ellipsis,
                                                      style: Bl.tight(14.5,
                                                          w: FontWeight
                                                              .w600)),
                                                ),
                                                if (a?.oldestDays != null) ...[
                                                  const SizedBox(width: 6),
                                                  a!.oldestDays! > 60
                                                      ? BlStatusPill.red(
                                                          '${a.oldestDays} days')
                                                      : a.oldestDays! > 30
                                                          ? BlStatusPill.yellow(
                                                              '${a.oldestDays} days')
                                                          : BlStatusPill.green(
                                                              '${a.oldestDays} days'),
                                                ],
                                              ],
                                            ),
                                            const SizedBox(height: 1),
                                            Text(
                                                [
                                                  if ((c.phone ?? '')
                                                      .trim()
                                                      .isNotEmpty)
                                                    c.phone!.trim(),
                                                  if (a != null)
                                                    '${a.unpaidBills} bill${a.unpaidBills == 1 ? '' : 's'}',
                                                ].join(' · '),
                                                maxLines: 1,
                                                overflow:
                                                    TextOverflow.ellipsis,
                                                style: Bl.inter(12,
                                                    c: const Color(
                                                        0xFF7A8088))),
                                            if (a != null)
                                              Padding(
                                                padding:
                                                    const EdgeInsets.only(
                                                        top: 7),
                                                child: ConstrainedBox(
                                                  constraints:
                                                      const BoxConstraints(
                                                          maxWidth: 150),
                                                  child: _bar(a,
                                                      height: 4, gap: 2),
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Text(Money.inr(owed),
                                          style: Bl.tight(14.5,
                                              w: FontWeight.w600,
                                              c: Bl.redDeep)),
                                      const SizedBox(width: 6),
                                      const BlIcon(BlIcons.chevronRight,
                                          size: 16,
                                          color: Color(0xFFB8BCC2)),
                                    ],
                                  ),
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
