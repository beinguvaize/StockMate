// WebPrintService — see class doc below.
library;

/// WebPrintService — renders web's React templates (POSReceipt or
/// InvoiceTemplate) inside an offscreen InAppWebView and exports the
/// result to PDF bytes. Single source of truth with web; any tweak to
/// POSReceipt.jsx / InvoiceTemplate.jsx flows straight through to
/// mobile printing.
///
/// Auth: injects the active Supabase session JWT into localStorage
/// before navigation so the embed page's RLS queries succeed.
///
/// Usage:
///   final bytes = await WebPrintService.renderReceiptPdf(saleId,
///     tendered: 300.00);
///   await Printing.layoutPdf(onLayout: (_) async => bytes);

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:pdf/pdf.dart' as pdfpkg;
import 'package:pdf/widgets.dart' as pw;

class WebPrintService {
  // Base URL of the web app. Same env switch as the supabase client —
  // dev tenants print from the dev frontend, prod from prod.
  static const String _baseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'https://app.bookledger.in',
  );

  static Future<Uint8List?> renderReceiptPdf(String saleId, {double? tendered}) {
    final extra = tendered != null ? '?tendered=${tendered.toStringAsFixed(2)}' : '';
    return _render('/embed/receipt/$saleId$extra');
  }

  static Future<Uint8List?> renderInvoicePdf(String invoiceId) {
    return _render('/embed/invoice/$invoiceId');
  }

  static Future<Uint8List?> _render(String path) async {
    // Transient network blips (slow DNS, momentary drop) are common on
    // mobile data — one retry here means the caller only ever sees the
    // local-PDF fallback (and its "standard layout" notice) for a genuine,
    // sustained failure, not a one-off hiccup.
    try {
      return await _renderOnce(path);
    } catch (e) {
      debugPrint('[WebPrint] first attempt failed, retrying once: $e');
      return _renderOnce(path);
    }
  }

  static Future<Uint8List?> _renderOnce(String path) async {
    final session = supabase.auth.currentSession;
    if (session == null) {
      throw Exception('Not signed in — sign in first to print web layouts.');
    }
    final url   = '$_baseUrl$path';
    final token = session.accessToken;
    final refresh = session.refreshToken ?? '';
    // localStorage key the supabase-js client persists session under.
    const storageKey = 'sm-auth-token';
    final sessionJson = jsonEncode({
      'access_token':  token,
      'refresh_token': refresh,
      'expires_at':    session.expiresAt,
      'expires_in':    (session.expiresAt ?? 0) - DateTime.now().millisecondsSinceEpoch ~/ 1000,
      'token_type':    'bearer',
      'user':          session.user.toJson(),
    });

    final completer = Completer<Uint8List?>();
    // Mount the WebView at a real A4-width size, positioned far off the
    // left edge so the user never sees it. A 0×0 (SizedBox.shrink)
    // WebView lays the page out at a near-zero CSS viewport, so the
    // 794px-wide invoice sheet overflowed and only the left portion was
    // painted — which is why html2canvas captured a right- and
    // bottom-cropped invoice no matter what capture options we passed.
    // 820 logical px is wide enough for the 210mm (~794px) sheet plus
    // a little slack; height is generous so the full document paints.
    const renderW = 820.0;
    const renderH = 1400.0;
    final entry = OverlayEntry(builder: (_) => Positioned(
      left: -100000, // off-screen — laid out and painted, never visible
      top: 0,
      width: renderW,
      height: renderH,
      child: InAppWebView(
      initialUrlRequest: URLRequest(url: WebUri('about:blank')),
      initialSettings: InAppWebViewSettings(
        javaScriptEnabled: true,
        domStorageEnabled: true,
        supportZoom: false,
      ),
      onWebViewCreated: (c) async {
        // Seed localStorage on the target origin, then navigate.
        await c.loadUrl(urlRequest: URLRequest(url: WebUri(_baseUrl)));
      },
      onLoadStop: (c, currentUrl) async {
        if (currentUrl.toString().startsWith(_baseUrl) && !completer.isCompleted) {
          // First land: seed token then navigate to embed path.
          if (!currentUrl.toString().contains('/embed/')) {
            await c.evaluateJavascript(source:
              "window.localStorage.setItem('$storageKey', ${jsonEncode(sessionJson)});");
            await c.loadUrl(urlRequest: URLRequest(url: WebUri(url)));
            return;
          }
          // Poll for the embed page's readiness flag instead of guessing
          // a fixed delay. The page sets window.__embedReady = true once
          // the Supabase fetch resolves and React commits the receipt /
          // invoice DOM. If we snapshot before this, the PDF captures
          // the "Loading…" frame and the user sees the wrong layout.
          try {
            const maxWaitMs = 8000;
            const stepMs    = 150;
            var waited      = 0;
            var ready       = false;
            while (waited < maxWaitMs) {
              final res = await c.evaluateJavascript(
                source: 'window.__embedReady === true',
              );
              if (res == true || res?.toString() == 'true') {
                ready = true;
                break;
              }
              await Future.delayed(const Duration(milliseconds: stepMs));
              waited += stepMs;
            }
            if (!ready) {
              throw Exception('Embed page never signalled readiness within ${maxWaitMs}ms');
            }
            // Tiny grace for layout/font settle after the ready flag.
            await Future.delayed(const Duration(milliseconds: 250));
            // Source of truth = the React DOM the embed page renders.
            // Export pipeline picks the first thing that works on this
            // platform:
            //   1. window.__renderToPng (html2canvas, both platforms,
            //      captures the full document at devicePixelRatio).
            //   2. WKWebView createPdf (iOS-only, vector PDF).
            //   3. takeScreenshot of the WebView's render area
            //      (Android fallback, viewport-only — last resort).
            Uint8List? bytes;
            try {
              bytes = await _renderViaHtml2Canvas(c);
            } catch (e) {
              debugPrint('[WebPrint] __renderToPng failed: $e');
            }
            // NOTE: WKWebView createPdf() defaults to an A4/Letter page and
            // ignores the receipt's @page size — that was the source of the
            // big white tail on thermal prints. Both remaining paths size the
            // output to the receipt sheet itself, so direct print + share
            // stay compact on 58/80mm rolls.
            if (bytes == null || bytes.isEmpty) {
              bytes = await _screenshotToPdf(c);
            }
            if (bytes.isEmpty) {
              throw Exception('PDF export produced empty bytes');
            }
            if (!completer.isCompleted) completer.complete(bytes);
          } catch (e) {
            if (!completer.isCompleted) completer.completeError(e);
          }
        }
      },
    ),
    ));

    // Mount overlay via the navigator-key — see binding in main.dart.
    final navKey = appNavigatorKey;
    final overlay = navKey.currentState?.overlay;
    if (overlay == null) {
      throw Exception('No overlay in navigator; cannot mount WebView.');
    }
    overlay.insert(entry);
    try {
      final bytes = await completer.future.timeout(const Duration(seconds: 25));
      return bytes;
    } finally {
      entry.remove();
    }
  }
}

