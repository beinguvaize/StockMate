import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

/// One line of the printed statement.
typedef StatementPdfLine = ({
  String date,
  String details,
  double billed,
  double received,
  double balance,
});

/// Everything the printed statement needs, already worked out by the
/// statement screen, so the paper and the screen can never disagree.
class StatementPdfData {
  final String shopName;
  final List<String> shopLines;
  final String clientName;
  final String clientLine;
  final String range;
  final String openingDate;
  final double opening;
  final double closing;
  final double billed;
  final double received;
  final List<StatementPdfLine> lines;
  final String generated;
  const StatementPdfData({
    required this.shopName,
    required this.shopLines,
    required this.clientName,
    required this.clientLine,
    required this.range,
    required this.openingDate,
    required this.opening,
    required this.closing,
    required this.billed,
    required this.received,
    required this.lines,
    required this.generated,
  });
}

String _num(double v) {
  final neg = v < 0;
  final s = v.abs().round().toString();
  String out;
  if (s.length <= 3) {
    out = s;
  } else {
    final rest = s.substring(0, s.length - 3).replaceAllMapped(
        RegExp(r'(\d)(?=(\d{2})+$)'), (m) => '${m[1]},');
    out = '$rest,${s.substring(s.length - 3)}';
  }
  return neg ? '-$out' : out;
}

/// Builds the statement as an A4 PDF. Returns the file and its page count.
Future<({Uint8List bytes, int pages})> buildStatementPdf(
    StatementPdfData d) async {
  // Noto Sans has the rupee sign. It is fetched once and cached; with no
  // internet and no cache the statement still prints, with "Rs" instead.
  pw.ThemeData? theme;
  var rupee = 'Rs ';
  try {
    theme = pw.ThemeData.withFont(
      base: await PdfGoogleFonts.notoSansRegular(),
      bold: await PdfGoogleFonts.notoSansBold(),
    );
    rupee = '₹';
  } catch (e) {
    debugPrint('[statement pdf] font not available, using built-in: $e');
  }

  const ink = PdfColor.fromInt(0xFF111418);
  const mute = PdfColor.fromInt(0xFF7A8088);
  const rule = PdfColor.fromInt(0xFFEDEDED);
  const tile = PdfColor.fromInt(0xFFF7F7F6);

  pw.TextStyle st(double size, {bool bold = false, PdfColor c = ink}) =>
      pw.TextStyle(
          fontSize: size,
          color: c,
          fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal);

  pw.Widget cell(String t,
          {bool right = false,
          bool head = false,
          bool bold = false,
          PdfColor line = rule,
          double lineW = 0.7}) =>
      pw.Container(
        padding: const pw.EdgeInsets.symmetric(vertical: 7),
        decoration: pw.BoxDecoration(
            border: pw.Border(
                bottom: pw.BorderSide(color: line, width: lineW))),
        alignment: right ? pw.Alignment.centerRight : pw.Alignment.centerLeft,
        child: pw.Text(head ? t.toUpperCase() : t,
            style: head
                ? st(8, bold: true, c: mute).copyWith(letterSpacing: 0.4)
                : st(10, bold: bold)),
      );

  const widths = <int, pw.TableColumnWidth>{
    0: pw.FixedColumnWidth(74),
    1: pw.FlexColumnWidth(),
    2: pw.FixedColumnWidth(78),
    3: pw.FixedColumnWidth(78),
    4: pw.FixedColumnWidth(82),
  };

  final doc = pw.Document(theme: theme);
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(34, 36, 34, 30),
      footer: (ctx) => pw.Padding(
        padding: const pw.EdgeInsets.only(top: 14),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text('Generated ${d.generated} · bookledger',
                style: st(8, c: mute)),
            pw.Text('Page ${ctx.pageNumber} of ${ctx.pagesCount}',
                style: st(8, c: mute)),
          ],
        ),
      ),
      build: (ctx) => [
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(d.shopName, style: st(17, bold: true)),
                  for (final l in d.shopLines)
                    pw.Padding(
                      padding: const pw.EdgeInsets.only(top: 2),
                      child: pw.Text(l, style: st(9, c: mute)),
                    ),
                ],
              ),
            ),
            pw.SizedBox(width: 16),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.end,
              children: [
                pw.Text('STATEMENT OF ACCOUNT',
                    style: st(12, bold: true).copyWith(letterSpacing: 0.7)),
                pw.SizedBox(height: 3),
                pw.Text(d.range, style: st(9, c: mute)),
              ],
            ),
          ],
        ),
        pw.SizedBox(height: 18),
        pw.Container(
          padding: const pw.EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: pw.BoxDecoration(
              color: tile, borderRadius: pw.BorderRadius.circular(4)),
          child: pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text('STATEMENT FOR',
                        style: st(7.5, c: mute).copyWith(letterSpacing: 0.4)),
                    pw.SizedBox(height: 3),
                    pw.Text(d.clientName, style: st(12.5, bold: true)),
                    if (d.clientLine.isNotEmpty)
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(top: 2),
                        child: pw.Text(d.clientLine, style: st(9, c: mute)),
                      ),
                  ],
                ),
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text(d.closing < -0.5 ? 'PAID IN ADVANCE' : 'BALANCE DUE',
                      style: st(7.5, c: mute).copyWith(letterSpacing: 0.4)),
                  pw.SizedBox(height: 3),
                  pw.Text('$rupee${_num(d.closing.abs())}',
                      style: st(19, bold: true)),
                ],
              ),
            ],
          ),
        ),
        pw.SizedBox(height: 12),
        pw.Table(
          columnWidths: widths,
          children: [
            pw.TableRow(repeat: true, children: [
              cell('Date', head: true, line: ink),
              cell('Details', head: true, line: ink),
              cell('Billed', head: true, right: true, line: ink),
              cell('Received', head: true, right: true, line: ink),
              cell('Balance', head: true, right: true, line: ink),
            ]),
            pw.TableRow(children: [
              cell(d.openingDate),
              cell('Opening balance'),
              cell(''),
              cell(''),
              cell(_num(d.opening), right: true),
            ]),
            for (final l in d.lines)
              pw.TableRow(children: [
                cell(l.date),
                cell(l.details),
                cell(l.billed > 0 ? _num(l.billed) : '', right: true),
                cell(l.received > 0 ? _num(l.received) : '', right: true),
                cell(_num(l.balance), right: true),
              ]),
            pw.TableRow(children: [
              cell('', line: ink, lineW: 1.2),
              cell('Totals', bold: true, line: ink, lineW: 1.2),
              cell(_num(d.billed),
                  right: true, bold: true, line: ink, lineW: 1.2),
              cell(_num(d.received),
                  right: true, bold: true, line: ink, lineW: 1.2),
              cell(_num(d.closing),
                  right: true, bold: true, line: ink, lineW: 1.2),
            ]),
          ],
        ),
      ],
    ),
  );
  final bytes = await doc.save();
  return (bytes: bytes, pages: doc.document.pdfPageList.pages.length);
}

