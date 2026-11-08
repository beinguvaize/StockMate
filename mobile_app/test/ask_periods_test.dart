// A tap on an Ask answer must not land on a different number. Dated screens
// open on the answer's own period; a screen that cannot show the same figure
// gets no link on the phone.

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/features/ai_chat/presentation/ask_routes.dart';
import 'package:mobile_app/features/reports/data/report_params.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/sales_summary_screen.dart';

// The web's DATED set in src/lib/askFormat.js: screens that take the period.
const _datedOnWeb = {
  'reports_daily_sales', 'reports_financials', 'reports_product_sales', 'reports_gstr3b', 'reports_purchase_register',
};

const _ctx = TenantContext(
  userProfile: UserProfile(id: 'u1', email: 'o@example.com', name: 'O', roles: ['OWNER'], tenantId: 't1'),
  tenant: Tenant(id: 't1', name: 'Demo', slug: 'demo', plan: 'GROWTH', status: 'ACTIVE'),
);

void main() {
  final registry = jsonDecode(File('../shared/ai_chat/questions.json').readAsStringSync()) as Map<String, dynamic>;

  test('the web dated set matches the source', () {
    final src = File('../src/lib/askFormat.js').readAsStringSync();
    final m = RegExp(r'const DATED = new Set\(\[([^\]]*)\]\)').firstMatch(src)!;
    expect(RegExp(r"'([a-z_0-9]+)'").allMatches(m[1]!).map((x) => x[1]).toSet(), _datedOnWeb);
  });

  test('every dated screen a phone link can reach opens on the answer\'s dates', () {
    const params = {'from': '2026-11-01', 'to': '2026-11-18'};
    for (final q in (registry['questions'] as List).cast<Map<String, dynamic>>()) {
      final s = q['screen'] as Map<String, dynamic>;
      for (final key in [s['key'], s['fallback_key']].whereType<String>()) {
        if (!_datedOnWeb.contains(key)) continue;
        final mobileKey = askMobileKey({'key': key, 'mobile': s['mobile']});
        if (mobileKey == null) continue; // no phone link: nothing to land on
        final w = askScreens[mobileKey]!(params);
        expect(w, isA<SalesSummaryScreen>(), reason: '${q['id']} links to $key without a period');
        final r = (w as SalesSummaryScreen).initialRange!;
        expect([r.start, r.end], [DateTime(2026, 11, 1), DateTime(2026, 11, 18)]);
      }
    }
  });

  test('which questions lose their phone link, and why', () {
    final dropped = [
      for (final q in (registry['questions'] as List).cast<Map<String, dynamic>>())
        if ((q['screen'] as Map)['mobile'] == true &&
            askMobileKey({'key': (q['screen'] as Map)['key'], 'mobile': true}) == null)
          q['id'],
    ];
    expect(dropped, ['gst_collected']);
    expect(askDroppedScreens.keys, ['reports_gstr3b']);
  });

  test('a missing or unreadable period opens the screen\'s own default', () {
    expect(askPeriod(null), isNull);
    expect(askPeriod({'from': '2026-11-18'}), isNull);
    expect(askPeriod({'from': '2026-11-18', 'to': '2026-11-01'}), isNull);
    expect(askPeriod({'from': 'x', 'to': 'y'}), isNull);
    expect((askScreens['reports_daily_sales']!(null) as SalesSummaryScreen).initialRange, isNull);
  });

  Future<List<ReportParams>> pumpSummary(WidgetTester t, Widget screen) async {
    final seen = <ReportParams>[];
    await t.pumpWidget(ProviderScope(
      overrides: [
        tenantContextProvider.overrideWith((ref) async => _ctx),
        reportSalesProvider.overrideWith((ref, p) async {
          seen.add(p);
          return const <Map<String, dynamic>>[];
        }),
      ],
      child: MaterialApp(home: screen),
    ));
    await t.pump();
    await t.pump();
    return seen;
  }

  testWidgets('Sales Summary reads the linked day, not the last 30 days', (t) async {
    final seen = await pumpSummary(t, askScreens['reports_daily_sales']!({'from': '2026-11-18', 'to': '2026-11-18'}));
    expect(seen.last.fromIso, '2026-11-18');
    expect(seen.last.toIso, '2026-11-18');
  });

  testWidgets('opened without a link, it keeps its 30-day default', (t) async {
    final seen = await pumpSummary(t, const SalesSummaryScreen());
    final now = DateTime.now();
    expect(seen.last.toIso, ReportParams(tenantId: 't', from: now, to: now).toIso);
    expect(seen.last.fromIso,
        ReportParams(tenantId: 't', from: now.subtract(const Duration(days: 30)), to: now).fromIso);
  });
}