/// Calls the embed page's window.__renderToPng() (which uses
/// html2canvas-pro to rasterise the full document DOM at the device's
/// pixel ratio) and wraps the resulting PNG bytes inside a single
/// PDF page sized to match the document's CSS dimensions.
///
/// This is the preferred export path because it works identically on
/// iOS, Android, and any future surface — the React DOM is rendered
/// once on the page itself and the PDF is just a wrapper.
Future<Uint8List?> _renderViaHtml2Canvas(InAppWebViewController c) async {
  // The embed page's __renderToPng now returns a JSON payload that
  // includes the captured element's own CSS dimensions, so the PDF
  // page can be sized to the receipt / invoice itself instead of to
  // the document scroll height. Without this the slip rendered with
  // a tall white tail (the rest of the viewport) and the share-sheet
  // preview showed wasted blank space.
  final raw = await c.evaluateJavascript(source: '''
    (async () => {
      if (typeof window.__renderToPng !== 'function') return null;
      try { return await window.__renderToPng(); }
      catch (e) { return null; }
    })()
  ''');
  if (raw is! String || raw.isEmpty) return null;

  String? dataUrl;
  double? cssW;
  double? cssH;
  try {
    final payload = jsonDecode(raw) as Map<String, dynamic>;
    dataUrl = payload['dataUrl'] as String?;
    cssW    = (payload['cssW'] as num?)?.toDouble();
    cssH    = (payload['cssH'] as num?)?.toDouble();
  } catch (_) {
    // Older embed builds returned the raw data URL directly.
    dataUrl = raw;
  }
  if (dataUrl == null || !dataUrl.startsWith('data:image/png;base64,')) {
    return null;
  }
  final png = base64Decode(dataUrl.substring('data:image/png;base64,'.length));

  // If the embed didn't tell us the captured size, fall back to the
  // document scroll dimensions (best-effort; older behaviour).
  if (cssW == null || cssH == null || cssW <= 0 || cssH <= 0) {
    final dimsRaw = await c.evaluateJavascript(source: '''
      JSON.stringify({
        w: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        h: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
      })
    ''');
    final dims = (dimsRaw is String)
        ? jsonDecode(dimsRaw) as Map<String, dynamic>
        : <String, dynamic>{};
    cssW = (dims['w'] as num?)?.toDouble() ?? 800.0;
    cssH = (dims['h'] as num?)?.toDouble() ?? 1200.0;
  }

  // Size the PDF page to the captured content exactly — the embed
  // page reports cssW / cssH as the receipt's / invoice's own bounding
  // rect (tight to the sheet), so the page has no white margin or
  // trailing blank space. Receipt cssW ≈ 302 px → ~80mm; invoice
  // cssW ≈ 794 px → ~210mm (A4 width). 1 CSS px = 0.75 PDF pt at 96dpi.
  // Because the page aspect now matches the image aspect we use
  // BoxFit.fill — the image covers the page edge-to-edge with no
  // letterbox. The offscreen WebView is mounted at full A4 width
  // (see _render) so nothing is cropped before capture.
  const pxToPt = 72.0 / 96.0;
  final pageFormat = pdfpkg.PdfPageFormat(cssW * pxToPt, cssH * pxToPt);
  final doc = pw.Document();
  doc.addPage(pw.Page(
    pageFormat: pageFormat,
    margin: pw.EdgeInsets.zero,
    build: (_) => pw.Image(pw.MemoryImage(png), fit: pw.BoxFit.fill),
  ));
  return doc.save();
}

