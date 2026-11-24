/// UpiQrSheet — bottom-sheet that renders a dynamic UPI deeplink QR for a
/// completed sale. Customer scans with PhonePe / GPay / Paytm / BHIM → pays
/// → cashier sees the bank push notification and taps "Mark Paid".
///
/// Pure client-side: works offline once business profile is cached.
/// No payment gateway involved here — that lives behind the Razorpay
/// connect toggle (Approach 2) and is wired in a separate flow.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:qr_flutter/qr_flutter.dart';

class UpiQrSheet extends StatelessWidget {
  final String upiId;
  final String merchantName;
  final double amount;
  final String invoiceNo;
  final String currencySymbol;
  // When false the sheet is preview-only: no Mark Failed / Payment
  // Received buttons (those resolve a real sale), just a Close button.
  // Used when the cashier taps the UPI tile before completing the sale.
  final bool confirmable;

  const UpiQrSheet({
    super.key,
    required this.upiId,
    required this.merchantName,
    required this.amount,
    required this.invoiceNo,
    this.currencySymbol = '₹',
    this.confirmable = true,
  });

  /// upi://pay?pa=VPA&pn=NAME&am=AMOUNT&cu=INR&tn=Invoice X
  String _buildDeeplink() {
    final pn = Uri.encodeComponent(merchantName);
    final tn = Uri.encodeComponent('Invoice $invoiceNo');
    return 'upi://pay?pa=$upiId&pn=$pn&am=${amount.toStringAsFixed(2)}&cu=INR&tn=$tn';
  }

  @override
  Widget build(BuildContext context) {
    final deeplink = _buildDeeplink();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // A bill waiting on a UPI answer has no close button: it must end
        // in "received" or "failed".
        if (confirmable)
          Container(
            padding: const EdgeInsets.only(bottom: 12, top: 4),
            decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: Bl.sep))),
            child: Text('Pay with UPI',
                style: Bl.tight(16, w: FontWeight.w700, ls: -0.02)),
          )
        else
          const BlSheetTitle('Pay with UPI', size: 16, divider: true),
        const SizedBox(height: 10),
        Text('Ask the customer to scan with PhonePe, GPay, Paytm, or BHIM.',
            style: Bl.inter(12.5, w: FontWeight.w500, h: 1.45)),
        const SizedBox(height: 14),
        Center(
          child: Container(
            width: 182,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Bl.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFECEAE7)),
            ),
            child: QrImageView(
              data: deeplink,
              version: QrVersions.auto,
              size: 150,
              padding: EdgeInsets.zero,
              semanticsLabel: 'UPI payment QR code',
              eyeStyle: const QrEyeStyle(
                  eyeShape: QrEyeShape.square, color: Bl.ink),
              dataModuleStyle: const QrDataModuleStyle(
                  dataModuleShape: QrDataModuleShape.square, color: Bl.ink),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text('$currencySymbol${amount.toStringAsFixed(2)}',
            textAlign: TextAlign.center,
            style: Bl.tight(34, w: FontWeight.w700, ls: -0.04)),
        if (invoiceNo != 'PREVIEW')
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text('Invoice $invoiceNo',
                textAlign: TextAlign.center,
                style: Bl.inter(12.5,
                    w: FontWeight.w500, c: const Color(0xFF7A8088))),
          ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 9, 4, 9),
          decoration: BoxDecoration(
              color: const Color(0xFFF3F2F0),
              borderRadius: BorderRadius.circular(12)),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('UPI ID',
                        style:
                            Bl.inter(10, w: FontWeight.w500, c: Bl.mute)),
                    const SizedBox(height: 1),
                    Text(upiId,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(13.5, w: FontWeight.w600)),
                  ],
                ),
              ),
              BlTap(
                label: 'Copy UPI ID',
                onTap: () {
                  Clipboard.setData(ClipboardData(text: upiId));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('UPI ID copied'),
                      duration: Duration(seconds: 2),
                    ),
                  );
                },
                child: const SizedBox(
                  width: 44,
                  height: 36,
                  child: Center(
                    child: BlIcon(
                        '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
                        size: 16,
                        color: Bl.body),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (!confirmable)
          BlButton('Close',
              kind: BlButtonKind.soft, onTap: () => Navigator.pop(context))
        else ...[
          Row(
            children: [
              Expanded(
                child: BlButton('Mark failed',
                    kind: BlButtonKind.danger,
                    onTap: () => Navigator.pop(context, false)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: BlButton('Payment received',
                    onTap: () => Navigator.pop(context, true)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
              'Mark failed will void the sale and return stock. '
              'The cashier can then ring a fresh transaction.',
              textAlign: TextAlign.center,
              style: Bl.inter(12, c: Bl.mute, h: 1.5)),
        ],
      ],
    );
  }

  static Future<bool?> show(
    BuildContext context, {
    required String upiId,
    required String merchantName,
    required double amount,
    required String invoiceNo,
    String currencySymbol = '₹',
    bool confirmable = true,
  }) {
    return showBlSheet<bool>(
      context: context,
      isDismissible: !confirmable,
      builder: (_) => UpiQrSheet(
        upiId: upiId,
        merchantName: merchantName,
        amount: amount,
        invoiceNo: invoiceNo,
        currencySymbol: currencySymbol,
        confirmable: confirmable,
      ),
    );
  }
}
