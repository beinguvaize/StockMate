import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';
import 'package:mobile_app/features/returns/presentation/sales_return_form_screen.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';
import 'package:mobile_app/features/settings/presentation/providers/settings_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart';
import 'package:mobile_app/core/widgets/upi_qr_sheet.dart';
import 'package:mobile_app/core/supabase/client.dart' as sb;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:mobile_app/core/print/web_print_service.dart';
import 'package:mobile_app/core/print/pos_receipt_pdf.dart' as pos_pdf;
import 'package:supabase_flutter/supabase_flutter.dart';

// ─── Line item ────────────────────────────────────────────────────────────────
// Shared with add_sale_screen.dart's checkout fallback — see core/print/pos_receipt_pdf.dart.
typedef _Item = pos_pdf.PdfLineItem;
List<_Item> _parseItems(Invoice invoice) => pos_pdf.parsePdfItems(invoice);
String _fmtAmount(double v) => pos_pdf.fmtReceiptAmount(v);

String _fmtDate(String? iso) {
  if (iso == null) return '—';
  try {
    final d = DateTime.parse(iso);
    const m = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  } catch (_) {
    return iso;
  }
}

// ignore: unused_element
String _computeDueDateStr(String? iso) {
  if (iso == null) return '—';
  try {
    final d = DateTime.parse(iso).add(const Duration(days: 15));
    const m = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  } catch (_) {
    return '—';
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class InvoiceDetailScreen extends ConsumerWidget {
  final Invoice invoice;
  const InvoiceDetailScreen({super.key, required this.invoice});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(businessProfileProvider);
    final profile = profileAsync.asData?.value;

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, size: 20, color: Color(0xFF1E293B)),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              invoice.docKind,
              style: GoogleFonts.manrope(
                color: const Color(0xFF1E293B),
                fontSize: 18,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.3,
              ),
            ),
            Text(
              invoice.displayNumber,
              style: GoogleFonts.jetBrainsMono(
                color: const Color(0xFF94A3B8),
                fontSize: 10,
              ),
            ),
          ],
        ),
        actions: [
          // Real GST invoices get Print/Share PDF icons. Sale-backed views
          // skip these — they print receipts via the body buttons instead.
          if (invoice.id.startsWith('INV-')) ...[
            IconButton(
              onPressed: () => _share(context, profile),
              icon: const Icon(LucideIcons.share2, size: 20, color: AppColors.primary),
              tooltip: 'Share PDF',
            ),
            IconButton(
              onPressed: () => _print(context, profile),
              icon: const Icon(LucideIcons.printer, size: 20, color: Color(0xFF1E293B)),
              tooltip: 'Print',
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _InvoiceCard(
              invoice: invoice,
              profile: profile,
              clientOutstanding: () {
                final cid = invoice.clientId;
                if (cid == null || cid.isEmpty) return 0.0;
                final cs = ref.read(clientsProvider).valueOrNull ?? const [];
                for (final c in cs) {
                  if (c.id == cid) return c.outstandingBalance ?? 0.0;
                }
                return 0.0;
              }(),
            ),
            const SizedBox(height: 20),

            // GST Invoice print/share — only when this view is a real GST invoice.
            // Sale-backed views (id starts with SAL-) get Receipt buttons only.
            if (invoice.id.startsWith('INV-'))
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _print(context, profile),
                      icon: const Icon(LucideIcons.printer, size: 16),
                      label: Text('Print',
                          style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w700, fontSize: 14)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF1E293B),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: const StadiumBorder(),
                        side: const BorderSide(color: Color(0xFFE2E8F0), width: 1.5),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: () => _share(context, profile),
                      icon: const Icon(LucideIcons.share2, size: 16),
                      label: Text('Share Invoice',
                          style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w700, fontSize: 14)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.secondary,
                        foregroundColor: AppColors.primaryContainer,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: const StadiumBorder(),
                        elevation: 0,
                      ),
                    ),
                  ),
                ],
              ),

            if (invoice.id.startsWith('INV-')) const SizedBox(height: 12),
            if (!invoice.id.startsWith('INV-'))
              // No spacer needed; receipt row starts directly.
              const SizedBox.shrink(),
            // POS Receipt — always available for sale-backed views.
            // For real invoices we keep them too as a fallback (some users still
            // want a thermal print). Hidden buttons row above implies this is
            // the primary action set for SAL- views.
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _printPosReceipt(context, profile),
                    icon: const Icon(LucideIcons.receipt, size: 16),
                    label: Text('Print Receipt',
                        style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF1E293B),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: const StadiumBorder(),
                      side: const BorderSide(color: Color(0xFFE2E8F0), width: 1.5),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _sharePosReceipt(context, profile),
                    icon: const Icon(LucideIcons.share2, size: 16),
                    label: Text('Share Receipt',
                        style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF1E293B),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: const StadiumBorder(),
                      side: const BorderSide(color: Color(0xFFE2E8F0), width: 1.5),
                    ),
                  ),
                ),
              ],
            ),

            // ── IRN status + manual generate (real invoices only) ────────
            if (invoice.id.startsWith('INV-')) ...[
              const SizedBox(height: 12),
              _IrnStatusCard(
                invoice: invoice,
                onGenerate: () => _enqueueIrn(context, ref),
              ),
            ],

            // Sale → GST Invoice flow.
            // ALL sales (walk-in or named) can be converted — cashier collects
            // client + GSTIN at the time of conversion.
            // Already-converted sales: show 'GST Invoice issued · INV-…' badge.
            if (invoice.id.startsWith('SAL-') &&
                (invoice.linkedInvoiceIdFromSale == null ||
                 invoice.linkedInvoiceIdFromSale!.isEmpty)) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _convertToInvoice(context, ref),
                  icon: const Icon(LucideIcons.fileText, size: 16),
                  label: Text('Convert to GST Invoice',
                      style: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 14)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1E293B),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                ),
              ),
            ],

            // Sale already converted → show muted reference to the linked invoice.
            if (invoice.id.startsWith('SAL-') &&
                invoice.linkedInvoiceIdFromSale != null &&
                invoice.linkedInvoiceIdFromSale!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(LucideIcons.checkCircle2, size: 16, color: AppColors.success),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'GST Invoice issued · ${invoice.linkedInvoiceIdFromSale}',
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.manrope(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.success),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            if (invoice.paymentStatus != 'PAID') ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  // Failed / pending UPI sales re-open the QR sheet so the
                  // cashier can ask the customer to retry the payment and
                  // confirm receipt; on success we call unvoid_sale which
                  // re-decrements stock and marks the row PAID.
                  // Everything else falls through to the generic payment
                  // sheet (cash / bank / etc.).
                  onPressed: () {
                    final pm = (invoice.paymentMethod ?? '').toUpperCase();
                    final ps = invoice.paymentStatus.toUpperCase();
                    final isUpiFailed = pm == 'UPI' && (ps == 'VOIDED' || ps == 'FAILED' || ps == 'PENDING');
                    if (isUpiFailed) {
                      _retryUpiPayment(context, ref, invoice);
                    } else {
                      _showPaymentSheet(context, ref);
                    }
                  },
                  icon: const Icon(LucideIcons.indianRupee, size: 16),
                  label: Text('Record Payment',
                      style: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 14)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                ),
              ),
            ],

            if (invoice.items != null && invoice.items!.isNotEmpty) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => SalesReturnFormScreen(invoice: invoice),
                    ),
                  ),
                  icon: const Icon(LucideIcons.rotateCcw, size: 16),
                  label: Text('Process Return',
                      style: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 14)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.danger,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: const StadiumBorder(),
                    elevation: 0,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Future<void> _share(BuildContext context, BusinessProfile? profile) async {
    try {
      // Prefer web-rendered template for pixel parity. Fall back to local
      // pw builder if offscreen WebView fails (no session, dev env, etc.).
      Uint8List? bytes;
      try {
        bytes = await WebPrintService.renderInvoicePdf(invoice.id);
      } catch (e) {
        debugPrint('[print] web render failed, fallback to local: $e');
        // Surface the reason so silent layout mismatches between web
        // and mobile can be diagnosed by the user instead of being
        // hidden behind a "looks different" complaint.
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Printed using standard layout (offline-friendly).'),
            backgroundColor: AppColors.secondary,
            behavior: SnackBarBehavior.floating,
            duration: Duration(seconds: 3),
          ));
        }
      }
      bytes ??= await _buildPdf(profile);
      await Printing.sharePdf(
          bytes: bytes,
          filename: 'invoice-${invoice.id.substring(0, 8)}.pdf');
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger));
      }
    }
  }

  Future<void> _print(BuildContext context, BusinessProfile? profile) async {
    try {
      Uint8List? bytes;
      try {
        bytes = await WebPrintService.renderInvoicePdf(invoice.id);
      } catch (e) {
        debugPrint('[print] web render failed, fallback to local: $e');
        // Surface the reason so silent layout mismatches between web
        // and mobile can be diagnosed by the user instead of being
        // hidden behind a "looks different" complaint.
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Printed using standard layout (offline-friendly).'),
            backgroundColor: AppColors.secondary,
            behavior: SnackBarBehavior.floating,
            duration: Duration(seconds: 3),
          ));
        }
      }
      bytes ??= await _buildPdf(profile);
      // GST invoice = A4. Without an explicit format the system dialog
      // defaults to Letter, which crops the right edge of an A4 sheet.
      await Printing.layoutPdf(
        onLayout: (_) async => bytes!,
        format: PdfPageFormat.a4,
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger));
      }
    }
  }

  Future<void> _sharePosReceipt(BuildContext context, BusinessProfile? profile) async {
    try {
      Uint8List? bytes;
      try {
        // POS receipt embed expects sale id. Use back-link saleId when
        // present (GST-invoice rows), else fall back to id (raw sale).
        bytes = await WebPrintService.renderReceiptPdf(invoice.saleId ?? invoice.id);
      } catch (e) {
        debugPrint('[print] web render failed, fallback to local: $e');
        // Surface the reason so silent layout mismatches between web
        // and mobile can be diagnosed by the user instead of being
        // hidden behind a "looks different" complaint.
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Printed using standard layout (offline-friendly).'),
            backgroundColor: AppColors.secondary,
            behavior: SnackBarBehavior.floating,
            duration: Duration(seconds: 3),
          ));
        }
      }
      bytes ??= await _buildPosReceiptPdf(profile);
      await Printing.sharePdf(
          bytes: bytes,
          filename: 'receipt-${invoice.id.substring(0, 8)}.pdf');
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger));
      }
    }
  }

  Future<void> _enqueueIrn(BuildContext context, WidgetRef ref) async {
    try {
      final supabase = Supabase.instance.client;
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) return;

      final result = await supabase.rpc('enqueue_irn_request', params: {
        'p_invoice_id': invoice.id,
        'p_user_id':    userId,
      });
      final data = (result is Map) ? Map<String, dynamic>.from(result) : {};
      final already = data['already_existed'] == true;

      try { ref.invalidate(invoicesProvider); } catch (_) {}

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(already ? 'IRN request already queued' : 'IRN request queued'),
          backgroundColor: AppColors.secondary,
          behavior: SnackBarBehavior.floating,
        ));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('IRN enqueue failed: $e'),
          backgroundColor: AppColors.danger,
          duration: const Duration(seconds: 6),
        ));
      }
    }
  }

  Future<void> _convertToInvoice(BuildContext context, WidgetRef ref) async {
    // Open form sheet to collect client info + GSTIN.
    // ANY sale (walk-in or named) can be converted — we collect everything
    // we need to issue a GST tax invoice at this moment.
    final result = await showModalBottomSheet<Map<String, String?>?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _ConvertSheet(invoice: invoice),
    );
    if (result == null) return; // cancelled
    if (!context.mounted) return; // widget unmounted while sheet was open

    await _runConvertRpc(context, ref, result);
  }

  Future<void> _runConvertRpc(
      BuildContext context, WidgetRef ref, Map<String, String?> form) async {
    try {
      final supabase = Supabase.instance.client;
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Not signed in')));
        }
        return;
      }

      // Auto-create a clients row when the sale has no linked client (walk-in)
      // and we now have full GST customer info. Future sales to the same
      // customer can then link directly. Skip silently on any DB error —
      // invoice still goes through.
      String? clientId = invoice.clientId;
      if ((clientId == null || clientId.isEmpty) &&
          (form['gstin'] ?? '').isNotEmpty) {
        try {
          // tenant_id required — server default points at seed tenant which
          // RLS hides from this user. id is NOT NULL with no default.
          final tenantId = ref.read(tenantContextProvider).valueOrNull?.tenantId;
          if (tenantId != null) {
            final newClientId =
                'CLI-${DateTime.now().millisecondsSinceEpoch}-${DateTime.now().microsecond}';
            final inserted = await supabase.from('clients').insert({
              'id':                newClientId,
              'tenant_id':         tenantId,
              'name':              form['name'],
              'phone':             form['phone'],
              'address':           form['address'],
              'gst_no':            form['gstin'],
              'state':             form['placeOfSupply'],
              'outstanding_balance': 0,
            }).select('id').maybeSingle();
            if (inserted != null && inserted['id'] != null) {
              clientId = inserted['id'] as String;
            }
          }
        } catch (e) {
          debugPrint('[convert] client auto-create failed (non-fatal): $e');
        }
      }

      final result = await supabase.rpc('convert_sale_to_invoice', params: {
        'p_sale_id':         invoice.id,
        'p_user_id':         userId,
        'p_client_id':       clientId,
        'p_client_name':     form['name'] ?? invoice.clientName,
        'p_gstin':           form['gstin'],
        'p_address':         form['address'],
        'p_phone':           form['phone'],
        'p_place_of_supply': form['placeOfSupply'],
        'p_due_days':        int.tryParse(form['dueDays'] ?? '30') ?? 30,
      });

      final data = (result is Map) ? Map<String, dynamic>.from(result) : <String, dynamic>{};
      final number = data['invoice_number']?.toString() ?? 'created';
      final already = data['already_existed'] == true;

      // Refresh sales/invoices/clients so back-link + new client reflect.
      try { ref.invalidate(invoicesProvider); } catch (_) {}
      try { ref.invalidate(recentSalesProvider); } catch (_) {}
      try { ref.invalidate(clientsProvider); } catch (_) {}

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(already
              ? 'Already converted: $number'
              : 'GST Invoice $number created'),
          backgroundColor: AppColors.secondary,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 5),
        ));
        Navigator.of(context).pop(); // close detail; user can re-open via Invoices tab
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Convert failed: $e'),
          backgroundColor: AppColors.danger,
          duration: const Duration(seconds: 6),
        ));
      }
    }
  }

  Future<void> _printPosReceipt(BuildContext context, BusinessProfile? profile) async {
    try {
      Uint8List? bytes;
      try {
        // POS receipt embed expects sale id. Use back-link saleId when
        // present (GST-invoice rows), else fall back to id (raw sale).
        bytes = await WebPrintService.renderReceiptPdf(invoice.saleId ?? invoice.id);
      } catch (e) {
        debugPrint('[print] web render failed, fallback to local: $e');
        // Surface the reason so silent layout mismatches between web
        // and mobile can be diagnosed by the user instead of being
        // hidden behind a "looks different" complaint.
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Printed using standard layout (offline-friendly).'),
            backgroundColor: AppColors.secondary,
            behavior: SnackBarBehavior.floating,
            duration: Duration(seconds: 3),
          ));
        }
      }
      bytes ??= await _buildPosReceiptPdf(profile);
      // roll80 has an infinite height and the plugin passes dimensions
      // straight to Android's PrintManager, which needs finite values —
      // that produced a blank page. The PDF already carries its own page
      // size, so let the print dialog's paper picker choose the roll.
      await Printing.layoutPdf(onLayout: (_) async => bytes!);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger));
      }
    }
  }

  /// Failed/voided UPI sale → re-open the QR sheet so the customer can
  /// retry. On confirmed receipt we call unvoid_sale which re-decrements
  /// stock and marks the row PAID. Cashier doesn't need to re-enter items.
  Future<void> _retryUpiPayment(BuildContext context, WidgetRef ref, Invoice inv) async {
    final supabase = sb.supabase;
    try {
      final profile = await ref.read(tenantProfileProvider.future);
      final upiId    = profile?['upi_id'] as String?;
      final merchant = (profile?['businessName'] as String?) ??
                       (profile?['name'] as String?) ?? 'Merchant';
      final symbol   = (profile?['currencySymbol'] as String?) ?? '₹';
      if (upiId == null || upiId.isEmpty) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Add a UPI ID in Settings to retry payment.')),
        );
        return;
      }

      final confirmed = await UpiQrSheet.show(
        context,
        upiId: upiId,
        merchantName: merchant,
        amount: inv.grandTotal,
        invoiceNo: inv.invoiceNumber ?? inv.id,
        currencySymbol: symbol,
      );

      if (confirmed != true) return; // Cashier left it failed.

      final userId = supabase.auth.currentUser?.id;
      await supabase.rpc('unvoid_sale', params: {
        'p_id': inv.id,
        'p_paid_amount': inv.grandTotal,
        'p_user_id': userId,
      });

      ref.invalidate(recentSalesProvider);

      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Payment recorded. Sale marked PAID.'),
          backgroundColor: AppColors.success,
        ),
      );
      Navigator.pop(context); // Back to history
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to record payment: $e'), backgroundColor: AppColors.danger),
      );
    }
  }

  void _showPaymentSheet(BuildContext context, WidgetRef ref) {
    final outstanding = invoice.outstanding;
    final amountCtrl = TextEditingController(text: outstanding.toStringAsFixed(2));

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(ctx).viewInsets.bottom + 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(
                  color: AppColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text('Record Payment',
                style: GoogleFonts.manrope(
                    fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.inkPrimary)),
            const SizedBox(height: 4),
            Text('Balance due: ₹${outstanding.toStringAsFixed(2)}',
                style: GoogleFonts.manrope(fontSize: 13, color: AppColors.inkTertiary)),
            const SizedBox(height: 20),
            Container(
              decoration: BoxDecoration(
                color: AppColors.surfaceContainer,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
              ),
              child: TextField(
                controller: amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: GoogleFonts.manrope(fontSize: 16, color: AppColors.inkPrimary, fontWeight: FontWeight.w600),
                decoration: InputDecoration(
                  prefixIcon: const Icon(LucideIcons.indianRupee, size: 18, color: AppColors.inkSecondary),
                  labelText: 'Payment Amount',
                  labelStyle: GoogleFonts.jetBrainsMono(fontSize: 10, color: AppColors.inkSecondary, fontWeight: FontWeight.w600),
                  floatingLabelBehavior: FloatingLabelBehavior.always,
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () async {
                  final amt = double.tryParse(amountCtrl.text.trim()) ?? 0;
                  if (amt <= 0) return;
                  try {
                    final supabase = Supabase.instance.client;
                    // Resolve the underlying SALE — that's what the
                    // outstanding + Cash & Bank triggers read. Updating only
                    // the invoice row (old behaviour) never adjusted the
                    // client's outstanding, and did nothing at all for raw
                    // sales without an invoice.
                    final saleId = invoice.saleId ??
                        (invoice.id.startsWith('INV-') ? null : invoice.id);
                    final saleRow = saleId == null
                        ? null
                        : await supabase
                            .from('sales')
                            .select('id, tenant_id, "shopId", "paymentMethod", "totalAmount", "paidAmount"')
                            .eq('id', saleId)
                            .maybeSingle();

                    final method = ((saleRow?['paymentMethod'] as String?) ?? '').toUpperCase();
                    final clientId = saleRow?['shopId'] as String?;

                    if (saleRow != null && method == 'CREDIT' && clientId != null) {
                      // Credit sale with a registered client: record a
                      // client payment — the DB replay allocates it FIFO,
                      // posts Cash & Bank and recomputes outstanding.
                      await supabase.from('client_payments').insert({
                        'id': 'CP-${DateTime.now().millisecondsSinceEpoch}',
                        'tenant_id': saleRow['tenant_id'],
                        'client_id': clientId,
                        'amount': amt,
                        'date': DateTime.now().toIso8601String().substring(0, 10),
                        'payment_method': 'CASH',
                        'recorded_by': supabase.auth.currentUser?.id,
                      });
                    } else if (saleRow != null) {
                      // Cash/UPI sale (or walk-in credit): bump the sale's
                      // paid amount directly — the sale-ledger trigger
                      // reposts Cash & Bank and outstanding recalcs. No
                      // client_payments row (the replay would double-count).
                      final total = ((saleRow['totalAmount'] as num?)?.toDouble() ?? 0);
                      final paid  = ((saleRow['paidAmount'] as num?)?.toDouble() ?? 0);
                      final newPaid = (paid + amt).clamp(0, total);
                      final newStatus = newPaid >= total ? 'PAID' : 'PARTIAL';
                      await supabase.from('sales').update({
                        'paidAmount': newPaid,
                        'paymentStatus': newStatus,
                      }).eq('id', saleId as Object);
                      await supabase.from('invoices').update({
                        'paid_amount': newPaid,
                        'payment_status': newStatus,
                      }).eq('id', 'INV-$saleId');
                    } else {
                      // Legacy invoice with no linked sale — old behaviour.
                      final newPaid = invoice.paidAmount + amt;
                      final newStatus = newPaid >= invoice.grandTotal ? 'PAID' : 'PARTIAL';
                      await supabase.from('invoices').update({
                        'paid_amount': newPaid.clamp(0, invoice.grandTotal),
                        'payment_status': newStatus,
                      }).eq('id', invoice.id);
                    }
                    final newStatus = (invoice.paidAmount + amt) >= invoice.grandTotal ? 'PAID' : 'PARTIAL';
                    if (ctx.mounted) {
                      Navigator.pop(ctx);
                      ref.invalidate(invoicesProvider);
                      ref.invalidate(recentSalesProvider);
                      try { ref.invalidate(clientsProvider); } catch (_) {}
                      if (context.mounted) {
                        Navigator.pop(context); // go back to list
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                                newStatus == 'PAID' ? 'Invoice marked as PAID' : 'Partial payment recorded',
                                style: GoogleFonts.manrope(color: AppColors.inkPrimary)),
                            backgroundColor: AppColors.primaryContainer,
                            behavior: SnackBarBehavior.floating,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        );
                      }
                    }
                  } catch (e) {
                    if (ctx.mounted) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
                      );
                    }
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: const StadiumBorder(),
                  elevation: 0,
                ),
                child: Text('CONFIRM PAYMENT',
                    style: GoogleFonts.jetBrainsMono(fontWeight: FontWeight.w700, fontSize: 13, letterSpacing: 1)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── PDF Builder ─────────────────────────────────────────────────────────────

  // ─── POS Receipt PDF (80mm thermal — standard receipt style) ────────────────
  // Delegates to the shared builder in core/print/pos_receipt_pdf.dart so
  // checkout (add_sale_screen.dart) produces an identical fallback slip.
  Future<Uint8List> _buildPosReceiptPdf(BusinessProfile? biz) async {
    // Pull the account context so the offline slip carries the same
    // "YOU OWE NOW" / advance summary as the web-rendered receipt.
    double? clientOutstanding;
    double? amountReceived;
    bool noGst = false;
    try {
      final supabase = Supabase.instance.client;
      final cid = invoice.clientId;
      if (cid != null && cid.isNotEmpty) {
        final cRow = await supabase
            .from('clients').select('outstanding_balance').eq('id', cid).maybeSingle();
        clientOutstanding = (cRow?['outstanding_balance'] as num?)?.toDouble() ?? 0;
      }
      final saleId = invoice.saleId ?? (invoice.id.startsWith('SAL-') ? invoice.id : null);
      if (saleId != null) {
        final sRow = await supabase
            .from('sales').select('amount_received').eq('id', saleId).maybeSingle();
        amountReceived = (sRow?['amount_received'] as num?)?.toDouble();
      }
      noGst = (biz?.taxMode ?? '').toUpperCase() == 'NONE';
    } catch (e) {
      debugPrint('[print] account context lookup failed: $e'); // slip still prints
    }
    return pos_pdf.buildPosReceiptPdf(
      invoice, biz,
      clientOutstanding: clientOutstanding,
      amountReceived: amountReceived,
      noGst: noGst,
    );
  }

  Future<Uint8List> _buildPdf(BusinessProfile? biz) async {
    // NotoSans for ₹ rupee glyph + general Unicode coverage
    final baseFont = await PdfGoogleFonts.notoSansRegular();
    final boldFont = await PdfGoogleFonts.notoSansBold();
    final theme = pw.ThemeData.withFont(base: baseFont, bold: boldFont);

    final pdf = pw.Document(theme: theme);
    final items = _parseItems(invoice);
    final invoiceNo = invoice.displayNumber;
    final custName = invoice.displayClientName;
    final dateStr = _fmtDate(invoice.invoiceDate);
    final dueStr = invoice.dueDate != null ? _fmtDate(invoice.dueDate) : dateStr;

    // GST math
    final lineSubtotal = items.fold(0.0, (s, i) => s + i.lineTotal);
    final double subtotal = invoice.taxableAmount ?? lineSubtotal;
    final double cgst = invoice.cgstAmount ?? 0.0;
    final double sgst = invoice.sgstAmount ?? 0.0;
    final double igst = invoice.igstAmount ?? 0.0;
    final double grandTotal = invoice.grandTotal > 0 ? invoice.grandTotal : subtotal;
    final isIntraState = igst == 0;
    final terms = biz?.invoiceTerms ?? 'Payment due within 30 days. Goods once sold will not be taken back. Subject to local jurisdiction.';

    // Monochrome palette (matches web)
    const ink = PdfColor.fromInt(0xFF0F172A);
    const subtle = PdfColor.fromInt(0xFF64748B);
    const muted = PdfColor.fromInt(0xFF94A3B8);
    const line = PdfColor.fromInt(0xFFCBD5E1);
    const lightBg = PdfColor.fromInt(0xFFF8FAFC);

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.fromLTRB(28, 28, 28, 28),
        build: (ctx) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.stretch,
          children: [
            // ═══ TAX INVOICE header bar ═══════════════════════════
            pw.Container(
              width: double.infinity,
              decoration: pw.BoxDecoration(
                border: pw.Border.all(color: ink, width: 1),
              ),
              padding: const pw.EdgeInsets.symmetric(vertical: 10),
              child: pw.Column(
                children: [
                  pw.Text('TAX INVOICE',
                      style: pw.TextStyle(
                          fontSize: 16, fontWeight: pw.FontWeight.bold, color: ink, letterSpacing: 1)),
                  pw.SizedBox(height: 2),
                  pw.Text('ORIGINAL FOR RECIPIENT',
                      style: pw.TextStyle(fontSize: 8, color: subtle, letterSpacing: 1)),
                ],
              ),
            ),

            // ═══ Business + Invoice meta row ══════════════════════
            pw.Container(
              decoration: pw.BoxDecoration(
                border: pw.Border(
                  left: pw.BorderSide(color: ink),
                  right: pw.BorderSide(color: ink),
                  bottom: pw.BorderSide(color: ink),
                ),
              ),
              child: pw.Row(
                children: [
                  // Business block
                  pw.Expanded(
                    flex: 3,
                    child: pw.Padding(
                      padding: const pw.EdgeInsets.all(12),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text((biz?.name ?? 'Your Business').toUpperCase(),
                              style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: ink)),
                          if (biz?.address?.isNotEmpty == true) ...[
                            pw.SizedBox(height: 4),
                            pw.Text(biz!.address!,
                                style: const pw.TextStyle(fontSize: 9, color: ink)),
                          ],
                          pw.SizedBox(height: 4),
                          pw.Row(children: [
                            if (biz?.phone?.isNotEmpty == true)
                              pw.Text('Ph: ${biz!.phone!}',
                                  style: const pw.TextStyle(fontSize: 9, color: ink)),
                            if (biz?.phone?.isNotEmpty == true && biz?.email?.isNotEmpty == true)
                              pw.SizedBox(width: 12),
                            if (biz?.email?.isNotEmpty == true)
                              pw.Text('Email: ${biz!.email!}',
                                  style: const pw.TextStyle(fontSize: 9, color: ink)),
                          ]),
                          if (biz?.gstNo?.isNotEmpty == true || biz?.panNo?.isNotEmpty == true) ...[
                            pw.SizedBox(height: 4),
                            pw.Row(children: [
                              if (biz?.gstNo?.isNotEmpty == true)
                                pw.RichText(
                                  text: pw.TextSpan(children: [
                                    pw.TextSpan(text: 'GSTIN: ', style: const pw.TextStyle(fontSize: 9, color: subtle)),
                                    pw.TextSpan(text: biz!.gstNo!,
                                        style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink)),
                                  ]),
                                ),
                              if (biz?.gstNo?.isNotEmpty == true && biz?.panNo?.isNotEmpty == true)
                                pw.SizedBox(width: 16),
                              if (biz?.panNo?.isNotEmpty == true)
                                pw.RichText(
                                  text: pw.TextSpan(children: [
                                    pw.TextSpan(text: 'PAN: ', style: const pw.TextStyle(fontSize: 9, color: subtle)),
                                    pw.TextSpan(text: biz!.panNo!,
                                        style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink)),
                                  ]),
                                ),
                            ]),
                          ],
                        ],
                      ),
                    ),
                  ),
                  // Vertical separator
                  // Invoice meta
                  pw.Expanded(
                    flex: 2,
                    child: pw.Padding(
                      padding: const pw.EdgeInsets.all(12),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          _kvRow('Invoice No', invoiceNo.replaceAll('#', ''), subtle, ink),
                          pw.SizedBox(height: 4),
                          _kvRow('Invoice Date', dateStr, subtle, ink),
                          pw.SizedBox(height: 4),
                          _kvRow('Due Date', dueStr, subtle, ink),
                          pw.SizedBox(height: 4),
                          _kvRow('Supply Type', isIntraState ? 'Intra-State' : 'Inter-State', subtle, ink),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ═══ Bill To / Ship To row ════════════════════════════
            pw.Container(
              decoration: pw.BoxDecoration(
                border: pw.Border(
                  left: pw.BorderSide(color: ink),
                  right: pw.BorderSide(color: ink),
                  bottom: pw.BorderSide(color: ink),
                ),
              ),
              child: pw.Row(
                children: [
                  pw.Expanded(
                    child: pw.Padding(
                      padding: const pw.EdgeInsets.all(12),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text('BILL TO',
                              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: subtle, letterSpacing: 0.5)),
                          pw.SizedBox(height: 6),
                          pw.Text(custName,
                              style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold, color: ink)),
                          pw.SizedBox(height: 3),
                          if (invoice.clientGstin != null && invoice.clientGstin!.isNotEmpty) ...[
                            pw.RichText(
                              text: pw.TextSpan(children: [
                                pw.TextSpan(text: 'GSTIN: ', style: const pw.TextStyle(fontSize: 9, color: subtle)),
                                pw.TextSpan(text: invoice.clientGstin!,
                                    style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink)),
                              ]),
                            ),
                          ] else ...[
                            pw.Text('Unregistered Dealer',
                                style: const pw.TextStyle(fontSize: 9, color: subtle)),
                          ],
                          if (invoice.clientAddress != null && invoice.clientAddress!.isNotEmpty) ...[
                            pw.SizedBox(height: 2),
                            pw.Text(invoice.clientAddress!,
                                style: const pw.TextStyle(fontSize: 9, color: subtle)),
                          ],
                          if (invoice.clientPhone != null && invoice.clientPhone!.isNotEmpty) ...[
                            pw.SizedBox(height: 2),
                            pw.Text('Ph: ${invoice.clientPhone!}',
                                style: const pw.TextStyle(fontSize: 9, color: subtle)),
                          ],
                        ],
                      ),
                    ),
                  ),
                  pw.Expanded(
                    child: pw.Padding(
                      padding: const pw.EdgeInsets.all(12),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text('SHIP TO',
                              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: subtle, letterSpacing: 0.5)),
                          pw.SizedBox(height: 6),
                          pw.Text(custName,
                              style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold, color: ink)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ═══ Items table with GST columns ═════════════════════
            pw.Table(
              columnWidths: const {
                0: pw.FixedColumnWidth(24),    // #
                1: pw.FlexColumnWidth(2.4),    // Description
                2: pw.FixedColumnWidth(50),    // HSN/SAC
                3: pw.FixedColumnWidth(48),    // Qty
                4: pw.FixedColumnWidth(54),    // Rate
                5: pw.FixedColumnWidth(58),    // Taxable
                6: pw.FixedColumnWidth(38),    // GST%
                7: pw.FixedColumnWidth(50),    // CGST
                8: pw.FixedColumnWidth(50),    // SGST
                9: pw.FixedColumnWidth(60),    // Amount
              },
              border: pw.TableBorder.all(color: ink, width: 0.8),
              children: [
                // Header row
                pw.TableRow(
                  decoration: const pw.BoxDecoration(color: lightBg),
                  children: [
                    _th('#', center: true),
                    _th('Description'),
                    _th('HSN/SAC', center: true),
                    _th('Qty', center: true),
                    _th('Rate', right: true),
                    _th('Taxable', right: true),
                    _th('GST%', center: true),
                    _th('CGST', right: true),
                    _th('SGST', right: true),
                    _th('Amount', right: true),
                  ],
                ),
                // Item rows
                ...items.asMap().entries.map((e) {
                  final idx = e.key + 1;
                  final it = e.value;
                  final taxable = it.lineTotal;
                  final taxAmt = it.taxAmount;
                  final cgstPer = taxAmt / 2;
                  final sgstPer = taxAmt / 2;
                  return pw.TableRow(
                    children: [
                      _td('$idx', center: true),
                      _td(it.name),
                      _td(it.sku.isEmpty ? '---' : it.sku, center: true),
                      _td('${it.qty} ${it.unit}', center: true),
                      _td(it.price.toStringAsFixed(2), right: true),
                      _td(taxable.toStringAsFixed(2), right: true),
                      _td('${it.taxRate.toStringAsFixed(0)}%', center: true),
                      _td(cgstPer.toStringAsFixed(2), right: true),
                      _td(sgstPer.toStringAsFixed(2), right: true),
                      _td((taxable + taxAmt).toStringAsFixed(2), right: true, bold: true),
                    ],
                  );
                }),
                // TOTAL row
                pw.TableRow(
                  decoration: const pw.BoxDecoration(color: lightBg),
                  children: [
                    _td('', center: true),
                    _td(''),
                    _td(''),
                    _td(''),
                    _td('TOTAL', right: true, bold: true),
                    _td(subtotal.toStringAsFixed(2), right: true, bold: true),
                    _td(''),
                    _td(cgst.toStringAsFixed(2), right: true, bold: true),
                    _td(sgst.toStringAsFixed(2), right: true, bold: true),
                    _td(grandTotal.toStringAsFixed(2), right: true, bold: true),
                  ],
                ),
              ],
            ),

            // ═══ Amount in words + Totals box ═════════════════════
            pw.Container(
              decoration: pw.BoxDecoration(
                border: pw.Border(
                  left: pw.BorderSide(color: ink),
                  right: pw.BorderSide(color: ink),
                  bottom: pw.BorderSide(color: ink),
                ),
              ),
              child: pw.Row(
                children: [
                  // Left: Words + HSN summary
                  pw.Expanded(
                    flex: 3,
                    child: pw.Padding(
                      padding: const pw.EdgeInsets.all(12),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.RichText(
                            text: pw.TextSpan(children: [
                              pw.TextSpan(text: 'AMOUNT IN WORDS: ',
                                  style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink)),
                              pw.TextSpan(text: _amountInWords(grandTotal),
                                  style: const pw.TextStyle(fontSize: 9, color: ink)),
                            ]),
                          ),
                          if (cgst > 0 || sgst > 0 || igst > 0) ...[
                            pw.SizedBox(height: 12),
                            pw.Text('HSN / TAX SUMMARY',
                                style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink, letterSpacing: 0.5)),
                            pw.SizedBox(height: 4),
                            pw.Table(
                              border: pw.TableBorder.all(color: line, width: 0.5),
                              children: [
                                pw.TableRow(
                                  decoration: const pw.BoxDecoration(color: lightBg),
                                  children: [
                                    _th('HSN', center: true, small: true),
                                    _th('Taxable', center: true, small: true),
                                    _th('Rate', center: true, small: true),
                                    _th('CGST', center: true, small: true),
                                    _th('SGST', center: true, small: true),
                                  ],
                                ),
                                pw.TableRow(children: [
                                  _td('---', center: true, small: true),
                                  _td(subtotal.toStringAsFixed(2), center: true, small: true),
                                  _td(items.isNotEmpty ? '${items.first.taxRate.toStringAsFixed(0)}%' : '0%', center: true, small: true),
                                  _td(cgst.toStringAsFixed(2), center: true, small: true),
                                  _td(sgst.toStringAsFixed(2), center: true, small: true),
                                ]),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  // Right: Subtotal + Grand Total
                  pw.Expanded(
                    flex: 2,
                    child: pw.Padding(
                      padding: const pw.EdgeInsets.all(12),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                        children: [
                          pw.Row(
                            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                            children: [
                              pw.Text('Subtotal', style: const pw.TextStyle(fontSize: 10, color: ink)),
                              pw.Text('Rs.${subtotal.toStringAsFixed(2)}',
                                  style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: ink)),
                            ],
                          ),
                          if (cgst > 0) ...[
                            pw.SizedBox(height: 4),
                            pw.Row(
                              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                              children: [
                                pw.Text('CGST', style: const pw.TextStyle(fontSize: 10, color: subtle)),
                                pw.Text('Rs.${cgst.toStringAsFixed(2)}', style: const pw.TextStyle(fontSize: 10, color: ink)),
                              ],
                            ),
                          ],
                          if (sgst > 0) ...[
                            pw.SizedBox(height: 4),
                            pw.Row(
                              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                              children: [
                                pw.Text('SGST', style: const pw.TextStyle(fontSize: 10, color: subtle)),
                                pw.Text('Rs.${sgst.toStringAsFixed(2)}', style: const pw.TextStyle(fontSize: 10, color: ink)),
                              ],
                            ),
                          ],
                          if (igst > 0) ...[
                            pw.SizedBox(height: 4),
                            pw.Row(
                              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                              children: [
                                pw.Text('IGST', style: const pw.TextStyle(fontSize: 10, color: subtle)),
                                pw.Text('Rs.${igst.toStringAsFixed(2)}', style: const pw.TextStyle(fontSize: 10, color: ink)),
                              ],
                            ),
                          ],
                          pw.SizedBox(height: 8),
                          pw.Container(height: 0.6, color: ink),
                          pw.SizedBox(height: 8),
                          pw.Row(
                            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                            crossAxisAlignment: pw.CrossAxisAlignment.end,
                            children: [
                              pw.Text('GRAND TOTAL',
                                  style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: ink, letterSpacing: 0.5)),
                              pw.Text('Rs.${grandTotal.toStringAsFixed(2)}',
                                  style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold, color: ink)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ═══ Bottom: Bank/UPI + Declaration + Signatory ══════
            pw.Container(
              decoration: pw.BoxDecoration(
                border: pw.Border(
                  left: pw.BorderSide(color: ink),
                  right: pw.BorderSide(color: ink),
                  bottom: pw.BorderSide(color: ink),
                ),
              ),
              child: pw.Row(
                children: [
                  // Bank/UPI + Terms
                  pw.Expanded(
                    flex: 3,
                    child: pw.Padding(
                      padding: const pw.EdgeInsets.all(12),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text('BANK / UPI',
                              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink, letterSpacing: 0.5)),
                          pw.SizedBox(height: 6),
                          if (biz?.upiId?.isNotEmpty == true)
                            _bankRow('UPI', biz!.upiId!, subtle, ink),
                          _bankRow('Bank', 'N/A', subtle, ink),
                          _bankRow('A/C', 'N/A', subtle, ink),
                          _bankRow('IFSC', 'N/A', subtle, ink),
                          pw.SizedBox(height: 14),
                          pw.Text('TERMS & CONDITIONS',
                              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink, letterSpacing: 0.5)),
                          pw.SizedBox(height: 4),
                          pw.Text('1. $terms',
                              style: const pw.TextStyle(fontSize: 8.5, color: ink, lineSpacing: 1.5)),
                        ],
                      ),
                    ),
                  ),
                  // Declaration + Signature
                  pw.Expanded(
                    flex: 2,
                    child: pw.Padding(
                      padding: const pw.EdgeInsets.all(12),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                        children: [
                          pw.Text('DECLARATION',
                              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink, letterSpacing: 0.5)),
                          pw.SizedBox(height: 4),
                          pw.Text(
                              'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
                              style: const pw.TextStyle(fontSize: 8.5, color: ink, lineSpacing: 1.4)),
                          pw.SizedBox(height: 16),
                          pw.Align(
                            alignment: pw.Alignment.centerRight,
                            child: pw.Text('For ${(biz?.name ?? 'Your Business').toUpperCase()}',
                                style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink)),
                          ),
                          pw.SizedBox(height: 28),
                          pw.Align(
                            alignment: pw.Alignment.centerRight,
                            child: pw.Container(width: 140, height: 0.6, color: ink),
                          ),
                          pw.SizedBox(height: 3),
                          pw.Align(
                            alignment: pw.Alignment.centerRight,
                            child: pw.Text('Authorised Signatory',
                                style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            pw.SizedBox(height: 14),
            pw.Center(
              child: pw.Text('Document generated by LedgrPro',
                  style: const pw.TextStyle(fontSize: 7, color: muted)),
            ),
          ],
        ),
      ),
    );

    return pdf.save();
  }

  // ─── PDF helpers ────────────────────────────────────────────────────────────
  static pw.Widget _kvRow(String k, String v, PdfColor kc, PdfColor vc) =>
      pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(k, style: pw.TextStyle(fontSize: 9, color: kc)),
          pw.Text(v, style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: vc)),
        ],
      );

  static pw.Widget _th(String text, {bool center = false, bool right = false, bool small = false}) {
    pw.TextAlign align = pw.TextAlign.left;
    if (center) align = pw.TextAlign.center;
    if (right) align = pw.TextAlign.right;
    return pw.Padding(
      padding: pw.EdgeInsets.symmetric(horizontal: 4, vertical: small ? 4 : 6),
      child: pw.Text(text,
          textAlign: align,
          style: pw.TextStyle(
              fontSize: small ? 8 : 9,
              fontWeight: pw.FontWeight.bold,
              color: const PdfColor.fromInt(0xFF0F172A))),
    );
  }

  static pw.Widget _td(String text,
      {bool center = false, bool right = false, bool bold = false, bool small = false}) {
    pw.TextAlign align = pw.TextAlign.left;
    if (center) align = pw.TextAlign.center;
    if (right) align = pw.TextAlign.right;
    return pw.Padding(
      padding: pw.EdgeInsets.symmetric(horizontal: 4, vertical: small ? 4 : 6),
      child: pw.Text(text,
          textAlign: align,
          style: pw.TextStyle(
              fontSize: small ? 8 : 9,
              fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
              color: const PdfColor.fromInt(0xFF0F172A))),
    );
  }

  static pw.Widget _bankRow(String k, String v, PdfColor kc, PdfColor vc) => pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 3),
        child: pw.RichText(
          text: pw.TextSpan(children: [
            pw.TextSpan(text: '$k: ', style: pw.TextStyle(fontSize: 9, color: kc)),
            pw.TextSpan(text: v,
                style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: vc)),
          ]),
        ),
      );

  // Indian-format amount-in-words
  static String _amountInWords(double n) {
    final i = n.floor();
    final p = ((n - i) * 100).round();
    if (i == 0 && p == 0) return 'Zero Rupees Only';
    final main = _intToWords(i);
    final paise = p > 0 ? ' and ${_intToWords(p)} Paise' : '';
    return 'Rupees $main$paise Only';
  }

  static String _intToWords(int n) {
    if (n == 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    String twoDigits(int x) {
      if (x < 20) return ones[x];
      final t = x ~/ 10;
      final o = x % 10;
      return o == 0 ? tens[t] : '${tens[t]} ${ones[o]}';
    }

    String threeDigits(int x) {
      final h = x ~/ 100;
      final r = x % 100;
      String s = '';
      if (h > 0) s = '${ones[h]} Hundred';
      if (r > 0) s = s.isEmpty ? twoDigits(r) : '$s ${twoDigits(r)}';
      return s;
    }

    final crore = n ~/ 10000000;
    final lakh = (n % 10000000) ~/ 100000;
    final thousand = (n % 100000) ~/ 1000;
    final rest = n % 1000;

    final parts = <String>[];
    if (crore > 0) parts.add('${threeDigits(crore)} Crore');
    if (lakh > 0) parts.add('${threeDigits(lakh)} Lakh');
    if (thousand > 0) parts.add('${threeDigits(thousand)} Thousand');
    if (rest > 0) parts.add(threeDigits(rest));
    return parts.join(' ');
  }

}

// ─── Flutter Invoice Card (simple on-screen view) ────────────────────────────

class _InvoiceCard extends StatelessWidget {
  final Invoice invoice;
  final BusinessProfile? profile;
  // The client's TOTAL across all their bills, so this bill's balance is not
  // mistaken for the whole account. 0 when unknown or walk-in.
  final double clientOutstanding;
  const _InvoiceCard({required this.invoice, required this.profile, this.clientOutstanding = 0});

  @override
  Widget build(BuildContext context) {
    final biz = profile;
    final isPaid = invoice.paymentStatus == 'PAID';
    final isPartial = invoice.paymentStatus == 'PARTIAL';
    final items = _parseItems(invoice);
    final double grandTotal = invoice.grandTotal;
    final invoiceNo = invoice.displayNumber;
    final custName = invoice.displayClientName;
    final dateStr = _fmtDate(invoice.invoiceDate);
    final paymentMethod = invoice.paymentMethod ?? 'CASH';

    Color badgeColor;
    Color badgeBg;
    String badgeLabel;
    if (isPaid) {
      badgeColor = const Color(0xFF15803d);
      badgeBg = const Color(0xFFf0fdf4);
      badgeLabel = 'PAID';
    } else if (isPartial) {
      badgeColor = const Color(0xFFD97706);
      badgeBg = const Color(0xFFFFFBEB);
      badgeLabel = 'PARTIAL';
    } else {
      badgeColor = const Color(0xFFEA580C);
      badgeBg = const Color(0xFFFFF7ED);
      badgeLabel = 'UNPAID';
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 20,
              offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Top accent bar ───────────────────────────────────────────
          Container(
            height: 4,
            decoration: const BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Invoice header ───────────────────────────────────────
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          biz?.name ?? 'Your Business',
                          style: GoogleFonts.manrope(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: const Color(0xFF0F172A),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          invoiceNo,
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 11,
                            color: const Color(0xFF94A3B8),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          dateStr,
                          style: GoogleFonts.manrope(
                            fontSize: 12,
                            color: const Color(0xFF64748B),
                          ),
                        ),
                        // Only worth showing when it differs from the bill
                        // date. On a same-day sale it repeats the line above
                        // and reads as a second "Due" next to the balance.
                        if (invoice.dueDate != null && !isPaid &&
                            invoice.dueDate != invoice.invoiceDate)
                          Text(
                            'Payment due ${_fmtDate(invoice.dueDate)}',
                            style: GoogleFonts.manrope(fontSize: 11, color: const Color(0xFF64748B)),
                          ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: badgeBg,
                        borderRadius: BorderRadius.circular(99),
                        border: Border.all(
                          color: badgeColor,
                          width: 0.8,
                        ),
                      ),
                      child: Text(
                        badgeLabel,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: badgeColor,
                        ),
                      ),
                    ),
                  ],
                ),

                if (invoice.paidAmount > 0 && !isPaid) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Paid ₹${invoice.paidAmount.toStringAsFixed(0)} · Balance ₹${invoice.outstanding.toStringAsFixed(0)}',
                    style: GoogleFonts.manrope(fontSize: 11, fontWeight: FontWeight.w600, color: const Color(0xFFD97706)),
                  ),
                ],

                const SizedBox(height: 16),

                // ── Customer + payment ───────────────────────────────────
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Bill To',
                                style: GoogleFonts.manrope(
                                    fontSize: 10,
                                    color: const Color(0xFF94A3B8))),
                            const SizedBox(height: 2),
                            Text(custName,
                                style: GoogleFonts.manrope(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: const Color(0xFF0F172A))),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('Payment',
                              style: GoogleFonts.manrope(
                                  fontSize: 10,
                                  color: const Color(0xFF94A3B8))),
                          const SizedBox(height: 2),
                          Text(paymentMethod,
                              style: GoogleFonts.manrope(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: const Color(0xFF0F172A))),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),
                const Divider(color: Color(0xFFE2E8F0)),
                const SizedBox(height: 8),

                // ── Items ────────────────────────────────────────────────
                if (items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text('No item details',
                        style: GoogleFonts.manrope(
                            fontSize: 13,
                            color: const Color(0xFF94A3B8))),
                  )
                else
                  ...items.asMap().entries.map((e) {
                    final idx = e.key;
                    final item = e.value;
                    return Padding(
                      padding: EdgeInsets.only(
                          top: idx == 0 ? 0 : 10, bottom: 10),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(item.name,
                                    style: GoogleFonts.manrope(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        color: const Color(0xFF0F172A))),
                                const SizedBox(height: 2),
                                Text(
                                  '${item.qty} × ₹${_fmtAmount(item.price)}',
                                  style: GoogleFonts.manrope(
                                      fontSize: 11,
                                      color: const Color(0xFF64748B)),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            '₹${_fmtAmount(item.lineTotal)}',
                            style: GoogleFonts.manrope(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: const Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                    );
                  }),

                const Divider(color: Color(0xFFE2E8F0)),
                const SizedBox(height: 10),

                // ── Tax breakdown ─────────────────────────────────────────
                Builder(builder: (_) {
                  final lineSubtotal = items.fold(0.0, (s, i) => s + i.lineTotal);
                  final taxable = invoice.taxableAmount ?? lineSubtotal;
                  final cgst   = invoice.cgstAmount ?? 0.0;
                  final sgst   = invoice.sgstAmount ?? 0.0;
                  final igst   = invoice.igstAmount ?? 0.0;
                  final totalTax = cgst + sgst + igst;
                  final hasTax = totalTax > 0;
                  final isIntra = igst == 0 && hasTax;

                  if (!hasTax) return const SizedBox.shrink();

                  return Column(
                    children: [
                      _TaxRow(label: 'Taxable Amount', value: taxable),
                      if (isIntra) ...[
                        _TaxRow(label: 'CGST', value: cgst),
                        _TaxRow(label: 'SGST', value: sgst),
                      ] else
                        _TaxRow(label: 'IGST', value: igst),
                      const SizedBox(height: 6),
                    ],
                  );
                }),

                // ── Grand total ──────────────────────────────────────────
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Total',
                        style: GoogleFonts.manrope(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: const Color(0xFF0F172A))),
                    Text(
                      '₹${_fmtAmount(grandTotal)}',
                      style: GoogleFonts.manrope(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),

                // Payment breakdown. Only rendered when there is something to
                // say: paidAmount is capped at the bill, so a customer who
                // handed over more leaves no trace without amountReceived.
                // That value is null on historical sales and on phones older
                // than v1.5.73, and showing paidAmount relabelled as
                // "received" would assert a tender nobody captured.
                if (invoice.paidAmount > 0) ...[
                  const SizedBox(height: 8),
                  const Divider(height: 1),
                  const SizedBox(height: 8),
                  _TaxRow(label: 'Paid on this bill', value: invoice.paidAmount),
                  if (invoice.amountReceived != null && invoice.amountReceived! > 0) ...[
                    _TaxRow(label: 'Amount received', value: invoice.amountReceived!),
                    if (invoice.amountReceived! - grandTotal > 0.5)
                      _TaxRow(
                        label: 'Excess received',
                        value: invoice.amountReceived! - grandTotal,
                      ),
                  ],
                  if (invoice.outstanding > 0.5)
                    _TaxRow(label: 'Balance due (this bill)', value: invoice.outstanding),
                ],
                // Account total, shown only when it differs from this bill —
                // "Outstanding" alone read as everything the client owes.
                if (invoice.outstanding > 0.5 &&
                    clientOutstanding > 0.5 &&
                    (clientOutstanding - invoice.outstanding).abs() > 0.5) ...[
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          '${invoice.displayClientName} — total outstanding',
                          style: GoogleFonts.manrope(
                              fontSize: 11, color: AppColors.inkTertiary),
                        ),
                      ),
                      Text(
                        '₹${_fmtAmount(clientOutstanding)}',
                        style: GoogleFonts.manrope(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: AppColors.warning),
                      ),
                    ],
                  ),
                ],

                const SizedBox(height: 4),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── IRN status card ──────────────────────────────────────────────────────────