String _size(int bytes) => bytes < 1024 * 1024
    ? '${(bytes / 1024).round().clamp(1, 1023)} KB'
    : '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';

/// "Statement PDF" (canvas): the statement as it will print, with two ways
/// out. Sending opens the phone's share sheet with the file attached, where
/// the owner picks WhatsApp and the chat; nothing is sent from this app.
class StatementPdfScreen extends StatefulWidget {
  final StatementPdfData data;
  const StatementPdfScreen({super.key, required this.data});

  @override
  State<StatementPdfScreen> createState() => _StatementPdfScreenState();
}

class _StatementPdfScreenState extends State<StatementPdfScreen> {
  late final Future<({Uint8List bytes, int pages})> _pdf =
      buildStatementPdf(widget.data);
  bool _busy = false;

  String get _fileName {
    final safe = widget.data.clientName
        .replaceAll(RegExp(r'[^A-Za-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    return 'statement-${safe.isEmpty ? 'client' : safe}.pdf';
  }

  void _say(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));
  }

  Future<void> _run(Future<void> Function(Uint8List bytes) action,
      String failed) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action((await _pdf).bytes);
    } catch (e) {
      debugPrint('[statement pdf] $failed: $e');
      _say('$failed ($e)');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() => _run((bytes) async {
        final dir = await getTemporaryDirectory();
        final file = File('${dir.path}/$_fileName');
        await file.writeAsBytes(bytes, flush: true);
        await Share.shareXFiles(
          [XFile(file.path, mimeType: 'application/pdf')],
          text:
              'Statement of account for ${widget.data.clientName}, ${widget.data.range}.',
        );
      }, 'Could not share the statement.');

  Future<void> _download() => _run(
      (bytes) => Printing.layoutPdf(
          name: _fileName, onLayout: (_) async => bytes),
      'Could not open the statement for saving.');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              title: 'Statement PDF',
              trailing: BlRoundButton(
                  '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',
                  label: 'Share the statement',
                  onTap: _send),
            ),
            Expanded(
              child: FutureBuilder(
                future: _pdf,
                builder: (context, snap) {
                  if (snap.hasError) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                            'Could not build the statement. (${snap.error})',
                            textAlign: TextAlign.center,
                            style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                      ),
                    );
                  }
                  if (!snap.hasData) {
                    return const ColoredBox(
                      color: Color(0xFFE9E8E6),
                      child: Center(
                          child: CircularProgressIndicator(
                              color: Bl.amber, strokeWidth: 2)),
                    );
                  }
                  final pdf = snap.data!;
                  return ColoredBox(
                    color: const Color(0xFFE9E8E6),
                    child: Column(
                      children: [
                        Expanded(
                          child: PdfPreview(
                            build: (_) async => pdf.bytes,
                            useActions: false,
                            canChangePageFormat: false,
                            canChangeOrientation: false,
                            canDebug: false,
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                            previewPageMargin:
                                const EdgeInsets.only(bottom: 12),
                            scrollViewDecoration: const BoxDecoration(
                                color: Color(0xFFE9E8E6)),
                            pdfPreviewPageDecoration: BoxDecoration(
                              color: Bl.white,
                              borderRadius: BorderRadius.circular(4),
                              boxShadow: const [
                                BoxShadow(
                                    color: Color(0x59000000),
                                    blurRadius: 24,
                                    spreadRadius: -8,
                                    offset: Offset(0, 6)),
                              ],
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.only(top: 4, bottom: 12),
                          child: Text(
                              '${pdf.pages} page${pdf.pages == 1 ? '' : 's'} · PDF · ${_size(pdf.bytes.length)}',
                              style: Bl.inter(12,
                                  w: FontWeight.w500,
                                  c: const Color(0xFF7A8088))),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Row(
                children: [
                  Expanded(
                    flex: 10,
                    child: BlButton('Download',
                        kind: BlButtonKind.soft, onTap: _download),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 14,
                    child: Semantics(
                      button: true,
                      label: 'Send on WhatsApp',
                      excludeSemantics: true,
                      child: BlTap(
                        onTap: _send,
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
                                  style: Bl.tight(15,
                                      w: FontWeight.w600, c: Bl.white)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
