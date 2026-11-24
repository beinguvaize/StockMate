import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'package:mobile_app/widgets/motion/save_button.dart';
import 'package:mobile_app/widgets/motion/slide_to_confirm.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/dashboard/presentation/widgets/dash_common.dart';
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

  // Laid out to the approved boards "Invoice detail" (sales-13), "Sale
  // receipt detail" (sales-24, sales-26) and "Invoice detail: paid" (sales-25).
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(businessProfileProvider);
    final profile = profileAsync.asData?.value;
    final isInvoice = invoice.id.startsWith('INV-');
    final isSale = invoice.id.startsWith('SAL-');
    final isPaid = invoice.paymentStatus == 'PAID';
    final hasItems = invoice.items != null && invoice.items!.isNotEmpty;
    final linked = invoice.linkedInvoiceIdFromSale;
    final hasLinked = linked != null && linked.isNotEmpty;
    final bottomInset = MediaQuery.of(context).padding.bottom;
    final hasDock = hasItems || !isPaid;

    final clientOutstanding = () {
      final cid = invoice.clientId;
      if (cid == null || cid.isEmpty) return 0.0;
      final cs = ref.read(clientsProvider).valueOrNull ?? const [];
      for (final c in cs) {
        if (c.id == cid) return c.outstandingBalance ?? 0.0;
      }
      return 0.0;
    }();

    void recordPayment() {
      // Failed / pending UPI sales re-open the QR sheet so the cashier can
      // ask the customer to retry and confirm receipt; on success
      // unvoid_sale re-decrements stock and marks the row PAID. Everything
      // else goes to the payment sheet.
      final pm = (invoice.paymentMethod ?? '').toUpperCase();
      final ps = invoice.paymentStatus.toUpperCase();
      final isUpiFailed =
          pm == 'UPI' && (ps == 'VOIDED' || ps == 'FAILED' || ps == 'PENDING');
      if (isUpiFailed) {
        _retryUpiPayment(context, ref, invoice);
      } else {
        _showPaymentSheet(context, ref);
      }
    }

    return Scaffold(
      backgroundColor: DashColors.card,
      body: Stack(
        children: [
          SafeArea(
            bottom: false,
            child: Column(
              children: [
                // ── Top bar ───────────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                  child: Row(
                    children: [
                      _RoundButton(
                        icon: LucideIcons.chevronLeft,
                        label: 'Back',
                        onTap: () => Navigator.pop(context),
                      ),
                      Expanded(
                        child: Text(invoice.displayNumber,
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: DashText.tight(17, w: FontWeight.w600)),
                      ),
                      // A GST invoice shares and prints the invoice PDF; a
                      // sale shares and prints its receipt.
                      _RoundButton(
                        icon: LucideIcons.share,
                        label: isInvoice ? 'Share invoice' : 'Share receipt',
                        onTap: () => isInvoice
                            ? _share(context, profile)
                            : _sharePosReceipt(context, profile),
                      ),
                      _RoundButton(
                        icon: LucideIcons.printer,
                        label: isInvoice ? 'Print invoice' : 'Print receipt',
                        onTap: () => isInvoice
                            ? _print(context, profile)
                            : _printPosReceipt(context, profile),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: EdgeInsets.only(
                        bottom: (hasDock ? 96 : 24) + bottomInset),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _InvoiceBody(
                          invoice: invoice,
                          profile: profile,
                          clientOutstanding: clientOutstanding,
                        ),

                        // E-invoice IRN: real invoices only.
                        if (isInvoice)
                          _IrnRow(
                            invoice: invoice,
                            onGenerate: () => _enqueueIrn(context, ref),
                          ),

                        // A GST invoice can still print the small receipt.
                        if (isInvoice)
                          _LinkRow(
                            title: 'Thermal receipt',
                            subtitle: 'Print or share the small receipt',
                            onTap: () => _receiptChoices(context, profile),
                          ),

                        // Sale → GST invoice. Any sale can be converted; the
                        // cashier gives the client and GSTIN at that point.
                        if (isSale)
                          _LinkRow(
                            title: 'GST invoice',
                            subtitle: hasLinked
                                ? 'Issued · $linked'
                                : 'Not issued. Tap to issue one',
                            subtitleColor:
                                hasLinked ? const Color(0xFF17663A) : null,
                            onTap: hasLinked
                                ? null
                                : () => _convertToInvoice(context, ref),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Dock ──────────────────────────────────────────────────
          if (hasDock)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: EdgeInsets.fromLTRB(16, 10, 16, 18 + bottomInset),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0x00FFFFFF), Color(0xFFFFFFFF)],
                    stops: [0, 0.35],
                  ),
                ),
                child: Row(
                  children: [
                    if (hasItems)
                      Expanded(
                        child: _DockButton(
                          label: 'Process return',
                          soft: true,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  SalesReturnFormScreen(invoice: invoice),
                            ),
                          ),
                        ),
                      ),
                    if (hasItems && !isPaid) const SizedBox(width: 8),
                    if (!isPaid)
                      Expanded(
                        child: _DockButton(
                          label: 'Record payment',
                          onTap: recordPayment,
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Print or share the thermal receipt of a GST invoice.
  void _receiptChoices(BuildContext context, BusinessProfile? profile) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      elevation: 0,
      builder: (ctx) => Container(
        margin: EdgeInsets.fromLTRB(
            8, 0, 8, 8 + MediaQuery.of(ctx).padding.bottom),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: DashColors.card,
          borderRadius: BorderRadius.circular(30),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Thermal receipt', style: DashText.tight(17)),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _DockButton(
                    label: 'Print',
                    soft: true,
                    onTap: () {
                      Navigator.pop(ctx);
                      _printPosReceipt(context, profile);
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _DockButton(
                    label: 'Share',
                    soft: true,
                    onTap: () {
                      Navigator.pop(ctx);
                      _sharePosReceipt(context, profile);
                    },
                  ),
                ),
              ],
            ),
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
      // Floating sheet: the card draws itself.
      backgroundColor: Colors.transparent,
      elevation: 0,
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
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      // Floating sheet: the card draws itself.
      backgroundColor: Colors.transparent,
      elevation: 0,
      builder: (ctx) => _RecordPaymentSheet(
        invoice: invoice,
        onDone: (fullyPaid, queued) {
          if (ctx.mounted) Navigator.pop(ctx);
          ref.invalidate(invoicesProvider);
          ref.invalidate(recentSalesProvider);
          try { ref.invalidate(clientsProvider); } catch (_) {}
          if (context.mounted) {
            Navigator.pop(context); // back to the list
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(queued
                    ? 'Payment saved on this phone. It is sent when the internet is back'
                    : fullyPaid
                        ? 'Bill marked as paid'
                        : 'Part payment recorded'),
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        },
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
      taxMode: biz?.taxMode,
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
              child: pw.Text('Document generated by bookledger',
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

/// Round grey icon button in the top bar. 44px hit area.
class _RoundButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _RoundButton(
      {required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(
                  color: Color(0xFFF1F1F1), shape: BoxShape.circle),
              child: Icon(icon, size: 18, color: DashColors.ink),
            ),
          ),
        ),
      ),
    );
  }
}

/// Pill button in the bottom dock: amber, or grey when [soft].
class _DockButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool soft;
  const _DockButton(
      {required this.label, required this.onTap, this.soft = false});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        height: 52,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: soft ? const Color(0xFFEFEEEC) : DashColors.amber,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: DashText.tight(15,
                w: FontWeight.w600,
                c: soft ? DashColors.ink : Colors.white)),
      ),
    );
  }
}

