import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'providers/accounts_provider.dart';

const _grey = Color(0xFF7A8088);
const _upiIcon =
    '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z"/>';
const _cardIcon = '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/>';

/// How one kind of account is drawn: heading, icon, tile and bar colours.
typedef _Kind = ({String label, String icon, Color bar, Color tile, Color ink});

const _kinds = <String, _Kind>{
  'CASH': (
    label: 'Cash',
    icon: BlIcons.cash,
    bar: Color(0xFF1E9E5A),
    tile: Color(0xFFE3F5EA),
    ink: Color(0xFF17663A),
  ),
  'BANK': (
    label: 'Bank',
    icon: BlIcons.bank,
    bar: Color(0xFF3B82F6),
    tile: Color(0xFFE4EEFF),
    ink: Color(0xFF1D4E9E),
  ),
  'UPI': (
    label: 'UPI',
    icon: _upiIcon,
    bar: Color(0xFF8B5CF6),
    tile: Color(0xFFEFE9FF),
    ink: Color(0xFF5133A8),
  ),
};
const _Kind _other = (
  label: 'Other',
  icon: _cardIcon,
  bar: Color(0xFF9AA0A6),
  tile: Bl.well,
  ink: Bl.ink3,
);

String _signed(double v) => v < 0 ? '− ${Money.inr(-v)}' : Money.inr(v);

/// "Cash & Bank" (canvas): every place the shop's money sits, and how much is
/// in each. Read only on the phone; accounts are set up on the web.
class AccountsScreen extends ConsumerWidget {
  const AccountsScreen({super.key});

  String _sub(AccountModel a) {
    final parts = <String>[
      switch (a.type) {
        'CASH' => 'Drawer',
        'BANK' => 'Bank account',
        'UPI' => (a.upiId ?? '').trim().isEmpty ? 'UPI' : a.upiId!.trim(),
        _ => a.type.isEmpty
            ? 'Account'
            : '${a.type[0]}${a.type.substring(1).toLowerCase()}',
      },
      if (a.type == 'CASH' && a.isDefault) 'used for sales',
      ...a.linkedUpiHandles,
      if (a.balance < -0.5 && a.type != 'LOAN') 'overdrawn',
    ];
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accountsAsync = ref.watch(accountsProvider);

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Cash & Bank'),
            Expanded(
              child: accountsAsync.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'Could not load your accounts. Check your internet and try again. ($e)',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                  ),
                ),
                data: (raw) {
                  if (raw.isEmpty) {
                    return const Center(
                      child: BlEmpty(
                        icon: BlIcons.bank,
                        title: 'No accounts yet',
                        message:
                            'Add accounts on the web app, under Settings, then Accounts.',
                      ),
                    );
                  }
                  final accounts = mergeLinkedUpiForDisplay(raw);
                  // A loan is money owed, not money held, so it stays out of
                  // the total.
                  final total = accounts
                      .where((a) => a.type != 'LOAN')
                      .fold<double>(0, (s, a) => s + a.balance);
                  final order = ['CASH', 'BANK', 'UPI'];
                  final groups = <(String, _Kind, List<AccountModel>)>[
                    for (final t in order)
                      (
                        t,
                        _kinds[t]!,
                        accounts.where((a) => a.type == t).toList(),
                      ),
                    (
                      'OTHER',
                      _other,
                      accounts.where((a) => !order.contains(a.type)).toList(),
                    ),
                  ].where((g) => g.$3.isNotEmpty).toList();
                  double sum(List<AccountModel> l) =>
                      l.fold<double>(0, (s, a) => s + a.balance);
                  final bars = [
                    for (final g in groups)
                      if (sum(g.$3) > 0.5) (g.$2, sum(g.$3)),
                  ];

                  return ListView(
                    padding: const EdgeInsets.only(bottom: 20),
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Total balance',
                                style: Bl.inter(13,
                                    w: FontWeight.w500, c: Bl.body)),
                            const SizedBox(height: 6),
                            Text(_signed(total),
                                style: Bl.tight(36,
                                    w: FontWeight.w700,
                                    ls: -0.04,
                                    h: 1.05,
                                    c: total < 0 ? Bl.redDeep : Bl.ink)),
                            if (bars.isNotEmpty) ...[
                              const SizedBox(height: 14),
                              SizedBox(
                                height: 6,
                                child: Row(
                                  children: [
                                    for (var i = 0; i < bars.length; i++)
                                      Expanded(
                                        flex: (bars[i].$2 /
                                                bars.fold<double>(
                                                    0, (s, b) => s + b.$2) *
                                                1000)
                                            .round()
                                            .clamp(15, 1000),
                                        child: Container(
                                          margin: EdgeInsets.only(
                                              right: i == bars.length - 1
                                                  ? 0
                                                  : 3),
                                          decoration: BoxDecoration(
                                              color: bars[i].$1.bar,
                                              borderRadius:
                                                  BorderRadius.circular(3)),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 12,
                              runSpacing: 4,
                              children: [
                                for (final g in groups)
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Container(
                                          width: 7,
                                          height: 7,
                                          decoration: BoxDecoration(
                                              color: g.$2.bar,
                                              shape: BoxShape.circle)),
                                      const SizedBox(width: 5),
                                      Text(
                                          '${g.$2.label} ${_signed(sum(g.$3))}',
                                          style: Bl.inter(12,
                                              w: FontWeight.w500,
                                              c: const Color(0xFF5E646C))),
                                    ],
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      for (final g in groups) ...[
                        BlGroupHeader(g.$2.label,
                            trailing: _signed(sum(g.$3))),
                        for (final a in g.$3)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 18, vertical: 10),
                            decoration: const BoxDecoration(
                                border: Border(
                                    bottom: BorderSide(color: Bl.sep))),
                            child: Row(
                              children: [
                                Container(
                                  width: 40,
                                  height: 40,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                      color: g.$2.tile,
                                      shape: BoxShape.circle),
                                  child: BlIcon(g.$2.icon,
                                      size: 17, color: g.$2.ink),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Flexible(
                                            child: Text(a.name,
                                                maxLines: 1,
                                                overflow:
                                                    TextOverflow.ellipsis,
                                                style: Bl.tight(14.5,
                                                    w: FontWeight.w600)),
                                          ),
                                          if (a.isDefault) ...[
                                            const SizedBox(width: 6),
                                            Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      horizontal: 7,
                                                      vertical: 1),
                                              decoration: BoxDecoration(
                                                  color:
                                                      const Color(0xFFEEF0F2),
                                                  borderRadius:
                                                      BorderRadius.circular(
                                                          999)),
                                              child: Text('Default',
                                                  style: Bl.tight(10.5,
                                                      w: FontWeight.w600,
                                                      ls: 0,
                                                      c: const Color(
                                                          0xFF3C434B))),
                                            ),
                                          ],
                                        ],
                                      ),
                                      const SizedBox(height: 1),
                                      Text(_sub(a),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: Bl.inter(12, c: _grey)),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Text(_signed(a.balance),
                                    style: Bl.tight(14.5,
                                        w: FontWeight.w600,
                                        c: a.balance < -0.5
                                            ? Bl.redDeep
                                            : Bl.ink)),
                              ],
                            ),
                          ),
                      ],
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
