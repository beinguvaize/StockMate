import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:url_launcher/url_launcher.dart';

/// One unpaid bill, as the reminder lists it.
typedef ReminderBill = ({String number, double due, int days});

/// The reminder text. Kept apart from the sheet so it can be tested.
String reminderMessage({
  required String clientName,
  required String shopName,
  required double owed,
  required List<ReminderBill> bills,
  required bool firm,
  required bool withBills,
}) {
  final n = bills.length;
  final oldest = bills.fold<int>(0, (m, b) => b.days > m ? b.days : m);
  final on = n == 0 ? '' : ' on $n bill${n == 1 ? '' : 's'}';
  final at = shopName.isEmpty ? '' : ' at $shopName';
  final buf = StringBuffer();
  if (firm) {
    buf.write('Hello $clientName, ${Money.inr(owed)} is overdue$on$at.');
    if (oldest > 0) buf.write(' The oldest bill is $oldest days old.');
    buf.write(' Please settle it at the earliest. Thank you.');
  } else {
    buf.write('Hello $clientName, a balance of ${Money.inr(owed)} is due$on$at.');
    if (oldest > 0) buf.write(' The oldest is $oldest days old.');
    buf.write(' Please pay when you can. Thank you.');
  }
  if (withBills && bills.isNotEmpty) {
    buf.write('\n');
    for (final b in bills) {
      buf.write('\n${b.number}: ${Money.inr(b.due)}');
    }
  }
  return buf.toString();
}

/// Digits only, with India's 91 in front of a bare ten-digit number.
String reminderPhone(String raw) {
  final d = raw.replaceAll(RegExp(r'\D'), '');
  return d.length == 10 ? '91$d' : d;
}

/// "Payment reminder" (canvas): a preview of the message, its tone, and two
/// ways to send it. It opens WhatsApp or the SMS app with the text ready; the
/// owner presses send there. Nothing is sent from this app.
class PaymentReminderSheet extends StatefulWidget {
  final String clientName;
  final String phone;
  final String shopName;
  final double owed;
  final List<ReminderBill> bills;
  const PaymentReminderSheet({
    super.key,
    required this.clientName,
    required this.phone,
    required this.shopName,
    required this.owed,
    required this.bills,
  });

  static Future<void> show(
    BuildContext context, {
    required String clientName,
    required String phone,
    required String shopName,
    required double owed,
    required List<ReminderBill> bills,
  }) =>
      showBlSheet<void>(
        context: context,
        builder: (_) => PaymentReminderSheet(
          clientName: clientName,
          phone: phone,
          shopName: shopName,
          owed: owed,
          bills: bills,
        ),
      );

  @override
  State<PaymentReminderSheet> createState() => _PaymentReminderSheetState();
}

class _PaymentReminderSheetState extends State<PaymentReminderSheet> {
  bool _firm = false;
  bool _withBills = false;
  bool _editing = false;
  late final _text = TextEditingController(text: _compose());

  String _compose() => reminderMessage(
        clientName: widget.clientName,
        shopName: widget.shopName,
        owed: widget.owed,
        bills: widget.bills,
        firm: _firm,
        withBills: _withBills,
      );

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  // Changing tone or the bill list rewrites the message, unless the owner
  // has started typing their own.
  void _recompose() {
    if (!_editing) _text.text = _compose();
  }

  Future<void> _open(Uri uri, String app) async {
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    var ok = false;
    try {
      ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      debugPrint('[reminder] could not open $app: $e');
    }
    if (ok) {
      nav.maybePop();
    } else {
      messenger.showSnackBar(SnackBar(
        content: Text('Could not open $app on this phone.'),
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  Widget _pill(String label, bool on, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: Semantics(
          button: true,
          selected: on,
          label: label,
          excludeSemantics: true,
          child: BlTap(
            onTap: onTap,
            child: Container(
              height: 32,
              padding: const EdgeInsets.symmetric(horizontal: 13),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: on ? Bl.ink : null,
                borderRadius: BorderRadius.circular(999),
                border:
                    Border.all(color: on ? Bl.ink : const Color(0xFFDADADA)),
              ),
              child: Text(label,
                  style: Bl.tight(12.5,
                      w: FontWeight.w600,
                      ls: 0,
                      c: on ? Bl.white : const Color(0xFF303030))),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final phone = reminderPhone(widget.phone);
    final hasPhone = phone.length >= 8;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BlSheetTitle('Payment reminder', size: 16, divider: true),
        const SizedBox(height: 12),
        Row(
          children: [
            BlTintAvatar(widget.clientName, size: 36),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('To ${widget.clientName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(14.5, w: FontWeight.w600)),
                  Text(hasPhone ? widget.phone : 'No phone number saved',
                      style: Bl.inter(12,
                          c: hasPhone
                              ? const Color(0xFF7A8088)
                              : Bl.redDeep)),
                ],
              ),
            ),
            Text(Money.inr(widget.owed),
                style: Bl.tight(16, w: FontWeight.w700, c: Bl.redDeep)),
          ],
        ),
        Container(
          margin: const EdgeInsets.only(top: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              color: const Color(0xFFECE5DD),
              borderRadius: BorderRadius.circular(16)),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: const BoxDecoration(
              color: Bl.white,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(4),
                topRight: Radius.circular(14),
                bottomLeft: Radius.circular(14),
                bottomRight: Radius.circular(14),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _text,
                  readOnly: !_editing,
                  maxLines: null,
                  cursorColor: Bl.brand,
                  style: Bl.inter(13.5, c: Bl.ink3, h: 1.5),
                  decoration: const InputDecoration(
                    isCollapsed: true,
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                  ),
                ),
                const SizedBox(height: 4),
                Text(_editing ? 'your wording' : 'preview',
                    textAlign: TextAlign.right,
                    style: Bl.inter(10.5, c: Bl.mute)),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _pill('Polite', !_firm, () {
                  setState(() => _firm = false);
                  _recompose();
                }),
                _pill('Firm', _firm, () {
                  setState(() => _firm = true);
                  _recompose();
                }),
                if (widget.bills.isNotEmpty)
                  _pill('Add bill list', _withBills, () {
                    setState(() => _withBills = !_withBills);
                    _recompose();
                  }),
                _pill('Edit', _editing, () {
                  setState(() => _editing = !_editing);
                  _recompose();
                }),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Semantics(
          button: true,
          enabled: hasPhone,
          label: 'Send on WhatsApp',
          excludeSemantics: true,
          child: BlTap(
            onTap: hasPhone
                ? () => _open(
                    Uri.parse(
                        'https://wa.me/$phone?text=${Uri.encodeComponent(_text.text)}'),
                    'WhatsApp')
                : null,
            child: Opacity(
              opacity: hasPhone ? 1 : 0.5,
              child: Container(
                height: 46,
                decoration: BoxDecoration(
                    color: const Color(0xFF128C4A),
                    borderRadius: BorderRadius.circular(999)),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const BlIcon(BlIcons.whatsappLine,
                        size: 18, color: Bl.white),
                    const SizedBox(width: 8),
                    Text('Send on WhatsApp',
                        style: Bl.tight(15, w: FontWeight.w600, c: Bl.white)),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        BlButton('Send as SMS',
            kind: BlButtonKind.soft,
            onTap: hasPhone
                ? () => _open(
                    Uri(
                        scheme: 'sms',
                        path: '+$phone',
                        queryParameters: {'body': _text.text}),
                    'Messages')
                : null),
      ],
    );
  }
}
