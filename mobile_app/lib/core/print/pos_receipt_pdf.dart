// Local (non-web-rendered) POS receipt PDF builder.
//
// This is the fallback used by every print/share entry point whenever the
// pixel-perfect web render (WebPrintService) fails or times out. Shared so
// checkout (add_sale_screen) and the invoice/sale detail screen produce an
// identical fallback slip instead of each hand-rolling their own.
import 'dart:typed_data';

import 'package:mobile_app/features/invoices/data/models/invoice.dart';
import 'package:mobile_app/features/settings/data/models/business_profile.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

class PdfLineItem {
  final String name;
  final String sku;
  final String unit;
  final int qty;
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
    return PdfLineItem(
      name: m['name']?.toString() ?? m['productName']?.toString() ?? m['product_name']?.toString() ?? 'Item',
      sku: m['sku']?.toString() ?? '',
      unit: m['unit']?.toString() ?? 'PCS',
      qty: int.tryParse((m['quantity'] ?? m['qty'])?.toString() ?? '1') ?? 1,
      // Web saves `rate`; old sales saved `price`. Also fall back to unitPrice/sellingPrice.
      price: double.tryParse(
            (m['rate'] ?? m['price'] ?? m['unitPrice'] ?? m['unit_price'] ?? m['sellingPrice'])
                ?.toString() ?? '0',
          ) ??
          0.0,
      taxRate: double.tryParse(m['taxRate']?.toString() ?? '0') ?? 0.0,
    );
  }).toList();
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
Future<Uint8List> buildPosReceiptPdf(Invoice invoice, BusinessProfile? biz) async {
  final pdf   = pw.Document();
  final items = parsePdfItems(invoice);
  final isPaid    = invoice.paymentStatus == 'PAID';
  final isPartial = invoice.paymentStatus == 'PARTIAL';
  final invoiceNo = invoice.displayNumber;
  final custName  = invoice.displayClientName;
  final dateStr   = fmtReceiptDate(invoice.invoiceDate);

  final double subtotal   = items.fold(0.0, (s, i) => s + i.lineTotal);
  final double totalTax   = items.fold(0.0, (s, i) => s + i.taxAmount);
  final double grandTotal = invoice.grandTotal > 0 ? invoice.grandTotal : subtotal + totalTax;
  final double paidAmount = invoice.paidAmount;
  final double balance    = (grandTotal - paidAmount).clamp(0, double.infinity);

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
                    if (it.taxRate > 0)
                      pw.Text('GST ${it.taxRate.toStringAsFixed(0)}%',
                          style: pw.TextStyle(fontSize: 7, color: subtle)),
                  ],
                )),
                pw.SizedBox(width: 22, child: pw.Text(it.qty.toString(),
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

          if (isPartial || (paidAmount > 0 && !isPaid)) ...[
            amtRow('Paid', 'Rs.${fmtReceiptAmount(paidAmount)}', isBold: true),
            amtRow('Balance Due', 'Rs.${fmtReceiptAmount(balance)}', isBold: true, fs: 9),
            dashedLine(),
          ],

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