/// Grey rounded row with a title, one line under it and a chevron.
class _LinkRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final Color? subtitleColor;
  final VoidCallback? onTap;
  const _LinkRow({
    required this.title,
    required this.subtitle,
    this.subtitleColor,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF7F7F6),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: DashText.tight(13.5, w: FontWeight.w600, ls: 0)),
                  const SizedBox(height: 1),
                  Text(subtitle,
                      style: DashText.inter(12,
                          w: FontWeight.w400,
                          c: subtitleColor ?? const Color(0xFF7A8088))),
                ],
              ),
            ),
            if (onTap != null)
              const Icon(LucideIcons.chevronRight,
                  size: 16, color: Color(0xFFB8BCC2)),
          ],
        ),
      ),
    );
  }
}

/// E-invoice IRN state. Tapping it asks for the IRN when there is none yet or
/// the last try failed.
class _IrnRow extends StatelessWidget {
  final Invoice invoice;
  final VoidCallback onGenerate;
  const _IrnRow({required this.invoice, required this.onGenerate});

  @override
  Widget build(BuildContext context) {
    final status = invoice.irnStatus ?? 'NONE';
    final canRetry =
        status == 'NONE' || status == 'FAILED' || status == 'NOT_APPLICABLE';
    final (String text, Color? color) = switch (status) {
      'SUCCESS' => (
          'Generated · ${invoice.irn?.substring(0, invoice.irn!.length.clamp(0, 16)) ?? ''}',
          const Color(0xFF17663A)
        ),
      'PENDING' => ('Queued for NIC', const Color(0xFF8A5A00)),
      'PROCESSING' => ('Being processed', const Color(0xFF8A5A00)),
      'FAILED' => ('Failed. Tap to try again', const Color(0xFFB91C1C)),
      _ => ('Not generated', null),
    };
    final ack = invoice.ackNo != null
        ? ' · Ack ${invoice.ackNo} ${invoice.ackDate ?? ''}'.trimRight()
        : '';
    return _LinkRow(
      title: 'E-invoice IRN',
      subtitle: '$text$ack',
      subtitleColor: color,
      onTap: canRetry ? onGenerate : null,
    );
  }
}

