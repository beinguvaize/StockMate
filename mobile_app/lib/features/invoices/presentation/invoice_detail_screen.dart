import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/features/sales/presentation/sales_view.dart' show methodLabel;
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  double _clientOutstanding(WidgetRef ref) {
    final cid = invoice.clientId;
    if (cid == null || cid.isEmpty) return 0.0;
    final cs = ref.read(clientsProvider).valueOrNull ?? const [];
    for (final c in cs) {
      if (c.id == cid) return c.outstandingBalance ?? 0.0;
    }
    return 0.0;
  }

  void _onRecordPayment(BuildContext context, WidgetRef ref) {
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

  static const _shareIcon = '<path d="M12 15V4M8 8l4-4 4 4M5 14v5h14v-5"/>';
  static const _printIcon =
      '<path d="M7 9V4h10v5M7 17H5v-6h14v6h-2M8 14h8v6H8z"/>';

  Widget _kv(String k, String v,
          {bool strong = false, Color? valueColor, bool divider = true}) =>
      Container(
        padding: const EdgeInsets.symmetric(vertical: 7),
        decoration: divider
            ? const BoxDecoration(
                border: Border(bottom: BorderSide(color: Bl.sep)))
            : null,
        child: Row(
          children: [
            Expanded(
              child: Text(k,
                  style: Bl.inter(13.5,
                      w: strong ? FontWeight.w600 : FontWeight.w500,
                      c: strong ? Bl.ink : Bl.body)),
            ),
            Text(v,
                style: Bl.tight(14,
                    w: strong ? FontWeight.w700 : FontWeight.w600,
                    c: valueColor ?? Bl.ink)),
          ],
        ),
      );

  Widget _linkRow(String title, String sub,
          {VoidCallback? onTap, String? action}) =>
      BlTap(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
              color: Bl.tile, borderRadius: BorderRadius.circular(14)),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Bl.tight(13.5, w: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text(sub,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(12, c: const Color(0xFF7A8088))),
                  ],
                ),
              ),
              if (action != null)
                Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Text(action,
                      style:
                          Bl.tight(13, w: FontWeight.w600, c: Bl.amberDeep)),
                ),
              if (onTap != null)
                const Padding(
                  padding: EdgeInsets.only(left: 6),
                  child: BlIcon(BlIcons.chevronRight,
                      size: 16, color: Color(0xFFB8BCC2)),
                ),
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(businessProfileProvider).asData?.value;
    final isInv = invoice.id.startsWith('INV-');
    final isSale = invoice.id.startsWith('SAL-');
    final isPaid = invoice.paymentStatus == 'PAID';
    final isPartial = invoice.paymentStatus == 'PARTIAL';
    final items = _parseItems(invoice);
    final total = invoice.grandTotal;
    final paid = invoice.paidAmount.clamp(0, total).toDouble();
    final clientOwes = _clientOutstanding(ref);
    final linked = invoice.linkedInvoiceIdFromSale;
    final hasLinked = linked != null && linked.isNotEmpty;

    final (String badge, Color badgeFg, Color badgeBg) = isPaid
        ? ('Paid', const Color(0xFF17663A), const Color(0xFFE3F5EA))
        : isPartial
            ? ('Partial', const Color(0xFF8A5A00), const Color(0xFFFFF1C9))
            : ('Unpaid', Bl.redDeep, const Color(0xFFFDE2E2));

    final cgst = invoice.cgstAmount ?? 0.0;
    final sgst = invoice.sgstAmount ?? 0.0;
    final igst = invoice.igstAmount ?? 0.0;
    final hasTax = cgst + sgst + igst > 0;
    final taxable = invoice.taxableAmount ??
        items.fold<double>(0.0, (s, i) => s + i.lineTotal);
    final received = invoice.amountReceived ?? 0;
    final over = received - total;

    final irnStatus = invoice.irnStatus ?? 'NONE';
    final irnLine = switch (irnStatus) {
      'SUCCESS' =>
        'Generated · ${invoice.irn?.substring(0, invoice.irn!.length.clamp(0, 16)) ?? ''}…',
      'PENDING' => 'Queued for NIC',
      'PROCESSING' => 'Worker processing…',
      'FAILED' => 'Failed. Retry available',
      _ => 'Not generated',
    };
    final irnCanRun = irnStatus == 'NONE' ||
        irnStatus == 'FAILED' ||
        irnStatus == 'NOT_APPLICABLE';

    final canReturn = invoice.items != null && invoice.items!.isNotEmpty;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              title: invoice.displayNumber,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  BlRoundButton(_shareIcon,
                      label: isInv ? 'Share invoice' : 'Share receipt',
                      onTap: () => isInv
                          ? _share(context, profile)
                          : _sharePosReceipt(context, profile)),
                  BlRoundButton(_printIcon,
                      label: isInv ? 'Print invoice' : 'Print receipt',
                      onTap: () => isInv
                          ? _print(context, profile)
                          : _printPosReceipt(context, profile)),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: BlEntrance.all([
                    // ── Total, how much is paid, when it is due ──────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                    '${isInv ? 'Tax invoice' : invoice.docKind} · ${profile?.name ?? 'Your business'}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.inter(13, w: FontWeight.w500)),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                    color: badgeBg,
                                    borderRadius: BorderRadius.circular(999)),
                                child: Text(badge,
                                    style: Bl.tight(11,
                                        w: FontWeight.w600, ls: 0, c: badgeFg)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text('₹${_fmtAmount(total)}',
                              style: Bl.tight(36,
                                  w: FontWeight.w700, ls: -0.04, h: 1.05)),
                          const SizedBox(height: 12),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(3),
                            child: LinearProgressIndicator(
                              value: total <= 0 ? 0 : paid / total,
                              minHeight: 6,
                              backgroundColor: const Color(0xFFEFEEEC),
                              color: const Color(0xFF1E9E5A),
                              semanticsLabel: 'Paid so far',
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                    'Paid ₹${_fmtAmount(paid)} · balance ₹${_fmtAmount(invoice.outstanding)}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Bl.inter(12, w: FontWeight.w500)),
                              ),
                              Text(
                                  invoice.dueDate != null && !isPaid
                                      ? 'Due ${_fmtDate(invoice.dueDate)}'
                                      : _fmtDate(invoice.invoiceDate),
                                  style: Bl.inter(12, w: FontWeight.w500)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Row(
                        children: [
                          for (final (label, value) in [
                            ('Bill to', invoice.displayClientName),
                            (
                              'Payment',
                              methodLabel(invoice.paymentMethod ?? 'CASH')
                            ),
                          ]) ...[
                            if (label == 'Payment') const SizedBox(width: 8),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 9),
                                decoration: BoxDecoration(
                                    color: Bl.tile,
                                    borderRadius: BorderRadius.circular(12)),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(label,
                                        style: Bl.inter(11.5,
                                            w: FontWeight.w500,
                                            c: const Color(0xFF7A8088))),
                                    const SizedBox(height: 2),
                                    Text(value,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: Bl.tight(14,
                                            w: FontWeight.w600)),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),

                    // ── Items ────────────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
                      child: Row(
                        children: [
                          Expanded(child: Text('ITEMS', style: Bl.eyebrow)),
                          Text('${items.length}', style: Bl.eyebrow),
                        ],
                      ),
                    ),
                    if (items.isEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 8, 18, 8),
                        child: Text('No item details',
                            style: Bl.inter(13, c: Bl.mute)),
                      )
                    else
                      Column(
                        children: [
                          for (final item in items)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 18, vertical: 8),
                              decoration: const BoxDecoration(
                                  border: Border(
                                      bottom: BorderSide(color: Bl.sep))),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(item.name,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: Bl.tight(14,
                                                w: FontWeight.w600)),
                                        const SizedBox(height: 1),
                                        Text(
                                            '${_qtyText(item.qty)} × ₹${_fmtAmount(item.price)}',
                                            style: Bl.inter(12,
                                                c: const Color(0xFF7A8088))),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Text('₹${_fmtAmount(item.lineTotal)}',
                                      style: Bl.tight(14,
                                          w: FontWeight.w600)),
                                ],
                              ),
                            ),
                        ],
                      ),

                    // ── Tax and totals ───────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
                      child: Column(
                        children: [
                          if (hasTax) ...[
                            _kv('Taxable amount', '₹${_fmtAmount(taxable)}'),
                            if (igst == 0) ...[
                              _kv('CGST', '₹${_fmtAmount(cgst)}'),
                              _kv('SGST', '₹${_fmtAmount(sgst)}'),
                            ] else
                              _kv('IGST', '₹${_fmtAmount(igst)}'),
                          ],
                          _kv('Total', '₹${_fmtAmount(total)}', strong: true),
                          if (invoice.paidAmount > 0) ...[
                            _kv('Paid on this bill',
                                '₹${_fmtAmount(invoice.paidAmount)}'),
                            if (received > 0) ...[
                              _kv('Amount received',
                                  '₹${_fmtAmount(received)}'),
                              if (over > 0.5)
                                _kv(
                                    (invoice.paymentMethod ?? '')
                                                .toUpperCase() ==
                                            'CREDIT'
                                        ? 'Credited to account'
                                        : 'Paid over this bill',
                                    '₹${_fmtAmount(over)}'),
                            ],
                            if (invoice.outstanding > 0.5)
                              _kv('Balance due (this bill)',
                                  '₹${_fmtAmount(invoice.outstanding)}'),
                          ],
                          if (clientOwes > 0.5)
                            _kv(
                                '${invoice.displayClientName} owes in total',
                                '₹${_fmtAmount(clientOwes)}',
                                valueColor: Bl.redDeep,
                                divider: false),
                        ],
                      ),
                    ),

                    // ── Other things you can do with this bill ───────────
                    if (isInv)
                      _linkRow(
                        'E-invoice IRN',
                        invoice.ackNo != null
                            ? '$irnLine\nAck: ${invoice.ackNo} · ${invoice.ackDate ?? ''}'
                            : irnLine,
                        onTap:
                            irnCanRun ? () => _enqueueIrn(context, ref) : null,
                        action: irnCanRun
                            ? (irnStatus == 'FAILED' ? 'Retry' : 'Generate')
                            : null,
                      ),
                    if (isSale && !hasLinked)
                      _linkRow('GST invoice',
                          'Issue a tax invoice for this sale',
                          onTap: () => _convertToInvoice(context, ref)),
                    if (isSale && hasLinked)
                      _linkRow('GST invoice', 'Issued · $linked'),
                    if (isInv)
                      _linkRow('Counter receipt', 'Print the small receipt',
                          onTap: () => _printPosReceipt(context, profile)),
                    if (isInv)
                      _linkRow('Share receipt', 'Send the small receipt',
                          onTap: () => _sharePosReceipt(context, profile)),
                  ]),
                ),
              ),
            ),
            if (canReturn || !isPaid)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
                child: Row(
                  children: [
                    if (canReturn)
                      Expanded(
                        child: BlButton('Process return',
                            kind: BlButtonKind.soft,
                            onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => SalesReturnFormScreen(
                                        invoice: invoice),
                                  ),
                                )),
                      ),
                    if (canReturn && !isPaid) const SizedBox(width: 8),
                    if (!isPaid)
                      Expanded(
                        child: BlButton('Record payment',
                            onTap: () => _onRecordPayment(context, ref)),
                      ),
                  ],
                ),
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
    final result = await showBlSheet<Map<String, String?>?>(
      context: context,
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

  /// Writes one payment against this bill. Throws with the real reason when
  /// the server refuses it.
  Future<void> _writePayment(double amt, String method) async {
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
        'payment_method': method,
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
  }

  void _showPaymentSheet(BuildContext context, WidgetRef ref) {
    showBlSheet(
      context: context,
      builder: (ctx) => _PaymentSheet(
        invoice: invoice,
        onRecord: (amt, method) async {
          await _writePayment(amt, method);
          final paidInFull = (invoice.paidAmount + amt) >= invoice.grandTotal;
          if (!ctx.mounted) return;
          Navigator.pop(ctx);
          ref.invalidate(invoicesProvider);
          ref.invalidate(recentSalesProvider);
          try { ref.invalidate(clientsProvider); } catch (_) {}
          if (context.mounted) {
            Navigator.pop(context); // go back to list
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(
                  paidInFull ? 'Invoice marked as paid' : 'Part payment recorded'),
              behavior: SnackBarBehavior.floating,
            ));
          }
        },
      ),
    );
  }

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
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Issue GST invoice',
            style: Bl.tight(19, w: FontWeight.w700, ls: -0.02)),
        Container(
          margin: const EdgeInsets.only(top: 10),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
              color: const Color(0xFFFFF6DD),
              borderRadius: BorderRadius.circular(12)),
          child: Text("A tax invoice needs the client's GSTIN.",
              style: Bl.inter(12.5,
                  w: FontWeight.w500, c: const Color(0xFF8A5A00))),
        ),
        _Field(label: 'Client name *', ctrl: _name),
        _Field(
            label: 'GSTIN *',
            ctrl: _gstin,
            hint: '29AAACR5055K1Z5',
            caps: true),
        _Field(label: 'Billing address', ctrl: _address),
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
                    keyboardType: TextInputType.number)),
          ],
        ),
        _Field(
            label: 'Place of supply',
            ctrl: _placeOfSupply,
            hint: 'KL / TN / GST state code'),
        if (_error != null)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
                color: Bl.redSoft, borderRadius: BorderRadius.circular(12)),
            child: Text(_error!,
                style: Bl.inter(12.5, w: FontWeight.w500, c: Bl.redDeep)),
          ),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: BlButton('Cancel',
                kind: BlButtonKind.soft,
                onTap: () => Navigator.pop(context)),
          ),
          const SizedBox(width: 8),
          Expanded(child: BlButton('Issue invoice', onTap: _submit)),
        ]),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final TextEditingController ctrl;
  final String? hint;
  final bool caps;
  final TextInputType? keyboardType;

  const _Field({
    required this.label,
    required this.ctrl,
    this.hint,
    this.caps = false,
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
              style: Bl.tight(12.5, w: FontWeight.w600, ls: 0, c: Bl.ink3)),
          const SizedBox(height: 5),
          Container(
            height: 46,
            padding: const EdgeInsets.symmetric(horizontal: 13),
            alignment: Alignment.centerLeft,
            decoration: BoxDecoration(
                color: Bl.wellSoft, borderRadius: BorderRadius.circular(13)),
            child: TextField(
              controller: ctrl,
              keyboardType: keyboardType,
              textCapitalization: caps
                  ? TextCapitalization.characters
                  : TextCapitalization.none,
              cursorColor: Bl.brand,
              style: Bl.tight(14.5, w: FontWeight.w600, ls: 0),
              decoration: InputDecoration(
                isCollapsed: true,
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                hintText: hint,
                hintStyle: Bl.tight(14.5,
                    w: FontWeight.w500, ls: 0, c: const Color(0xFFA8ADB4)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Record payment" (canvas): amount, quick amounts, how it was paid, what is
/// left after, and slide to record.
class _PaymentSheet extends StatefulWidget {
  final Invoice invoice;
  final Future<void> Function(double amount, String method) onRecord;
  const _PaymentSheet({required this.invoice, required this.onRecord});

  @override
  State<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<_PaymentSheet> {
  late final double _due = widget.invoice.outstanding;
  late final _ctrl = TextEditingController(text: _plain(_due));
  final _focus = FocusNode();
  String _method = 'CASH';
  int _quick = 0; // 0 full, 1 half, 2 other
  String? _error;

  static String _plain(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

  double get _amount => double.tryParse(_ctrl.text.trim()) ?? 0;

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _setQuick(int i) {
    setState(() {
      _quick = i;
      if (i == 0) _ctrl.text = _plain(_due);
      if (i == 1) _ctrl.text = _plain((_due * 50).roundToDouble() / 100);
    });
    if (i == 2) {
      _focus.requestFocus();
      _ctrl.selection =
          TextSelection(baseOffset: 0, extentOffset: _ctrl.text.length);
    }
  }

  Future<void> _record() async {
    final amt = _amount;
    if (amt <= 0) {
      setState(() => _error = 'Enter the amount received.');
      return;
    }
    setState(() => _error = null);
    try {
      await widget.onRecord(amt, _method);
    } catch (e) {
      debugPrint('[invoice] record payment failed: $e');
      if (mounted) {
        setState(() => _error =
            'May not have saved. Check this bill before trying again. ($e)');
      }
    }
  }

  static const _methods = [
    ('CASH', 'Cash', BlIcons.cash),
    (
      'UPI',
      'UPI',
      '<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M10 17h4"/>'
    ),
    ('BANK', 'Bank', BlIcons.bank),
  ];

  @override
  Widget build(BuildContext context) {
    final inv = widget.invoice;
    final name = inv.displayClientName;
    final after = (_due - _amount).clamp(0, double.infinity).toDouble();
    final initials = BlPartyAvatar.initials(name);

    Widget quick(int i, String label) {
      final on = _quick == i;
      return Semantics(
        button: true,
        selected: on,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: () => _setQuick(i),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Container(
              height: 30,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: on ? Bl.ink : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
                border:
                    Border.all(color: on ? Bl.ink : const Color(0xFFE1E0DE)),
              ),
              child: Text(label,
                  style: Bl.tight(12.5,
                      w: FontWeight.w600, ls: 0, c: on ? Bl.white : Bl.ink3)),
            ),
          ),
        ),
      );
    }

    Widget line(String k, String v, {Color? c}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            children: [
              Expanded(
                  child: Text(k,
                      style: Bl.inter(13.5, w: FontWeight.w500))),
              Text(v, style: Bl.tight(14, w: FontWeight.w600, c: c ?? Bl.ink)),
            ],
          ),
        );

    return Column(
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
              child: initials.isEmpty
                  ? const BlIcon(BlIcons.person, size: 18, color: Bl.ink3)
                  : Text(initials,
                      style:
                          Bl.tight(13, w: FontWeight.w700, ls: 0, c: Bl.ink3)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Record payment',
                      style: Bl.tight(18, w: FontWeight.w700, ls: -0.02)),
                  const SizedBox(height: 1),
                  Text('$name · ${inv.displayNumber}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.inter(12.5, c: const Color(0xFF7A8088))),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Text('Amount received',
            textAlign: TextAlign.center,
            style: Bl.inter(12.5,
                w: FontWeight.w500, c: const Color(0xFF7A8088))),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('₹',
                style: Bl.tight(40,
                    w: FontWeight.w600,
                    ls: -0.04,
                    h: 1.1,
                    c: const Color(0xFFB8BCC2))),
            IntrinsicWidth(
              child: TextField(
                controller: _ctrl,
                focusNode: _focus,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}')),
                ],
                cursorColor: Bl.brand,
                onChanged: (_) => setState(() => _quick = 2),
                style: Bl.tight(40, w: FontWeight.w700, ls: -0.04, h: 1.1),
                decoration: const InputDecoration(
                  isDense: true,
                  filled: false,
                  contentPadding: EdgeInsets.zero,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  constraints: BoxConstraints(minWidth: 30),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            quick(0, 'Full ${Money.inr(_due)}'),
            const SizedBox(width: 6),
            quick(1, 'Half ${Money.inr(_due / 2)}'),
            const SizedBox(width: 6),
            quick(2, 'Other'),
          ],
        ),
        const SizedBox(height: 9),
        Row(
          children: [
            for (final (key, label, icon) in _methods) ...[
              if (key != 'CASH') const SizedBox(width: 8),
              Expanded(
                child: Semantics(
                  button: true,
                  selected: _method == key,
                  label: label,
                  excludeSemantics: true,
                  child: BlTap(
                    onTap: () => setState(() => _method = key),
                    child: Column(
                      children: [
                        Container(
                          height: 52,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                              color:
                                  _method == key ? Bl.brand : Bl.wellSoft,
                              borderRadius: BorderRadius.circular(16)),
                          child: BlIcon(icon,
                              size: 20,
                              color: _method == key ? Bl.white : Bl.ink3),
                        ),
                        const SizedBox(height: 6),
                        Text(label,
                            style: Bl.tight(12,
                                w: FontWeight.w600,
                                ls: 0,
                                c: _method == key ? Bl.ink : Bl.body)),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        Container(
          margin: const EdgeInsets.only(top: 14),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
              color: Bl.tile, borderRadius: BorderRadius.circular(12)),
          child: Column(
            children: [
              line('Balance due now', Money.inr(_due)),
              line('Still due after this', Money.inr(after),
                  c: after <= 0 ? const Color(0xFF17663A) : Bl.ink),
            ],
          ),
        ),
        if (_error != null)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
                color: Bl.redSoft, borderRadius: BorderRadius.circular(12)),
            child: Text(_error!,
                style: Bl.inter(11.5, w: FontWeight.w500, c: Bl.redDeep)),
          ),
        const SizedBox(height: 16),
        BlSlide('Slide to record ${Money.inr(_amount)}', onConfirmed: _record),
      ],
    );
  }
}

/// "4", not "4.0"; fractions keep their decimals.
String _qtyText(Object? q) {
  final v = q is num ? q.toDouble() : double.tryParse('$q');
  if (v == null) return '$q';
  return v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();
}