class _IrnStatusCard extends StatelessWidget {
  final Invoice invoice;
  final VoidCallback onGenerate;
  const _IrnStatusCard({required this.invoice, required this.onGenerate});

  @override
  Widget build(BuildContext context) {
    final status = invoice.irnStatus ?? 'NONE';

    Color bg, fg;
    String headline;
    IconData icon;

    switch (status) {
      case 'SUCCESS':
        bg = const Color(0xFFECFDF5); fg = const Color(0xFF047857);
        headline = 'Generated · ${invoice.irn?.substring(0, invoice.irn!.length.clamp(0, 16)) ?? ''}…';
        icon = LucideIcons.checkCircle2;
        break;
      case 'PENDING':
        bg = const Color(0xFFFFFBEB); fg = const Color(0xFFB45309);
        headline = 'Queued for NIC';
        icon = LucideIcons.clock;
        break;
      case 'PROCESSING':
        bg = const Color(0xFFFFFBEB); fg = const Color(0xFFB45309);
        headline = 'Worker processing…';
        icon = LucideIcons.loader;
        break;
      case 'FAILED':
        bg = const Color(0xFFFEF2F2); fg = const Color(0xFFB91C1C);
        headline = 'Failed — retry available';
        icon = LucideIcons.alertCircle;
        break;
      default:
        bg = const Color(0xFFF8FAFC); fg = const Color(0xFF475569);
        headline = 'Not generated';
        icon = LucideIcons.fileText;
    }

    final canRetry = status == 'NONE' || status == 'FAILED' || status == 'NOT_APPLICABLE';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: fg.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: fg),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('E-INVOICE IRN',
                        style: GoogleFonts.jetBrainsMono(
                            fontSize: 9, fontWeight: FontWeight.w700,
                            color: fg.withValues(alpha: 0.7), letterSpacing: 1.5)),
                    const SizedBox(height: 2),
                    Text(headline,
                        style: GoogleFonts.manrope(
                            fontSize: 13, fontWeight: FontWeight.w700, color: fg),
                        overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              if (canRetry)
                TextButton.icon(
                  onPressed: onGenerate,
                  icon: const Icon(LucideIcons.send, size: 13),
                  label: Text(status == 'FAILED' ? 'Retry' : 'Generate',
                      style: GoogleFonts.manrope(
                          fontSize: 12, fontWeight: FontWeight.w700)),
                  style: TextButton.styleFrom(
                    foregroundColor: fg,
                    backgroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    shape: const StadiumBorder(),
                  ),
                ),
            ],
          ),
          if (invoice.ackNo != null) ...[
            const SizedBox(height: 6),
            Text('Ack: ${invoice.ackNo} · ${invoice.ackDate ?? ''}',
                style: GoogleFonts.jetBrainsMono(
                    fontSize: 10, color: fg.withValues(alpha: 0.7))),
          ],
        ],
      ),
    );
  }
}