/// Everything above the action rows: amount, how much is paid, who it is
/// billed to, the items and the tax lines.
class _InvoiceBody extends StatelessWidget {
  final Invoice invoice;
  final BusinessProfile? profile;
  // The client's TOTAL across all their bills, so this bill's balance is not
  // mistaken for the whole account. 0 when unknown or walk-in.
  final double clientOutstanding;
  const _InvoiceBody(
      {required this.invoice, required this.profile, this.clientOutstanding = 0});

  static const _line = Color(0xFFF0EFED);
  static const _grey = Color(0xFF6E737A);

  Widget _row(String label, String value,
      {bool strong = false, Color? valueColor, bool last = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 7),
      decoration: BoxDecoration(
        border: last ? null : const Border(bottom: BorderSide(color: _line)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: DashText.inter(13.5,
                    w: strong ? FontWeight.w600 : FontWeight.w500,
                    c: strong ? DashColors.ink : _grey)),
          ),
          const SizedBox(width: 8),
          Text(value,
              style: DashText.tight(14,
                  w: strong ? FontWeight.w700 : FontWeight.w600,
                  c: valueColor ?? DashColors.ink,
                  ls: 0)),
        ],
      ),
    );
  }

  static String _money(double v) => '₹${_fmtAmount(v)}';

  @override
  Widget build(BuildContext context) {
    final isPaid = invoice.paymentStatus == 'PAID';
    final isPartial = invoice.paymentStatus == 'PARTIAL';
    final items = _parseItems(invoice);
    final grandTotal = invoice.grandTotal;
    final bizName = profile?.name ?? '';
    final kind = invoice.isSaleSource ? 'Sale receipt' : 'Tax invoice';
    final fraction =
        grandTotal > 0 ? (invoice.paidAmount / grandTotal).clamp(0.0, 1.0) : 0.0;

    final (String pill, Color pillInk, Color pillFill) = isPaid
        ? ('Paid', const Color(0xFF17663A), const Color(0xFFE3F5EA))
        : isPartial
            ? ('Part paid', const Color(0xFF8A5A00), const Color(0xFFFFF1C9))
            : ('Unpaid', const Color(0xFFB91C1C), const Color(0xFFFDE2E2));

    final lineSubtotal = items.fold(0.0, (s, i) => s + i.lineTotal);
    final taxable = invoice.taxableAmount ?? lineSubtotal;
    final cgst = invoice.cgstAmount ?? 0.0;
    final sgst = invoice.sgstAmount ?? 0.0;
    final igst = invoice.igstAmount ?? 0.0;
    final hasTax = cgst + sgst + igst > 0;
    final isIntra = igst == 0 && hasTax;

    final received = invoice.amountReceived;
    // Account total, shown only when it differs from this bill: "Outstanding"
    // alone read as everything the client owes.
    final showAccount = invoice.outstanding > 0.5 &&
        clientOutstanding > 0.5 &&
        (clientOutstanding - invoice.outstanding).abs() > 0.5;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Amount ──────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      bizName.isEmpty ? kind : '$kind · $bizName',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: DashText.inter(13, c: _grey),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                        color: pillFill,
                        borderRadius: BorderRadius.circular(999)),
                    child: Text(pill,
                        style: DashText.tight(11,
                            w: FontWeight.w600, c: pillInk, ls: 0)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(_money(grandTotal),
                  style: DashText.tight(36, ls: -0.04, h: 1.05)),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: fraction,
                  minHeight: 6,
                  backgroundColor: const Color(0xFFEFEEEC),
                  valueColor:
                      const AlwaysStoppedAnimation(Color(0xFF1E9E5A)),
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Paid ${_money(invoice.paidAmount)} · balance ${_money(invoice.outstanding)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: DashText.inter(12, c: _grey),
                    ),
                  ),
                  if (invoice.dueDate != null && !isPaid)
                    Text('Due ${_fmtDate(invoice.dueDate)}',
                        style: DashText.inter(12, c: _grey))
                  else
                    Text(_fmtDate(invoice.invoiceDate),
                        style: DashText.inter(12, c: _grey)),
                ],
              ),
            ],
          ),
        ),

        // ── Bill to · Payment ───────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              Expanded(
                  child: _tile('Bill to', invoice.displayClientName)),
              const SizedBox(width: 8),
              Expanded(
                  child: _tile('Payment',
                      _methodWord(invoice.paymentMethod ?? 'CASH'))),
            ],
          ),
        ),

        // ── Items ───────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('ITEMS', style: _eyebrowStyle),
              Text('${items.length}', style: _eyebrowStyle),
            ],
          ),
        ),
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 8),
            child: Text('No item details', style: DashText.inter(13)),
          )
        else
          for (final item in items)
            Container(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 8),
              decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: _line))),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item.name,
                            style: DashText.tight(14, w: FontWeight.w600)),
                        const SizedBox(height: 1),
                        Text('${item.qty} × ${_money(item.price)}',
                            style: DashText.inter(12,
                                w: FontWeight.w400,
                                c: const Color(0xFF7A8088))),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(_money(item.lineTotal),
                      style: DashText.tight(14, w: FontWeight.w600)),
                ],
              ),
            ),

        // ── Tax and totals ──────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
          child: Column(
            children: [
              if (hasTax) ...[
                _row('Taxable amount', _money(taxable)),
                if (isIntra) ...[
                  _row('CGST', _money(cgst)),
                  _row('SGST', _money(sgst)),
                ] else
                  _row('IGST', _money(igst)),
              ],
              _row('Total', _money(grandTotal), strong: true),
              if (invoice.paidAmount > 0) ...[
                _row('Paid on this bill', _money(invoice.paidAmount)),
                if (received != null && received > 0) ...[
                  _row('Amount received', _money(received)),
                  // Only a CREDIT sale is knowable: it collects nothing at
                  // the till, so anything over the bill went against older
                  // dues. Otherwise the surplus may have been handed back as
                  // change. Mirrors surplusLabel() in
                  // src/pages/sales/lib/checkoutMoney.js: change both.
                  if (received - grandTotal > 0.5)
                    _row(
                      (invoice.paymentMethod ?? '').toUpperCase() == 'CREDIT'
                          ? 'Credited to account'
                          : 'Paid over this bill',
                      _money(received - grandTotal),
                    ),
                ],
                if (invoice.outstanding > 0.5)
                  _row('Balance due (this bill)', _money(invoice.outstanding)),
              ],
              if (showAccount)
                _row('${invoice.displayClientName} owes in total',
                    _money(clientOutstanding),
                    valueColor: const Color(0xFFB91C1C), last: true),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tile(String label, String value) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: const Color(0xFFF7F7F6),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: DashText.inter(11.5, c: const Color(0xFF7A8088))),
            const SizedBox(height: 2),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: DashText.tight(14, w: FontWeight.w600, ls: 0)),
          ],
        ),
      );
}

