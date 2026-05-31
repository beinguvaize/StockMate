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

class WebPrintService {
  // Base URL of the web app. Same env switch as the supabase client —
  // dev tenants print from the dev frontend, prod from prod.
  static const String _baseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'https://ledgrpro-prod.vercel.app',
  );

  static Future<Uint8List?> renderReceiptPdf(String saleId, {double? tendered}) {
    final extra = tendered != null ? '?tendered=${tendered.toStringAsFixed(2)}' : '';
    return _render('/embed/receipt/$saleId$extra');
  }

  static Future<Uint8List?> renderInvoicePdf(String invoiceId) {
    return _render('/embed/invoice/$invoiceId');
  }

  static Future<Uint8List?> _render(String path) async {
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
    // Offscreen overlay: 0×0 widget, mount briefly, dispose after.
    final entry = OverlayEntry(builder: (_) => SizedBox.shrink(child: InAppWebView(
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
            final bytes = await c.createPdf(
              pdfConfiguration: PDFConfiguration(),
            );
            if (bytes == null || bytes.isEmpty) {
              throw Exception('createPdf returned empty bytes');
            }
            if (!completer.isCompleted) completer.complete(bytes);
          } catch (e) {
            if (!completer.isCompleted) completer.completeError(e);
          }
        }
      },
    )));

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

/// Set this from main.dart's MaterialApp:
///   MaterialApp.router(navigatorKey: appNavigatorKey, ...)
/// Required so the service can mount an offscreen overlay anywhere.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();
