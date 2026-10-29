// Conformance with the shared recurring-expense contract.
//
// The cases live in shared/fixtures/recurring.json, next to the web code that
// must pass the same file (src/lib/recurring.js). The first cases there mirror
// src/lib/recurring.test.js one for one. Add a case to the JSON, not here, so
// both surfaces are held to it.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/finance/data/recurring.dart';

Map<String, dynamic> _fixtures() {
  // flutter test runs with the package root (mobile_app/) as cwd.
  final f = File('../shared/fixtures/recurring.json');
  return jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
}

void main() {
  final fx = _fixtures();
  final describeCases = (fx['describe'] as List).cast<Map<String, dynamic>>();
  final templateCases = (fx['templateFor'] as List).cast<Map<String, dynamic>>();

  test('the fixture file is not empty (a missing file must fail, not pass)', () {
    expect(describeCases.length, greaterThanOrEqualTo(7));
    expect(templateCases.length, greaterThanOrEqualTo(4));
  });

  group('describeRecurring', () {
    for (final c in describeCases) {
      final input = c['input'] as Map<String, dynamic>;
      test('${jsonEncode(input)} -> ${c['expect']}', () {
        expect(describeRecurringRow(input), c['expect']);
      });
    }
  });

  group('recurringTemplateFor', () {
    for (final c in templateCases) {
      final input = c['input'] as Map<String, dynamic>;
      test(jsonEncode(input), () {
        final got = recurringTemplateFor(
          frequency: input['frequency'] as String,
          weekdays: input['weekdays'] as List?,
          date: input['date'] as String?,
          today: input['today'] as String,
        );
        (c['expect'] as Map<String, dynamic>).forEach((k, v) {
          expect(got.containsKey(k), isTrue, reason: 'missing key $k');
          expect(got[k], v, reason: 'key $k');
        });
      });
    }
  });

  group('recurringTemplateRow', () {
    test('writes the same columns as the web addRecurringTemplate', () {
      final row = recurringTemplateRow(
        id: 'RET-x', tenantId: 't1', note: 'Tea', amount: 120,
        category: 'Food', paymentMethod: 'CASH', frequency: 'DAILY',
        weekdays: {6, 1, 2, 3, 4, 5}, date: '2026-10-28', today: '2026-10-28',
      );
      expect(row.keys.toSet(), {
        'id', 'tenant_id', 'note', 'amount', 'category', 'payment_method',
        'frequency', 'weekdays', 'day_of_month', 'start_date', 'last_generated',
        'active',
      });
      expect(row['weekdays'], [1, 2, 3, 4, 5, 6]); // a Set from the chips, sorted
      expect(row['active'], isTrue);
      expect(describeRecurringRow(row), 'Every day except Sun');
    });
  });

  group('todayIst', () {
    test('is the IST date, not the phone date', () {
      // 20:00 UTC on the 27th is 01:30 on the 28th in India.
      expect(todayIst(DateTime.utc(2026, 10, 27, 20, 0)), '2026-10-28');
      expect(todayIst(DateTime.utc(2026, 10, 27, 18, 29)), '2026-10-27');
    });
  });
}
