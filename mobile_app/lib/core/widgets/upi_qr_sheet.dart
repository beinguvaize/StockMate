/// UpiQrSheet — bottom-sheet that renders a dynamic UPI deeplink QR for a
/// completed sale. Customer scans with PhonePe / GPay / Paytm / BHIM → pays
/// → cashier sees the bank push notification and taps "Mark Paid".
///
/// Pure client-side: works offline once business profile is cached.
/// No payment gateway involved here — that lives behind the Razorpay
/// connect toggle (Approach 2) and is wired in a separate flow.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:qr_flutter/qr_flutter.dart';

class UpiQrSheet extends StatelessWidget {
  final String upiId;
  final String merchantName;
  final double amount;
  final String invoiceNo;
  final String currencySymbol;
  final VoidCallback? onMarkPaid;

  const UpiQrSheet({
    super.key,
    required this.upiId,
    required this.merchantName,
    required this.amount,
    required this.invoiceNo,
    this.currencySymbol = '₹',
    this.onMarkPaid,
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

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 40, height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: AppColors.inkTertiary.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            Text(
              'Pay with UPI',
              textAlign: TextAlign.center,
              style: GoogleFonts.hankenGrotesk(
                fontSize: 22, fontWeight: FontWeight.w700,
                color: AppColors.inkPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Ask the customer to scan with PhonePe, GPay, Paytm, or BHIM.',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontSize: 12, color: AppColors.inkSecondary),
            ),
            const SizedBox(height: 20),

            // QR card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.outlineVariant),
              ),
              child: Column(
                children: [
                  QrImageView(
                    data: deeplink,
                    version: QrVersions.auto,
                    size: 220,
                    eyeStyle: const QrEyeStyle(
                      eyeShape: QrEyeShape.square,
                      color: Colors.black,
                    ),
                    dataModuleStyle: const QrDataModuleStyle(
                      dataModuleShape: QrDataModuleShape.square,
                      color: Colors.black,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    '$currencySymbol${amount.toStringAsFixed(2)}',
                    style: GoogleFonts.hankenGrotesk(
                      fontSize: 28, fontWeight: FontWeight.w800,
                      color: AppColors.inkPrimary,
                      letterSpacing: -0.5,
                    ),
                  ),
                  Text(
                    'Invoice $invoiceNo',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11, color: AppColors.inkTertiary,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // VPA + copy
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.canvas,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(LucideIcons.atSign, size: 14, color: AppColors.inkTertiary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      upiId,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 13, fontWeight: FontWeight.w600,
                        color: AppColors.inkPrimary,
                      ),
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
                    icon: const Icon(LucideIcons.copy, size: 16),
                    tooltip: 'Copy UPI ID',
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // Mark Paid CTA
            if (onMarkPaid != null)
              ElevatedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  onMarkPaid?.call();
                },
                icon: const Icon(LucideIcons.checkCircle2, size: 18),
                label: const Text('Mark as Paid'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: const StadiumBorder(),
                  textStyle: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
  }

  /// Show as a modal bottom sheet.
  static Future<void> show(
    BuildContext context, {
    required String upiId,
    required String merchantName,
    required double amount,
    required String invoiceNo,
    String currencySymbol = '₹',
    VoidCallback? onMarkPaid,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (_) => UpiQrSheet(
        upiId: upiId,
        merchantName: merchantName,
        amount: amount,
        invoiceNo: invoiceNo,
        currencySymbol: currencySymbol,
        onMarkPaid: onMarkPaid,
      ),
    );
  }
}
