import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_logic.dart' show compactRupees;
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/supplier.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_supplier_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';

// ─── Supplier transactions provider ──────────────────────────────────────────
// Provider key: "supplierId|supplierName"
final supplierTransactionsProvider =
    FutureProvider.family<List<_SupplierTxn>, String>((ref, key) async {
  final parts = key.split('|');
  final supplierId = parts.isNotEmpty ? parts[0] : '';
  final supplierName = parts.length > 1 ? parts[1] : '';
  if (supplierId.isEmpty && supplierName.isEmpty) return [];

  List data = [];
  // Try supplier_id first (more reliable)
  if (supplierId.isNotEmpty) {
    try {
      final result = await supabase
          .from('purchases')
          .select('id, total_amount, date, payment_type, status').isFilter('deleted_at', null)
          .eq('supplier_id', supplierId)
          .order('date', ascending: false)
          .limit(50);
      data = result as List;
    } catch (_) {}
  }
  // Fallback to name match if no results or supplier_id query failed
  if (data.isEmpty && supplierName.isNotEmpty) {
    final result = await supabase
        .from('purchases')
        .select('id, total_amount, date, payment_type, status').isFilter('deleted_at', null)
        .eq('supplier_name', supplierName)
        .order('date', ascending: false)
        .limit(50);
    data = result as List;
  }

  return data
      .map((row) => _SupplierTxn.fromMap(row as Map<String, dynamic>))
      .toList();
});

class _SupplierTxn {
  final String id;
  final double amount;
  final String? date;
  final String? paymentType;
  final String? status;

  _SupplierTxn({required this.id, required this.amount, this.date, this.paymentType, this.status});

  factory _SupplierTxn.fromMap(Map<String, dynamic> m) => _SupplierTxn(
        id: m['id'] as String,
        amount: (m['total_amount'] as num? ?? 0).toDouble(),
        date: m['date'] as String?,
        paymentType: m['payment_type'] as String?,
        status: (m['status'] as String?)?.toUpperCase(),
      );

  String get poNumber => 'PO-${id.substring(0, 8).toUpperCase()}';
}

// ─── Avatar helpers ────────────────────────────────────────────────────────────
String _fmtDate(String? d) {
  if (d == null || d.isEmpty) return '—';
  try {
    final dt = DateTime.parse(d);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
  } catch (_) {
    return d;
  }
}

class SupplierDetailScreen extends ConsumerWidget {
  final Supplier supplier;
  const SupplierDetailScreen({super.key, required this.supplier});

