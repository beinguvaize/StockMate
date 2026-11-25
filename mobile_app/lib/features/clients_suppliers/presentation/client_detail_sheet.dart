import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/clients_suppliers/data/models/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/add_client_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_settlement_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/client_statement_sheet.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/payment_reminder_sheet.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/sales/data/models/sale.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/sales/presentation/sales_view.dart'
    show shortSaleId;
import 'package:url_launcher/url_launcher.dart';

const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// One unpaid bill of a client, worked out from the sale.
class _OpenBill {
  final String number;
  final double due;
  final int days;
  final DateTime? dueDate;
  const _OpenBill(this.number, this.due, this.days, this.dueDate);
}

List<_OpenBill> _openBills(List<Sale> sales, Client client, DateTime now) {
  final out = <_OpenBill>[];
  for (final s in sales) {
    if (s.shopId != client.id) continue;
    final st = (s.paymentStatus ?? '').toUpperCase();
    if (st == 'PAID' || st == 'VOIDED' || st == 'FAILED') continue;
    if ((s.status ?? '').toUpperCase() == 'VOIDED') continue;
    final due = (s.totalAmount ?? 0) - (s.paidAmount ?? 0);
    if (due <= 0.5) continue;
    final date = s.date == null ? null : DateTime.tryParse(s.date!);
    final days = date == null ? 0 : now.difference(date).inDays.clamp(0, 99999);
    final credit = client.creditDays ?? 0;
    out.add(_OpenBill(
      (s.invoiceId ?? '').isNotEmpty ? s.invoiceId! : 'SAL-${shortSaleId(s.id)}',
      due,
      days,
      date != null && credit > 0 ? date.add(Duration(days: credit)) : null,
    ));
  }
  out.sort((a, b) => b.days.compareTo(a.days));
  return out;
}

/// The sheet that opens from a client row (canvas "Client detail"): who they
/// are, what they owe, the unpaid bills, and what you can do about it.
class ClientDetailSheet extends ConsumerWidget {
  final Client client;
  const ClientDetailSheet({super.key, required this.client});

