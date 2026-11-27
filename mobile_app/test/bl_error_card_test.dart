// The outcome card: one headline per outcome, the code chip, no raw text on
// the card, the raw text only in Details, and exactly the agreed copy text.

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/errors/bl_error_card.dart';
import 'package:mobile_app/core/errors/error_codes.dart';
import 'package:mobile_app/core/errors/error_report.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const tenant = '3f9c2a71-5b0e-4d8a-9e61-0c7d2b4f8a15';
const rawAirplane =
    "AuthRetryableFetchException(message: ClientException with SocketException: "
    "Failed host lookup: 'example.supabase.co' (OS Error: No address associated "
    "with hostname, errno = 7), uri=https://example.supabase.co/auth/v1/token?"
    "grant_type=refresh_token, statusCode: null)";

ErrorReport rep(Object e) => ErrorReport(
      result: classifyError(e),
      reference: 'K7QM4XRT',
      at: DateTime.utc(2026, 11, 27, 10, 12),
      screen: 'Collect Payment',
      action: 'Record payment',
      appVersion: '1.7.36 (154)',
      platform: 'android',
      tenantId: tenant,
      userId: null,
      raw: e.toString(),
    );

void main() {
  Future<void> pump(WidgetTester t, ErrorReport r, {String? kept}) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(14),
          child: BlErrorCard(
            report: r,
            message: plainMessage(r.result, noun: 'payment', checkWhere: "the client's payments"),
            keptLine: kept,
            actions: [BlErrorAction('Got it', onTap: () {}, primary: true)],
          ),
        ),
      ),
    ));
    await t.pump(const Duration(milliseconds: 400));
  }

  testWidgets('Not sent: blue headline, NET-01, kept line, no raw text', (t) async {
    final e = AuthRetryableFetchException(message: rawAirplane.substring(
        'AuthRetryableFetchException(message: '.length, rawAirplane.length - ', statusCode: null)'.length));
    await pump(t, rep(e), kept: '₹1,500, Cash, 27 Nov is kept on screen');
    expect(find.text('Not sent'), findsOneWidget);
    expect(find.text('NET-01'), findsOneWidget);
    expect(find.text('₹1,500, Cash, 27 Nov is kept on screen'), findsOneWidget);
    expect(find.textContaining('SocketException'), findsNothing);
    expect(find.textContaining('Your phone is offline'), findsOneWidget);
  });

  testWidgets('May have saved: amber headline and the check advice', (t) async {
    await pump(t, rep(TimeoutException('x')), kept: '₹1,500 is kept on screen');
    expect(find.text('May have saved'), findsOneWidget);
    expect(find.text('NET-03'), findsOneWidget);
    expect(find.textContaining('so it is not recorded twice'), findsOneWidget);
    expect(find.textContaining('TimeoutException'), findsNothing);
  });

  testWidgets('Not saved: red headline, no kept line', (t) async {
    await pump(
        t,
        rep(const PostgrestException(
            message: 'new row violates row-level security policy', code: '42501')),
        kept: 'kept');
    expect(find.text('Not saved'), findsOneWidget);
    expect(find.text('DB-02'), findsOneWidget);
    expect(find.text('kept'), findsNothing);
    expect(find.textContaining('row-level security'), findsNothing);
  });

  testWidgets('Details shows the raw text; Copy for support copies the agreed text',
      (t) async {
    String? copied;
    t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform,
        (call) async {
      if (call.method == 'Clipboard.setData') {
        copied = (call.arguments as Map)['text'] as String;
      }
      return null;
    });
    addTearDown(() => t.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null));

    final e = const SocketException('Failed host lookup: example.supabase.co',
        osError: OSError('No address associated with hostname', 7));
    final r = rep(e);
    await pump(t, r);
    await t.tap(find.byKey(const Key('bl-error-details')));
    await t.pumpAndSettle();

    expect(find.byKey(const Key('bl-error-sheet')), findsOneWidget);
    expect(find.text('K7QM4XRT'), findsOneWidget);
    expect(find.text('27 Nov 2026, 3:42 pm IST'), findsOneWidget);
    expect(find.text('Collect Payment / Record payment'), findsOneWidget);
    expect(find.text('Phone 1.7.36 (154)'), findsOneWidget);
    expect(find.text('3f9c2a71…8a15'), findsOneWidget);
    expect(find.textContaining('Failed host lookup'), findsOneWidget);

    await t.ensureVisible(find.byKey(const Key('bl-error-copy')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('bl-error-copy')));
    await t.pump();
    expect(copied, '''bookledger error NET-01 · Not sent
Reference: K7QM4XRT
Time: 27 Nov 2026, 3:42 pm IST
Action: Collect Payment / Record payment
App: phone 1.7.36 (154)
Shop id: $tenant
Raw: ${r.raw}''');
    expect(copied, isNot(contains('₹')));
    expect(find.text('Copied'), findsOneWidget);
  });

  testWidgets('reduced motion: the card is fully shown on the first frame', (t) async {
    await t.pumpWidget(MediaQuery(
      data: const MediaQueryData(disableAnimations: true),
      child: MaterialApp(
        home: Scaffold(
          body: BlErrorCard(
            report: rep(TimeoutException('x')),
            message: 'm',
            actions: const [],
          ),
        ),
      ),
    ));
    await t.pump(const Duration(milliseconds: 20));
    final op = t.widget<Opacity>(find
        .ancestor(of: find.byKey(const Key('bl-error-card')), matching: find.byType(Opacity))
        .first);
    expect(op.opacity, 1);
  });
}
