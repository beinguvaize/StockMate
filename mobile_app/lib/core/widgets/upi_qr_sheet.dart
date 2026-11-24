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
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/features/dashboard/presentation/widgets/dash_common.dart';
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

  Widget _pill(String label,
      {required VoidCallback onTap, required Color fill, required Color ink}) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        height: 46,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
            color: fill, borderRadius: BorderRadius.circular(999)),
        child: Text(label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: DashText.tight(15, w: FontWeight.w600, c: ink, ls: 0)),
      ),
    );
  }

  // Laid out to the approved board "Pay with UPI" (sales-18).
  @override
  Widget build(BuildContext context) {
    final deeplink = _buildDeeplink();
    final mq = MediaQuery.of(context);
    const grey = Color(0xFF6E737A);

    return Container(
      margin: EdgeInsets.fromLTRB(8, 0, 8, 8 + mq.padding.bottom),
      constraints: BoxConstraints(
          maxHeight: mq.size.height - mq.padding.top - mq.padding.bottom - 24),
      decoration: BoxDecoration(
        color: DashColors.card,
        borderRadius: BorderRadius.circular(30),
      ),
      clipBehavior: Clip.antiAlias,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                    child: Text('Pay with UPI', style: DashText.tight(17))),
                // Only the preview can simply be closed. Once the sale
                // exists the cashier must say whether the money arrived,
                // because closing would be read as "it did not".
                if (!confirmable)
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => Navigator.pop(context),
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child: Center(
                        child: Container(
                          width: 32,
                          height: 32,
                          decoration: const BoxDecoration(
                              color: DashColors.well, shape: BoxShape.circle),
                          child: const Icon(LucideIcons.x,
                              size: 16, color: Color(0xFF4A5057)),
                        ),
                      ),
                    ),
                  )
                else
                  const SizedBox(height: 44),
              ],
            ),
            const SizedBox(height: 6),
            Container(height: 1, color: DashColors.sep),
            const SizedBox(height: 10),
            Text(
              'Ask the customer to scan with PhonePe, GPay, Paytm, or BHIM.',
              style: DashText.inter(12.5, c: grey).copyWith(height: 1.45),
            ),

            // ── QR ──────────────────────────────────────────────
            const SizedBox(height: 14),
            Center(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFECEAE7)),
                ),
                child: QrImageView(
                  data: deeplink,
                  version: QrVersions.auto,
                  size: 170,
                  padding: EdgeInsets.zero,
                  eyeStyle: const QrEyeStyle(
                    eyeShape: QrEyeShape.square,
                    color: Colors.black,
                  ),
                  dataModuleStyle: const QrDataModuleStyle(
                    dataModuleShape: QrDataModuleShape.square,
                    color: Colors.black,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '$currencySymbol${amount.toStringAsFixed(2)}',
              textAlign: TextAlign.center,
              style: DashText.tight(34, ls: -0.04),
            ),
            if (invoiceNo != 'PREVIEW') ...[
              const SizedBox(height: 2),
              Text('Invoice $invoiceNo',
                  textAlign: TextAlign.center,
                  style: DashText.inter(12.5, c: const Color(0xFF7A8088))),
            ],

            // ── UPI ID + copy ───────────────────────────────────
            Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.fromLTRB(12, 9, 4, 9),
              decoration: BoxDecoration(
                color: DashColors.well,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('UPI ID', style: DashText.inter(10)),
                        const SizedBox(height: 1),
                        Text(upiId,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: DashText.tight(13.5,
                                w: FontWeight.w600, ls: 0)),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: upiId));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('UPI ID copied'),
                          duration: Duration(seconds: 2),
                        ),
                      );
                    },
                    icon: const Icon(LucideIcons.copy, size: 16, color: grey),
                    tooltip: 'Copy UPI ID',
                  ),
                ],
              ),
            ),

            // Preview (confirmable = false): the sale is not created yet, so
            // there is nothing to mark paid or failed.
            if (confirmable) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _pill('Mark failed',
                        onTap: () => Navigator.pop(context, false),
                        fill: const Color(0xFFEFEEEC),
                        ink: DashColors.red),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _pill('Payment received',
                        onTap: () => Navigator.pop(context, true),
                        fill: DashColors.amber,
                        ink: Colors.white),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'Mark failed will void the sale and return stock. '
                'The cashier can then ring a fresh transaction.',
                textAlign: TextAlign.center,
                style: DashText.inter(12).copyWith(height: 1.5),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Show as a modal bottom sheet. Resolves to:
  ///   true  → cashier confirmed payment received
  ///   false → cashier confirmed NOT received
  ///   null  → dismissed (treated same as 'not received' by callers)
  static Future<bool?> show(
    BuildContext context, {
    required String upiId,
    required String merchantName,
    required double amount,
    required String invoiceNo,
    String currencySymbol = '₹',
    bool confirmable = true,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      // Preview mode is freely dismissible; confirm mode forces a choice.
      isDismissible: !confirmable,
      enableDrag: !confirmable,
      // Floating sheet: the card draws itself.
      backgroundColor: Colors.transparent,
      elevation: 0,
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
