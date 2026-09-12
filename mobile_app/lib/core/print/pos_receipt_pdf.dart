// Local (non-web-rendered) POS receipt PDF builder.
//
// This is the fallback used by every print/share entry point whenever the
// pixel-perfect web render (WebPrintService) fails or times out. Shared so
// checkout (add_sale_screen) and the invoice/sale detail screen produce an
// identical fallback slip instead of each hand-rolling their own.
import 'dart:typed_data';

import 'package:mobile_app/core/utils/units.dart';
import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

class PdfLineItem {
  final String name;
  final String sku;
  final String unit;
  final double qty;
  final double price;
  final double taxRate;
  PdfLineItem({
    required this.name,
    this.sku = '',
    this.unit = 'PCS',
    required this.qty,
    required this.price,
    this.taxRate = 0,
  });
  double get lineTotal => qty * price;
  double get taxAmount => lineTotal * taxRate / 100;
}

List<PdfLineItem> parsePdfItems(Invoice invoice) {
  final raw = invoice.items;
  if (raw == null || raw.isEmpty) return [];
  return raw.map((item) {
    final m = item as Map<String, dynamic>? ?? {};

    final baseQty = double.tryParse((m['quantity'] ?? m['qty'])?.toString() ?? '1') ?? 1;
    // Web saves `rate`; old sales saved `price`. Also fall back to unitPrice/sellingPrice.
    final basePrice = double.tryParse(
          (m['rate'] ?? m['price'] ?? m['unitPrice'] ?? m['unit_price'] ?? m['sellingPrice'])
              ?.toString() ?? '0',
        ) ??
        0.0;

    // A line sold by the packet carries a snapshot of that view. Print what the
    // customer actually bought — "2 PACK @ 30" — rather than the base units the
    // line is stored in, which read as "0.5 KG @ 120" and look like a different
    // sale. Falls back to base whenever the snapshot is absent, so older sales
    // and non-packet goods are unaffected.
    final sellUnitName = m['sellUnitName']?.toString();
    final sellQty = double.tryParse(m['sellQty']?.toString() ?? '');
    final sellUnitPrice = double.tryParse(m['sellUnitPrice']?.toString() ?? '');
    final usePack = sellUnitName != null && sellUnitName.isNotEmpty &&
        sellQty != null && sellQty > 0 && sellUnitPrice != null && sellUnitPrice > 0;

    return PdfLineItem(
      name: m['name']?.toString() ?? m['productName']?.toString() ?? m['product_name']?.toString() ?? 'Item',
      sku: m['sku']?.toString() ?? '',
      unit: usePack ? sellUnitName : (m['unit']?.toString() ?? 'PCS'),
      // Was int.tryParse(...) ?? 1 — a stored 0.25 failed the parse and fell
      // back to 1, so lineTotal (qty * price) printed 4x the real amount on
      // the customer's receipt.
      qty: usePack ? sellQty : baseQty,
      price: usePack ? sellUnitPrice : basePrice,
      taxRate: double.tryParse(m['taxRate']?.toString() ?? '0') ?? 0.0,
    );
  }).toList();
}

/// The clock time a bill was rung up, or '' when there is none.
///
/// invoiceDate is date-only, so the receipt could only ever say which day. Two
/// bills to the same customer on one day were indistinguishable on paper --
/// which is exactly when a customer queries one.
///
/// Returns '' rather than a dash: the caller joins date and time and drops
/// empties, so a bill without a timestamp prints the date alone.
///
/// toLocal() matters. A timestamp from Supabase is UTC, and printing its raw
/// hour would put a Kerala shop's 2:57 pm bill at 9:27 am.
String fmtReceiptTime(DateTime? ts) {
  if (ts == null) return '';
  final d = ts.toLocal();
  final h24 = d.hour;
  final h = h24 % 12 == 0 ? 12 : h24 % 12;
  final min = d.minute.toString().padLeft(2, '0');
  return '$h:$min ${h24 < 12 ? 'am' : 'pm'}';
}