  static const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  Widget _action(String icon, String label, VoidCallback? onTap) => Expanded(
        child: Semantics(
          button: true,
          enabled: onTap != null,
          label: label,
          excludeSemantics: true,
          child: BlTap(
            onTap: onTap,
            child: Opacity(
              opacity: onTap == null ? 0.4 : 1,
              child: Column(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                        color: Bl.well, shape: BoxShape.circle),
                    child: BlIcon(icon, size: 17),
                  ),
                  const SizedBox(height: 6),
                  Text(label,
                      style: Bl.tight(12,
                          w: FontWeight.w600, ls: 0, c: Bl.ink3)),
                ],
              ),
            ),
          ),
        ),
      );

  Widget _stat(String label, String value, {bool last = false}) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: last
              ? null
              : const BoxDecoration(
                  border: Border(
                      right: BorderSide(color: Color(0xFFECEBE9)))),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: Bl.inter(11.5,
                      w: FontWeight.w500, c: const Color(0xFF7A8088))),
              const SizedBox(height: 2),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child:
                    Text(value, style: Bl.tight(16, w: FontWeight.w700)),
              ),
            ],
          ),
        ),
      );

  Widget _line(BuildContext context, String k, String v) => BlTap(
        label: '$k: $v. Copy',
        onTap: () {
          Clipboard.setData(ClipboardData(text: v));
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text('$k copied'),
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 2)));
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 10),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Bl.sep))),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(k,
                  style: Bl.inter(13.5,
                      w: FontWeight.w500, c: const Color(0xFF7A8088))),
              const SizedBox(width: 12),
              Expanded(
                child: Text(v,
                    textAlign: TextAlign.right,
                    style: Bl.inter(13.5, w: FontWeight.w600, c: Bl.ink)),
              ),
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = supplier.name ?? 'Unnamed';
    final phone = (supplier.phone ?? '').trim();
    final email = (supplier.email ?? '').trim();
    final contact = (supplier.contactPerson ?? '').trim();
    final address = (supplier.address ?? '').trim();
    final notes = (supplier.notes ?? '').trim();
    final owed = supplierOutstanding(
        supplier, ref.watch(supplierOutstandingProvider).valueOrNull);
    final aging =
        (ref.watch(supplierAgingProvider).valueOrNull ?? const {})[supplier.id];
    final txnsAsync = ref.watch(
        supplierTransactionsProvider('${supplier.id}|${supplier.name ?? ''}'));
    final txns = txnsAsync.valueOrNull ?? const <_SupplierTxn>[];
    final procured = txns.fold<double>(0, (t, x) => t + x.amount);
    final last = txns.isEmpty ? null : DateTime.tryParse(txns.first.date ?? '');
    final days = aging?.oldestDays;
    final bills = aging?.unpaidBills ?? 0;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              title: 'Supplier',
              trailing: BlRoundButton(
                '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
                label: 'Edit supplier',
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => AddSupplierScreen(supplier: supplier)),
                ).then((_) {
                  ref.invalidate(suppliersProvider);
                  if (context.mounted) Navigator.maybePop(context);
                }),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(bottom: 20),
                children: BlEntrance.all([
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
                    child: Row(
                      children: [
                        BlTintAvatar(name, size: 48),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: Bl.tight(18,
                                      w: FontWeight.w700, ls: -0.02)),
                              if (contact.isNotEmpty || phone.isNotEmpty) ...[
                                const SizedBox(height: 1),
                                Text(
                                    [
                                      if (contact.isNotEmpty) contact,
                                      if (phone.isNotEmpty) phone,
                                    ].join(' · '),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.inter(12.5,
                                        c: const Color(0xFF7A8088))),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                  owed > 0.5
                                      ? 'You owe'
                                      : owed < -0.5
                                          ? 'Paid in advance'
                                          : 'Nothing owed',
                                  style:
                                      Bl.inter(13, w: FontWeight.w500)),
                              const SizedBox(height: 4),
                              Text(Money.inr(owed.abs()),
                                  style: Bl.tight(34,
                                      w: FontWeight.w700,
                                      ls: -0.04,
                                      h: 1.05,
                                      c: owed > 0.5 ? Bl.redDeep : Bl.ink)),
                            ],
                          ),
                        ),
                        if (owed > 0.5 && days != null)
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              days > 60
                                  ? BlStatusPill.red('oldest $days days')
                                  : days > 30
                                      ? BlStatusPill.yellow(
                                          'oldest $days days')
                                      : BlStatusPill.green(
                                          'oldest $days days'),
                              const SizedBox(height: 5),
                              Text(
                                  '$bills unpaid bill${bills == 1 ? '' : 's'}',
                                  style: Bl.inter(12,
                                      c: const Color(0xFF7A8088))),
                            ],
                          ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
                    child: Row(
                      children: [
                        _action(
                            '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
                            'Call',
                            phone.isEmpty
                                ? null
                                : () => launchUrl(
                                    Uri(scheme: 'tel', path: phone))),
                        _action(
                            '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 8l9 6 9-6"/>',
                            'Email',
                            email.isEmpty
                                ? null
                                : () => launchUrl(
                                    Uri(scheme: 'mailto', path: email))),
                        _action(
                            BlIcons.box,
                            'Orders',
                            () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) =>
                                        const PurchasesScreen()))),
                      ],
                    ),
                  ),
                  Container(
                    margin: const EdgeInsets.fromLTRB(18, 16, 18, 0),
                    decoration: BoxDecoration(
                      border: Border.all(color: const Color(0xFFECEBE9)),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        _stat('Procured', compactRupees(procured)),
                        _stat('Orders', '${txns.length}'),
                        _stat(
                            'Last order',
                            last == null
                                ? '—'
                                : '${last.day} ${_mon[last.month - 1]}',
                            last: true),
                      ],
                    ),
                  ),
                  if (email.isNotEmpty || address.isNotEmpty || notes.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
                      child: Column(
                        children: [
                          if (email.isNotEmpty) _line(context, 'Email', email),
                          if (address.isNotEmpty)
                            _line(context, 'Address', address),
                          if (notes.isNotEmpty) _line(context, 'Notes', notes),
                        ],
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
                    child: Row(
                      children: [
                        Expanded(
                            child: Text('PURCHASE HISTORY',
                                style: Bl.eyebrow)),
                        Text(
                            '${txns.length} order${txns.length == 1 ? '' : 's'}',
                            style: Bl.eyebrow),
                      ],
                    ),
                  ),
                  if (txnsAsync.isLoading && !txnsAsync.hasValue)
                    const Padding(
                      padding: EdgeInsets.only(top: 30),
                      child: Center(
                          child: CircularProgressIndicator(
                              color: Bl.amber, strokeWidth: 2)),
                    )
                  else if (txnsAsync.hasError && !txnsAsync.hasValue)
                    Padding(
                      padding: const EdgeInsets.all(18),
                      child: Text(
                          'Could not load the orders. Check your internet and try again.',
                          style: Bl.inter(13, c: Bl.redDeep)),
                    )
                  else if (txns.isEmpty)
                    const BlEmpty(
                        icon: BlIcons.box, title: 'No orders from this supplier yet')
                  else
                    Column(
                      children: [for (final t in txns) _TxnTile(txn: t)],
                    ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TxnTile extends StatelessWidget {
  final _SupplierTxn txn;
  const _TxnTile({required this.txn});

  @override
  Widget build(BuildContext context) {
    final pill = switch (txn.status ?? 'RECEIVED') {
      'RECEIVED' => const BlStatusPill.green('Received'),
      'ORDERED' => const BlStatusPill.yellow('Ordered'),
      'CANCELLED' => const BlStatusPill.red('Cancelled'),
      _ => const BlStatusPill.grey('Pending'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Bl.sep))),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration:
                const BoxDecoration(color: Bl.well, shape: BoxShape.circle),
            child: const BlIcon(BlIcons.box, size: 17),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(txn.poNumber, style: Bl.tight(14, w: FontWeight.w600)),
                const SizedBox(height: 1),
                Text(_fmtDate(txn.date),
                    style: Bl.inter(12, c: const Color(0xFF7A8088))),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(Money.inr(txn.amount),
                  style: Bl.tight(14.5, w: FontWeight.w600)),
              const SizedBox(height: 3),
              pill,
            ],
          ),
        ],
      ),
    );
  }
}