final _eyebrowStyle = DashText.tight(11,
    w: FontWeight.w600, c: const Color(0xFF8A9099), ls: 0.07);

/// CASH -> Cash, CREDIT_SALE -> Credit. Anything else is shown as stored.
String _methodWord(String m) => switch (m.toUpperCase()) {
      'CASH' => 'Cash',
      'UPI' => 'UPI',
      'BANK' => 'Bank',
      'CARD' => 'Card',
      'CREDIT' || 'CREDIT_SALE' => 'Credit',
      _ => m,
    };

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

  // Laid out to the approved board "Issue GST Invoice" (sales-15).
  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return Container(
      margin: EdgeInsets.fromLTRB(
          8, 0, 8, 8 + mq.viewInsets.bottom + mq.padding.bottom),
      constraints: BoxConstraints(
          maxHeight: mq.size.height -
              mq.padding.top -
              mq.viewInsets.bottom -
              mq.padding.bottom -
              24),
      decoration: BoxDecoration(
        color: DashColors.card,
        borderRadius: BorderRadius.circular(30),
      ),
      clipBehavior: Clip.antiAlias,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Issue GST invoice', style: DashText.tight(19, ls: -0.02)),
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF6DD),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text("A tax invoice needs the client's GSTIN.",
                  style: DashText.inter(12.5, c: const Color(0xFF8A5A00))),
            ),
            _Field(label: 'Client name *', ctrl: _name),
            _Field(label: 'GSTIN *', ctrl: _gstin, hint: '29AAACR5055K1Z5'),
            _Field(label: 'Billing address', ctrl: _address, maxLines: 2),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                    child: _Field(
                        label: 'Phone',
                        ctrl: _phone,
                        keyboardType: TextInputType.phone)),
                const SizedBox(width: 8),
                SizedBox(
                  width: 112,
                  child: _Field(
                      label: 'Due in (days)',
                      ctrl: _dueDays,
                      keyboardType: TextInputType.number),
                ),
              ],
            ),
            _Field(
                label: 'Place of supply',
                ctrl: _placeOfSupply,
                hint: 'KL / TN / GST state code'),
            if (_error != null)
              Container(
                margin: const EdgeInsets.only(top: 10),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(_error!,
                    style: DashText.inter(12.5,
                        w: FontWeight.w600, c: const Color(0xFFB91C1C))),
              ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _DockButton(
                      label: 'Cancel',
                      soft: true,
                      onTap: () => Navigator.pop(context)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _DockButton(label: 'Issue invoice', onTap: _submit),
                ),
              ],
            ),
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
  final TextInputType? keyboardType;
  const _Field({
    required this.label,
    required this.ctrl,
    this.hint,
    this.maxLines = 1,
    this.keyboardType,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: DashText.tight(12.5,
                  w: FontWeight.w600, c: const Color(0xFF30343A), ls: 0)),
          const SizedBox(height: 5),
          Container(
            constraints: const BoxConstraints(minHeight: 46),
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.symmetric(horizontal: 13),
            decoration: BoxDecoration(
              color: const Color(0xFFF4F4F3),
              borderRadius: BorderRadius.circular(13),
            ),
            child: TextField(
              controller: ctrl,
              maxLines: maxLines,
              minLines: 1,
              keyboardType: keyboardType,
              style: DashText.tight(14.5, w: FontWeight.w600, ls: 0),
              cursorColor: DashColors.amber,
              decoration: InputDecoration(
                isCollapsed: true,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                contentPadding: const EdgeInsets.symmetric(vertical: 13),
                hintText: hint,
                hintStyle: DashText.tight(14.5,
                    w: FontWeight.w500, c: const Color(0xFF8A9099), ls: 0),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Tax breakdown row ────────────────────────────────────────────────────────

/// Record a payment against one bill. Laid out to the approved board
/// "Record Payment" (sales-14).
///
/// Where the money goes is decided by the server, not here:
///  * a credit sale to a registered client is settled through
///    `settle_client_payment`, which allocates it, posts it to the chosen
///    method's account and recalculates what the client owes;
///  * any other sale is settled through `settle_sale_payment`, which raises
///    its paid amount; the sale-ledger trigger posts what just arrived under
///    the chosen method, dated today;
///  * an old invoice with no sale behind it has no ledger to post to, so the
///    method cannot be recorded there and the choice is locked.
class _RecordPaymentSheet extends ConsumerStatefulWidget {
  final Invoice invoice;
  /// Called after a successful save with whether the bill is now fully paid.
  final void Function(bool fullyPaid, bool queued) onDone;
  const _RecordPaymentSheet({required this.invoice, required this.onDone});

  @override
  ConsumerState<_RecordPaymentSheet> createState() =>
      _RecordPaymentSheetState();
}

class _RecordPaymentSheetState extends ConsumerState<_RecordPaymentSheet> {
  late final TextEditingController _amount;
  final _amountFocus = FocusNode();
  Map<String, dynamic>? _sale;
  bool _loaded = false;
  String _method = 'CASH';
  SaveStatus _status = SaveStatus.idle;
  String? _error;

  Invoice get inv => widget.invoice;
  double get _due => inv.outstanding;
  double get _amt => double.tryParse(_amount.text.trim()) ?? 0;

  String? get _saleId =>
      inv.saleId ?? (inv.id.startsWith('INV-') ? null : inv.id);

  /// The sale's own method, upper-cased ('' when unknown).
  String get _saleMethod =>
      ((_sale?['paymentMethod'] as String?) ?? inv.paymentMethod ?? '')
          .toUpperCase();

  String? get _clientId => (_sale?['shopId'] as String?) ?? inv.clientId;

  /// A credit sale to a registered client: settled as a client payment.
  bool get _viaClient =>
      _saleMethod.startsWith('CREDIT') && (_clientId ?? '').isNotEmpty;

  /// The method can be recorded whenever there is a sale behind the bill.
  bool get _canChoose => _viaClient || _sale != null;

  @override
  void initState() {
    super.initState();
    _amount = TextEditingController(text: _due.toStringAsFixed(2));
    _amount.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _amount.dispose();
    _amountFocus.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final id = _saleId;
    if (id != null) {
      try {
        _sale = await Supabase.instance.client
            .from('sales')
            .select(
                'id, tenant_id, "shopId", "paymentMethod", "totalAmount", "paidAmount"')
            .eq('id', id)
            .maybeSingle()
            .timeout(const Duration(seconds: 8));
      } catch (e) {
        debugPrint('[recordPayment] sale lookup failed: $e');
      }
    }
    if (!mounted) return;
    setState(() {
      _loaded = true;
      if (!_viaClient) {
        final m = _saleMethod;
        _method = (m == 'UPI' || m == 'BANK') ? m : 'CASH';
      }
    });
  }

  Future<void> _save() async {
    final amt = _amt;
    if (amt <= 0 || _status != SaveStatus.idle) return;
    setState(() {
      _status = SaveStatus.saving;
      _error = null;
    });
    var queued = false;
    try {
      final supabase = Supabase.instance.client;
      final saleId = _saleId;
      if (_viaClient) {
        // One settled path, the same one Cash Collection uses. Routed
        // through the offline queue so a dropped connection queues the
        // payment instead of losing it.
        final ctx = await ref.read(tenantContextProvider.future);
        final tenantId = (_sale?['tenant_id'] as String?) ?? ctx?.tenantId;
        if (tenantId == null) throw 'Shop not known. Sign in again.';
        queued = await ref.read(syncServiceProvider).rpcOnlineOrQueue(
          'settle_client_payment',
          {
            'p_id': 'CP-${DateTime.now().millisecondsSinceEpoch}',
            'p_tenant_id': tenantId,
            'p_client_id': _clientId,
            'p_amount': amt,
            'p_date': DateTime.now().toIso8601String().substring(0, 10),
            'p_method': _method,
            'p_recorded_by': supabase.auth.currentUser?.id,
          },
        );
      } else if (_sale != null && saleId != null) {
        // Cash/UPI/bank sale (or walk-in credit): the server raises the paid
        // amount and posts what just arrived under the chosen method. Online
        // only: this call has no replay guard, so queuing it could apply a
        // part payment twice.
        final today = DateTime.now();
        await supabase.rpc('settle_sale_payment', params: {
          'p_sale_id': saleId,
          'p_amount': amt,
          'p_tenant_id': _sale!['tenant_id'],
          'p_method': _method,
          'p_date':
              '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}',
        }).timeout(const Duration(seconds: 15));
      } else {
        // Invoice with no linked sale: update the invoice itself.
        final newPaid = inv.paidAmount + amt;
        await supabase.from('invoices').update({
          'paid_amount': newPaid.clamp(0, inv.grandTotal),
          'payment_status': newPaid >= inv.grandTotal ? 'PAID' : 'PARTIAL',
        }).eq('id', inv.id);
      }
      if (!mounted) return;
      setState(() => _status = SaveStatus.saved);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (!mounted) return;
      widget.onDone((inv.paidAmount + amt) >= inv.grandTotal, queued);
    } catch (e) {
      debugPrint('[recordPayment] failed: $e');
      if (!mounted) return;
      // A dropped connection may still have saved it: say so, do not claim
      // it was lost.
      setState(() {
        _status = SaveStatus.error;
        _error = 'Could not confirm. Check the bill before trying again';
      });
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e'), backgroundColor: AppColors.danger));
      await Future<void>.delayed(const Duration(milliseconds: 2200));
      if (mounted) setState(() => _status = SaveStatus.idle);
    }
  }

  Widget _chip(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        height: 30,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: active ? DashColors.ink : DashColors.card,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
              color: active ? DashColors.ink : const Color(0xFFE1E0DE)),
        ),
        // widthFactor keeps the pill as wide as its words; an aligned
        // container would stretch across the sheet.
        child: Center(
          widthFactor: 1,
          child: Text(label,
              style: DashText.tight(12.5,
                  w: FontWeight.w600,
                  c: active ? Colors.white : const Color(0xFF30343A),
                  ls: 0)),
        ),
      ),
    );
  }

  Widget _methodTile(String key, String word, IconData icon) {
    final on = _method == key;
    final locked = !_canChoose && !on;
    return Expanded(
      child: Opacity(
        opacity: locked ? 0.35 : 1,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _canChoose ? () => setState(() => _method = key) : null,
          child: Column(
            children: [
              Container(
                height: 52,
                decoration: BoxDecoration(
                  color: on ? const Color(0xFFF09935) : const Color(0xFFF4F4F3),
                  borderRadius: BorderRadius.circular(16),
                ),
                alignment: Alignment.center,
                child: Icon(icon,
                    size: 20,
                    color: on ? Colors.white : const Color(0xFF30343A)),
              ),
              const SizedBox(height: 6),
              Text(word,
                  style: DashText.tight(12,
                      w: FontWeight.w600,
                      c: on ? DashColors.ink : const Color(0xFF6E737A),
                      ls: 0)),
            ],
          ),
        ),
      ),
    );
  }

  static String _initials(String name) {
    final w =
        name.trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
    if (w.isEmpty) return '?';
    if (w.length == 1) return w.first.characters.take(2).toString().toUpperCase();
    return (w[0].characters.first + w[1].characters.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final amt = _amt;
    final after = (_due - amt) < 0 ? 0.0 : (_due - amt);
    final half = (_due / 2 * 100).round() / 100;
    final isFull = (amt - _due).abs() < 0.005;
    final isHalf = !isFull && (amt - half).abs() < 0.005;
    String money(double v) => '₹${_fmtAmount(v)}';
    const grey = Color(0xFF7A8088);

    return Container(
      margin: EdgeInsets.fromLTRB(
          8, 0, 8, 8 + mq.viewInsets.bottom + mq.padding.bottom),
      constraints: BoxConstraints(
          maxHeight: mq.size.height -
              mq.padding.top -
              mq.viewInsets.bottom -
              mq.padding.bottom -
              24),
      decoration: BoxDecoration(
        color: DashColors.card,
        borderRadius: BorderRadius.circular(30),
      ),
      clipBehavior: Clip.antiAlias,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                      color: Color(0xFFFFF3D6), shape: BoxShape.circle),
                  child: Text(_initials(inv.displayClientName),
                      style: DashText.tight(13,
                          c: const Color(0xFF30343A), ls: 0)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Record payment',
                          style: DashText.tight(18, ls: -0.02)),
                      const SizedBox(height: 1),
                      Text('${inv.displayClientName} · ${inv.displayNumber}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: DashText.inter(12.5,
                              w: FontWeight.w400, c: grey)),
                    ],
                  ),
                ),
              ],
            ),

            // ── Amount ────────────────────────────────────────────
            const SizedBox(height: 14),
            Text('Amount received',
                textAlign: TextAlign.center,
                style: DashText.inter(12.5, c: grey)),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text('₹',
                    style: DashText.tight(40,
                        w: FontWeight.w600,
                        c: const Color(0xFFB8BCC2),
                        ls: -0.04,
                        h: 1.1)),
                IntrinsicWidth(
                  child: TextField(
                    controller: _amount,
                    focusNode: _amountFocus,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d*\.?\d{0,2}')),
                    ],
                    textAlign: TextAlign.center,
                    style: DashText.tight(40, ls: -0.04, h: 1.1),
                    cursorColor: DashColors.amber,
                    decoration: const InputDecoration(
                      isCollapsed: true,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      filled: false,
                      contentPadding: EdgeInsets.zero,
                      constraints: BoxConstraints(minWidth: 40),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 6,
              runSpacing: 6,
              children: [
                _chip('Full ${money(_due)}', isFull,
                    () => _amount.text = _due.toStringAsFixed(2)),
                _chip('Half ${money(half)}', isHalf,
                    () => _amount.text = half.toStringAsFixed(2)),
                _chip('Other', !isFull && !isHalf, () {
                  _amountFocus.requestFocus();
                  _amount.selection = TextSelection(
                      baseOffset: 0, extentOffset: _amount.text.length);
                }),
              ],
            ),

            // ── Method ────────────────────────────────────────────
            const SizedBox(height: 16),
            Row(
              children: [
                _methodTile('CASH', 'Cash', LucideIcons.banknote),
                const SizedBox(width: 8),
                _methodTile('UPI', 'UPI', LucideIcons.smartphone),
                const SizedBox(width: 8),
                _methodTile('BANK', 'Bank', LucideIcons.landmark),
              ],
            ),
            if (_loaded && !_canChoose) ...[
              const SizedBox(height: 8),
              Text(
                'This old invoice has no sale behind it, so how it was paid '
                'cannot be recorded here.',
                textAlign: TextAlign.center,
                style: DashText.inter(12, c: grey).copyWith(height: 1.4),
              ),
            ],

            // ── Before and after ──────────────────────────────────
            Container(
              margin: const EdgeInsets.only(top: 14),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: const Color(0xFFF7F7F6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  _line('Balance due now', money(_due)),
                  _line('Still due after this', money(after),
                      color: after <= 0.005 ? const Color(0xFF17663A) : null),
                ],
              ),
            ),

            const SizedBox(height: 16),
            SlideToConfirm(
              label: amt > 0 ? 'Slide to record ${money(amt)}' : 'Enter an amount',
              semanticsLabel: 'Record payment',
              enabled: _loaded && amt > 0,
              status: _status,
              errorText: _error,
              onComplete: _save,
            ),
          ],
        ),
      ),
    );
  }

  Widget _line(String label, String value, {Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          children: [
            Expanded(
                child: Text(label,
                    style:
                        DashText.inter(13.5, c: const Color(0xFF6E737A)))),
            Text(value,
                style: DashText.tight(14,
                    w: FontWeight.w600, c: color ?? DashColors.ink, ls: 0)),
          ],
        ),
      );
}
