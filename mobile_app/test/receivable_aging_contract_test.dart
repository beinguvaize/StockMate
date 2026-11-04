// Conformance with the shared receivable-aging contract.
//
// The cases live in shared/fixtures/receivable_aging.json, and the web suite
// (src/lib/receivableAging.test.js) runs the same file. Add a case to the
// JSON, not here, so both surfaces are held to it.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/clients_suppliers/data/receivable_aging.dart';

void main() {
  // flutter test runs with the package root (mobile_app/) as cwd.
  final fx = jsonDecode(File('../shared/fixtures/receivable_aging.json').readAsStringSync())
      as Map<String, dynamic>;

  List<Map<String, dynamic>> section(String name) {
    final s = fx[name];
    if (s is! List || s.isEmpty) throw StateError('fixture section "$name" is missing or empty');
    return s.cast<Map<String, dynamic>>();
  }

  String fmt(num n) => 'Rs ${n.toStringAsFixed(2)}';

  group('ageBucket', () {
    for (final c in section('ageBucket')) {
      test('${c['days']} days', () => expect(ageBucket(c['days'] as int), c['expect']));
    }
  });

  group('daysUnpaid', () {
    for (final c in section('daysUnpaid')) {
      test('${c['sale_date']}', () {
        expect(daysUnpaid(c['sale_date'], c['today'] as String), c['expect']);
      });
    }
  });

  group('buildAging', () {
    for (final c in section('buildAging')) {
      test(c['name'] as String, () {
        final a = buildAging(
          (c['unpaid'] as List).cast<Map<String, dynamic>>(),
          (c['clients'] as List).map((e) => (e as Map)['outstanding_balance']),
          c['today'] as String,
        );
        final e = c['expect'] as Map<String, dynamic>;
        if (e.containsKey('customers')) {
          expect([for (final x in a.customers) [x.clientName, x.total, x.bills, x.oldest]], e['customers']);
        }
        if (e.containsKey('bill_order')) {
          expect(a.bills.map((b) => b.saleId).toList(), e['bill_order']);
        }
        if (e.containsKey('totals')) expect(a.totals, e['totals']);
        if (e.containsKey('total')) expect(a.total, e['total']);
        if (e.containsKey('over30')) expect(a.over30, e['over30']);
        if (e.containsKey('over90')) expect(a.over90, e['over90']);
        if (e.containsKey('outstanding')) expect(a.outstanding, e['outstanding']);
        if (e.containsKey('difference')) expect(a.difference, e['difference']);
        if (e.containsKey('tie_out_line')) expect(tieOutLine(a, fmt), e['tie_out_line']);
      });
    }
  });

  test('a row with no readable date fails the load', () {
    expect(
      () => buildAging([{'sale_id': 'S', 'unpaid': 1, 'sale_date': null}], const [], '2026-11-04'),
      throwsFormatException,
    );
  });

  group('fetchAllPages', () {
    test('keeps reading past the first 1000 rows', () async {
      final calls = <int>[];
      final rows = await fetchAllPages((from, to) async {
        calls.add(from);
        return List.generate(from == 0 ? agingPageSize : 3, (i) => {'n': i});
      });
      expect(calls, [0, agingPageSize]);
      expect(rows.length, agingPageSize + 3);
    });

    test('refuses a partial read rather than total it', () async {
      expect(
        fetchAllPages((from, to) async => List.generate(agingPageSize, (i) => {'n': i})),
        throwsStateError,
      );
    });
  });
}