String fmtReceiptDate(String? iso) {
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

String fmtReceiptAmount(double v) => v.toStringAsFixed(2);

/// Builds an 80mm thermal-style receipt PDF straight from an [Invoice] +
/// [BusinessProfile] — no network, no WebView, always succeeds.
/// [clientOutstanding] is the client's balance AFTER this sale (negative = an
/// advance). Pass null for walk-ins — the account lines are then skipped.
/// [amountReceived] is the cash actually handed over (may exceed the bill).
/// [noGst] mirrors tax mode NONE so this slip matches the web receipt.
Future<Uint8List> buildPosReceiptPdf(
  Invoice invoice,
  BusinessProfile? biz, {
  double? clientOutstanding,
  double? amountReceived,
  bool noGst = false,
}) async {
  final pdf   = pw.Document();
  final items = parsePdfItems(invoice);
  final invoiceNo = invoice.displayNumber;
  final custName  = invoice.displayClientName;
  final dateStr   = [
    fmtReceiptDate(invoice.invoiceDate),
    fmtReceiptTime(invoice.createdAt),
  ].where((x) => x.isNotEmpty).join(' · ');

  final double subtotal   = items.fold(0.0, (s, i) => s + i.lineTotal);
  final double totalTax   = noGst ? 0.0 : items.fold(0.0, (s, i) => s + i.taxAmount);
  final double grandTotal = invoice.grandTotal > 0 ? invoice.grandTotal : subtotal + totalTax;
  final double paidAmount = invoice.paidAmount;
  final double balance    = (grandTotal - paidAmount).clamp(0, double.infinity).toDouble();

  // ── Money summary (mirrors web POSReceipt) ──────────────────────────────
  final bool   showAccount = clientOutstanding != null;
  final double totalOut    = clientOutstanding ?? 0;
  final double olderDue    = totalOut - balance;          // unpaid earlier bills
  final double received    = amountReceived ?? 0;
  final bool   showReceived = amountReceived != null && received > paidAmount + 0.01;
  final double excess      = showReceived ? received - grandTotal : 0;

  const ink    = PdfColors.black;
  const subtle = PdfColor.fromInt(0xFF555555);

  pw.Widget dashedLine() => pw.Divider(height: 8, thickness: 0.6, color: subtle);
  pw.Widget solidLine() => pw.Divider(height: 8, thickness: 1.0, color: ink);

  pw.Widget amtRow(String label, String value, {bool isBold = false, double fs = 8}) =>
      pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 1),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text(label, style: pw.TextStyle(fontSize: fs, color: isBold ? ink : subtle)),
            pw.Text(value,
                style: isBold
                    ? pw.TextStyle(fontSize: fs, fontWeight: pw.FontWeight.bold, color: ink)
                    : pw.TextStyle(fontSize: fs, color: ink)),
          ],
        ),
      );

  final docLabel = (biz?.invoiceTerms?.toLowerCase().contains('estimate') == true)
      ? 'ESTIMATE'
      : invoice.isSaleSource ? 'SALE RECEIPT' : 'TAX INVOICE';

  pdf.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.roll80.copyWith(
        marginLeft: 8, marginRight: 8, marginTop: 12, marginBottom: 16,
      ),
      build: (ctx) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          pw.Center(child: pw.Text(
            (biz?.name ?? 'YOUR BUSINESS').toUpperCase(),
            textAlign: pw.TextAlign.center,
            style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold, color: ink),
          )),
          if (biz?.address?.isNotEmpty == true) ...[
            pw.SizedBox(height: 2),
            pw.Center(child: pw.Text(biz!.address!,
                textAlign: pw.TextAlign.center,
                style: pw.TextStyle(fontSize: 8, color: subtle))),
          ],
          if (biz?.phone?.isNotEmpty == true)
            pw.Center(child: pw.Text('(${biz!.phone!})',
                style: pw.TextStyle(fontSize: 8, color: subtle))),
          if (biz?.gstNo?.isNotEmpty == true) ...[
            pw.SizedBox(height: 1),
            pw.Center(child: pw.Text('GSTIN: ${biz!.gstNo!}',
                style: pw.TextStyle(fontSize: 8, color: subtle))),
          ],

          dashedLine(),

          pw.Center(child: pw.Text(docLabel,
              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: ink,
                  letterSpacing: 1.5))),

          dashedLine(),

          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text('Receipt #: $invoiceNo',
                  style: pw.TextStyle(fontSize: 8, color: subtle)),
              pw.Text(dateStr, style: pw.TextStyle(fontSize: 8, color: subtle)),
            ],
          ),
          if (custName.isNotEmpty && custName != 'Walk-in Customer' && custName != 'Unknown') ...[
            pw.SizedBox(height: 2),
            pw.Row(children: [
              pw.Text('Bill To: ', style: pw.TextStyle(fontSize: 8, color: subtle)),
              pw.Text(custName,
                  style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: ink)),
            ]),
          ],

          dashedLine(),

          pw.Row(children: [
            pw.Expanded(child: pw.Text('Item',
                style: pw.TextStyle(fontSize: 8, color: subtle))),
            pw.SizedBox(width: 22, child: pw.Text('Qty',
                textAlign: pw.TextAlign.right,
                style: pw.TextStyle(fontSize: 8, color: subtle))),
            pw.SizedBox(width: 46, child: pw.Text('Price',
                textAlign: pw.TextAlign.right,
                style: pw.TextStyle(fontSize: 8, color: subtle))),
            pw.SizedBox(width: 46, child: pw.Text('Amount',
                textAlign: pw.TextAlign.right,
                style: pw.TextStyle(fontSize: 8, color: subtle))),
          ]),
          dashedLine(),

          ...items.map((it) => pw.Padding(
            padding: const pw.EdgeInsets.symmetric(vertical: 2),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Expanded(child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(it.name,
                        style: pw.TextStyle(fontSize: 8, color: ink)),
                    // Name the unit when it is not plain pieces. The quantity
                    // column prints a bare number, so a packet sale read as
                    // "2" with nothing saying two of what — and 2 packets and
                    // 2 pieces are different purchases at the same price.
                    if (it.unit.isNotEmpty && it.unit.toUpperCase() != 'PCS')
                      pw.Text('per ${it.unit}',
                          style: pw.TextStyle(fontSize: 7, color: subtle)),
                    if (it.taxRate > 0)
                      pw.Text('GST ${it.taxRate.toStringAsFixed(0)}%',
                          style: pw.TextStyle(fontSize: 7, color: subtle)),
                  ],
                )),
                pw.SizedBox(width: 22, child: pw.Text(formatQty(it.qty, it.unit),
                    textAlign: pw.TextAlign.right,
                    style: pw.TextStyle(fontSize: 8, color: ink))),
                pw.SizedBox(width: 46, child: pw.Text(fmtReceiptAmount(it.price),
                    textAlign: pw.TextAlign.right,
                    style: pw.TextStyle(fontSize: 8, color: subtle))),
                pw.SizedBox(width: 46, child: pw.Text(fmtReceiptAmount(it.lineTotal),
                    textAlign: pw.TextAlign.right,
                    style: pw.TextStyle(fontSize: 8, color: ink))),
              ],
            ),
          )),

          dashedLine(),

          amtRow('Subtotal', 'Rs.${fmtReceiptAmount(subtotal)}'),
          if (totalTax > 0) ...[
            amtRow('CGST (${(totalTax / subtotal * 50).toStringAsFixed(1)}%)',
                'Rs.${fmtReceiptAmount(totalTax / 2)}'),
            amtRow('SGST (${(totalTax / subtotal * 50).toStringAsFixed(1)}%)',
                'Rs.${fmtReceiptAmount(totalTax / 2)}'),
          ],

          solidLine(),

          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text('Total',
                  style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: ink)),
              pw.Text('Rs.${fmtReceiptAmount(grandTotal)}',
                  style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: ink)),
            ],
          ),

          solidLine(),

          // Money summary — same wording and order as the web slip, so the
          // offline fallback tells the customer the same story.
          amtRow('Bill amount', 'Rs.${fmtReceiptAmount(grandTotal)}'),
          amtRow('Paid on this bill', 'Rs.${fmtReceiptAmount(paidAmount)}'),
          if (balance > 0.001)
            amtRow('Still due on this bill', 'Rs.${fmtReceiptAmount(balance)}', isBold: true),

          if (showReceived) ...[
            dashedLine(),
            amtRow('Cash received', 'Rs.${fmtReceiptAmount(received)}'),
            if (excess > 0.01)
              amtRow(showAccount ? 'Extra received' : 'Change returned',
                  'Rs.${fmtReceiptAmount(excess)}'),
          ],

          if (showAccount) ...[
            dashedLine(),
            if (olderDue > 0.001)
              amtRow('Older bills still due', 'Rs.${fmtReceiptAmount(olderDue)}'),
            amtRow(totalOut < -0.001 ? 'ADVANCE WITH US' : 'YOU OWE NOW',
                'Rs.${fmtReceiptAmount(totalOut.abs())}', isBold: true, fs: 10),
            if (totalOut < -0.001)
              pw.Center(child: pw.Text('(we will use it on your next bill)',
                  style: pw.TextStyle(fontSize: 7, color: subtle))),
          ],
          dashedLine(),

          if (invoice.paymentMethod?.isNotEmpty == true) ...[
            pw.Text('Payment Method:',
                style: pw.TextStyle(fontSize: 8, color: subtle)),
            pw.SizedBox(height: 1),
            pw.Text(invoice.paymentMethod!.toUpperCase(),
                style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: ink)),
            dashedLine(),
          ],

          pw.SizedBox(height: 4),

          pw.Center(child: pw.Text(
            biz?.footerMessage ?? 'Thank you for shopping with us!',
            textAlign: pw.TextAlign.center,
            style: pw.TextStyle(fontSize: 8, color: subtle),
          )),
          if (biz?.upiId?.isNotEmpty == true) ...[
            pw.SizedBox(height: 3),
            pw.Center(child: pw.Text('UPI: ${biz!.upiId!}',
                style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: ink))),
          ],

          pw.SizedBox(height: 8),
          dashedLine(),
        ],
      ),
    ),
  );

  return pdf.save();
}