  static Future<void> show(BuildContext context, Client client) =>
      showBlSheet<void>(
        context: context,
        builder: (_) => ClientDetailSheet(client: client),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = client.name ?? 'Unnamed';
    final owed = client.outstandingBalance ?? 0;
    final owes = owed > 0.5;
    final phone = (client.phone ?? '').trim();
    final credit = client.creditDays ?? 0;
    final sub = [
      if (phone.isNotEmpty) phone,
      client.clientType ?? 'B2C',
      credit == 0 ? 'Cash on delivery' : 'Net $credit days',
    ].join(' · ');
    final bills = _openBills(
        ref.watch(recentSalesProvider).valueOrNull ?? const [],
        client,
        DateTime.now());
    final shop = ref.watch(tenantContextProvider).valueOrNull?.tenant.name ?? '';

    void refresh() {
      ref.invalidate(clientsProvider);
      ref.invalidate(clientPaymentsProvider);
      ref.invalidate(recentSalesProvider);
    }

    Widget iconBtn(String icon, String label, VoidCallback? onTap) => BlTap(
          label: label,
          onTap: onTap,
          child: Opacity(
            opacity: onTap == null ? 0.4 : 1,
            child: Container(
              width: 48,
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: const Color(0xFFEFEEEC),
                  borderRadius: BorderRadius.circular(999)),
              child: BlIcon(icon, size: 18),
            ),
          ),
        );

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            BlTintAvatar(name, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(18, w: FontWeight.w700, ls: -0.02)),
                  const SizedBox(height: 1),
                  Text(sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.inter(12.5, c: const Color(0xFF7A8088))),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(Money.inr(owed.abs()),
                    style: Bl.tight(20,
                        w: FontWeight.w700,
                        ls: -0.02,
                        c: owes
                            ? Bl.redDeep
                            : owed < -0.5
                                ? const Color(0xFF17663A)
                                : Bl.ink)),
                Text(
                    owes
                        ? 'owes you'
                        : owed < -0.5
                            ? 'paid in advance'
                            : 'settled',
                    style: Bl.inter(11.5, c: const Color(0xFF7A8088))),
              ],
            ),
          ],
        ),
        if (bills.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Text('UNPAID BILLS · ${bills.length}', style: Bl.eyebrow),
          ),
          for (var i = 0; i < bills.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 11),
              decoration: i == bills.length - 1
                  ? null
                  : const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Bl.sep))),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(bills[i].number,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.tight(14, w: FontWeight.w600)),
                        const SizedBox(height: 1),
                        Text(
                            bills[i].dueDate == null
                                ? 'No due date'
                                : 'Due ${bills[i].dueDate!.day} ${_mon[bills[i].dueDate!.month - 1]} ${bills[i].dueDate!.year}',
                            style: Bl.inter(12,
                                c: const Color(0xFF7A8088))),
                      ],
                    ),
                  ),
                  bills[i].days > 60
                      ? BlStatusPill.red('${bills[i].days} days')
                      : bills[i].days > 30
                          ? BlStatusPill.yellow('${bills[i].days} days')
                          : BlStatusPill.green('${bills[i].days} days'),
                  const SizedBox(width: 10),
                  ConstrainedBox(
                    constraints: const BoxConstraints(minWidth: 62),
                    child: Text(Money.inr(bills[i].due),
                        textAlign: TextAlign.right,
                        style: Bl.tight(14, w: FontWeight.w600)),
                  ),
                ],
              ),
            ),
        ] else if (owes)
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Text(
                'The bills behind this balance are older than this phone holds. Open the statement to see them.',
                style: Bl.inter(12.5, c: Bl.mute, h: 1.45)),
          ),
        if (owes)
          Semantics(
            button: true,
            label: 'Send a payment reminder',
            excludeSemantics: true,
            child: BlTap(
              onTap: () => PaymentReminderSheet.show(
                context,
                clientName: name,
                phone: phone,
                shopName: shop,
                owed: owed,
                bills: [
                  for (final b in bills)
                    (number: b.number, due: b.due, days: b.days),
                ],
              ),
              child: Container(
                margin: const EdgeInsets.only(top: 8),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1FAF4),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFCDEBD8)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(
                          color: Color(0xFF128C4A), shape: BoxShape.circle),
                      child: const BlIcon(BlIcons.whatsappLine,
                          size: 18, color: Bl.white),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Send a payment reminder',
                              style: Bl.tight(14,
                                  w: FontWeight.w600,
                                  c: const Color(0xFF0E6B39))),
                          const SizedBox(height: 1),
                          Text(
                              'WhatsApp or SMS · ${Money.inr(owed)} due${bills.isEmpty ? '' : ' on ${bills.length} bill${bills.length == 1 ? '' : 's'}'}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Bl.inter(12,
                                  c: const Color(0xFF4E7A60))),
                        ],
                      ),
                    ),
                    const BlIcon(BlIcons.chevronRight,
                        size: 16, color: Color(0xFF128C4A)),
                  ],
                ),
              ),
            ),
          ),
        const SizedBox(height: 12),
        Row(
          children: [
            iconBtn(
                '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
                'Call $name',
                phone.isEmpty
                    ? null
                    : () => launchUrl(Uri(scheme: 'tel', path: phone))),
            const SizedBox(width: 8),
            iconBtn('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
                'Edit $name', () {
              final nav = Navigator.of(context);
              nav.pop();
              nav
                  .push(MaterialPageRoute(
                      builder: (_) => AddClientScreen(client: client)))
                  .then((_) => refresh());
            }),
            const SizedBox(width: 8),
            Expanded(
              flex: 10,
              child: BlButton('Statement',
                  kind: BlButtonKind.soft,
                  onTap: () => showClientStatement(context, client)),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 13,
              child: BlButton('Collect payment',
                  fontSize: 14,
                  onTap: () {
                    final nav = Navigator.of(context);
                    nav.pop();
                    nav
                        .push(MaterialPageRoute(
                            builder: (_) =>
                                ClientSettlementScreen(client: client)))
                        .then((_) => refresh());
                  }),
            ),
          ],
        ),
      ],
    );
  }
}