// ─── Convert Sale → GST Invoice form sheet ────────────────────────────────────
class _ConvertSheet extends ConsumerStatefulWidget {
  final Invoice invoice;
  const _ConvertSheet({required this.invoice});

  @override
  ConsumerState<_ConvertSheet> createState() => _ConvertSheetState();
}

class _ConvertSheetState extends ConsumerState<_ConvertSheet> {
  late final TextEditingController _name;
  late final TextEditingController _gstin;
  late final TextEditingController _address;
  late final TextEditingController _phone;
  late final TextEditingController _placeOfSupply;
  late final TextEditingController _dueDays;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Pre-fill from the linked client when available — sales with shopId
    // shouldn't re-ask for GSTIN if the client already has one on file.
    final inv = widget.invoice;
    final clientId = inv.clientId;
    final clients = ref.read(clientsProvider).valueOrNull ?? const [];
    final linked = (clientId == null || clientId.isEmpty)
        ? null
        : clients.where((c) => c.id == clientId).cast<dynamic>().firstOrNull;

    String pick(String? a, String? b) => (a != null && a.isNotEmpty) ? a : (b ?? '');

    _name = TextEditingController(text: pick(inv.clientName, linked?.name));
    _gstin = TextEditingController(text: pick(inv.clientGstin, linked?.gstin ?? linked?.gstNo));
    _address = TextEditingController(text: pick(inv.clientAddress, linked?.address));
    _phone = TextEditingController(text: pick(inv.clientPhone, linked?.phone));
    _placeOfSupply = TextEditingController(text: pick(inv.placeOfSupply, linked?.state));
    _dueDays = TextEditingController(
        text: linked?.creditDays?.toString() ?? '30');
  }

  @override
  void dispose() {
    _name.dispose();
    _gstin.dispose();
    _address.dispose();
    _phone.dispose();
    _placeOfSupply.dispose();
    _dueDays.dispose();
    super.dispose();
  }

  // GSTIN basic shape: 15 chars, [2-digit state] + 10-char PAN + 1 + Z + 1 alnum.
  static final _gstinRe = RegExp(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$');

  void _submit() {
    final name  = _name.text.trim();
    final gstin = _gstin.text.trim().toUpperCase();
    if (name.isEmpty) {
      setState(() => _error = 'Client name required');
      return;
    }
    if (gstin.isEmpty) {
      setState(() => _error = 'GSTIN required for tax invoice');
      return;
    }
    if (!_gstinRe.hasMatch(gstin)) {
      setState(() => _error = 'GSTIN format invalid (15 chars, e.g. 29AAACR5055K1Z5)');
      return;
    }
    Navigator.pop(context, {
      'name':          name,
      'gstin':         gstin,
      'address':       _address.text.trim(),
      'phone':         _phone.text.trim(),
      'placeOfSupply': _placeOfSupply.text.trim(),
      'dueDays':       _dueDays.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(
                  color: AppColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Issue GST Invoice',
                style: GoogleFonts.manrope(
                    fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.inkPrimary)),
            Text('TAX INVOICE — REQUIRES GSTIN',
                style: GoogleFonts.jetBrainsMono(
                    fontSize: 10, fontWeight: FontWeight.w600,
                    color: AppColors.inkTertiary, letterSpacing: 1.2)),
            const SizedBox(height: 18),

            _Field(label: 'Client Name *', ctrl: _name),
            const SizedBox(height: 10),
            _Field(label: 'GSTIN *', ctrl: _gstin, mono: true, hint: '29AAACR5055K1Z5'),
            const SizedBox(height: 10),
            _Field(label: 'Billing Address', ctrl: _address, maxLines: 2),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _Field(label: 'Phone', ctrl: _phone, keyboardType: TextInputType.phone)),
              const SizedBox(width: 10),
              Expanded(child: _Field(label: 'Place of Supply', ctrl: _placeOfSupply, hint: 'KL / TN / GST state code')),
            ]),
            const SizedBox(height: 10),
            _Field(label: 'Due in (days)', ctrl: _dueDays, keyboardType: TextInputType.number),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
                ),
                child: Row(children: [
                  const Icon(LucideIcons.alertCircle, size: 14, color: AppColors.danger),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_error!,
                      style: GoogleFonts.manrope(fontSize: 12, color: AppColors.danger, fontWeight: FontWeight.w600))),
                ]),
              ),
            ],

            const SizedBox(height: 18),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: const StadiumBorder(),
                    side: BorderSide(color: Colors.black.withValues(alpha: 0.1)),
                  ),
                  child: Text('Cancel',
                      style: GoogleFonts.manrope(
                          fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.inkSecondary)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton.icon(
                  onPressed: _submit,
                  icon: const Icon(LucideIcons.fileText, size: 16),
                  label: Text('Issue Invoice',
                      style: GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w700)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryContainer,
                    foregroundColor: AppColors.inkPrimary,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: const StadiumBorder(),
                  ),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final TextEditingController ctrl;
  final String? hint;
  final int maxLines;
  final bool mono;
  final TextInputType? keyboardType;
  const _Field({
    required this.label,
    required this.ctrl,
    this.hint,
    this.maxLines = 1,
    this.mono = false,
    this.keyboardType,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 6),
          child: Text(label,
              style: GoogleFonts.jetBrainsMono(
                  fontSize: 10, fontWeight: FontWeight.w700,
                  color: AppColors.inkTertiary, letterSpacing: 1)),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
          ),
          child: TextField(
            controller: ctrl,
            maxLines: maxLines,
            keyboardType: keyboardType,
            style: (mono
                    ? GoogleFonts.jetBrainsMono(fontSize: 13, fontWeight: FontWeight.w700)
                    : GoogleFonts.manrope(fontSize: 14, fontWeight: FontWeight.w500))
                .copyWith(color: AppColors.inkPrimary),
            decoration: InputDecoration(
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              hintText: hint,
              hintStyle: GoogleFonts.manrope(
                  color: AppColors.inkTertiary.withValues(alpha: 0.6), fontSize: 13),
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Tax breakdown row ────────────────────────────────────────────────────────
class _TaxRow extends StatelessWidget {
  final String label;
  final double value;
  const _TaxRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: GoogleFonts.manrope(
                  fontSize: 12, color: const Color(0xFF64748B))),
          Text('₹${value.toStringAsFixed(2)}',
              style: GoogleFonts.manrope(
                  fontSize: 12, color: const Color(0xFF64748B))),
        ],
      ),
    );
  }
}