/// Android last-resort path: resize the WebView's viewport to the document's full
/// scroll height so the screenshot covers everything, take a PNG of
/// the whole document, then wrap that PNG inside a single PDF page
/// sized to match. Result prints / shares cleanly via the existing
/// `printing` package while keeping pixel parity with the web render.
Future<Uint8List> _screenshotToPdf(InAppWebViewController c) async {
  // Measure the receipt sheet itself (not the whole document) so the page
  // hugs the slip — no A4 white tail. Falls back to the embed container/body.
  final rectRaw = await c.evaluateJavascript(source: '''
    (function() {
      const el = document.getElementById('pos-receipt-sheet')
        || document.querySelector('[data-embed-ready="true"]')
        || document.body;
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height });
    })();
  ''');
  final m = (rectRaw is String)
      ? jsonDecode(rectRaw) as Map<String, dynamic>
      : <String, dynamic>{};
  final x = (m['x'] as num?)?.toDouble() ?? 0.0;
  final y = (m['y'] as num?)?.toDouble() ?? 0.0;
  final w = (m['w'] as num?)?.toDouble() ?? 320.0;
  final h = (m['h'] as num?)?.toDouble() ?? 600.0;

  // Capture only the sheet's rectangle (CSS points). InAppWebViewRect uses the
  // same CSS-point space as getBoundingClientRect.
  Uint8List? png = await c.takeScreenshot(
    screenshotConfiguration: ScreenshotConfiguration(
      rect: InAppWebViewRect(x: x, y: y, width: w, height: h),
    ),
  );
  // Some platforms ignore the rect — fall back to a full capture rather than
  // failing, but still size the PDF page to the sheet so it stays compact.
  png ??= await c.takeScreenshot();
  if (png == null || png.isEmpty) {
    throw Exception('takeScreenshot returned empty bytes');
  }

  // 1 CSS pixel ≈ 0.75 PDF point at 96 DPI. Page = the sheet, no margin.
  const pxToPt = 72.0 / 96.0;
  final pageFormat = pdfpkg.PdfPageFormat(w * pxToPt, h * pxToPt);
  final doc = pw.Document();
  doc.addPage(pw.Page(
    pageFormat: pageFormat,
    margin: pw.EdgeInsets.zero,
    build: (_) => pw.Image(pw.MemoryImage(png!), fit: pw.BoxFit.fill),
  ));
  return doc.save();
}

/// Set this from main.dart's MaterialApp:
///   MaterialApp.router(navigatorKey: appNavigatorKey, ...)
/// Required so the service can mount an offscreen overlay anywhere.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();
