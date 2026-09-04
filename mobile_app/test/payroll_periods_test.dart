import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/utils/payroll_periods.dart';

/// Mirrors src/lib/payrollPeriods.test.js. The two implementations have to
/// agree: a run made on the desktop must block the same window on the phone,
/// and the phone writes only months while the desktop writes ranges too.
void main() {
  // The live FUTURE DISPO run: 1-8 Aug, Rs 7,200, processed 8 Aug.
  final live = <Map<String, dynamic>>[
    {
      'id': '2f16ed07',
      'period': '2026-08-01/2026-08-08',
      'total_net': 7200,
      'deleted_at': null,
    },
  ];

  group('parsePeriod', () {
    test('reads a date range', () {
      final p = parsePeriod('2026-08-01/2026-08-08')!;
      expect(p.from, '2026-08-01');
      expect(p.to, '2026-08-08');
    });

    test('expands a month to its real last day', () {
      expect(parsePeriod('2026-08')!.to, '2026-08-31');
      expect(parsePeriod('2026-02')!.to, '2026-02-28');
      expect(parsePeriod('2028-02')!.to, '2028-02-29');
    });

    test('straightens a reversed range', () {
      final p = parsePeriod('2026-08-08/2026-08-01')!;
      expect(p.from, '2026-08-01');
      expect(p.to, '2026-08-08');
    });

    test('returns null for anything unreadable, never a guess', () {
      for (final bad in ['', null, 'August', '2026-13', '2026-08-01/']) {
        expect(parsePeriod(bad), isNull, reason: 'input: $bad');
      }
    });
  });

  group('overlaps', () {
    test('catches a month against a range inside it', () {
      // The case a string compare misses: '2026-08' vs '2026-08-01/2026-08-08'.
      expect(overlaps(parsePeriod('2026-08'), parsePeriod('2026-08-01/2026-08-08')), isTrue);
    });

    test('is inclusive at the boundary', () {
      final aug1to8 = parsePeriod('2026-08-01/2026-08-08');
      expect(overlaps(aug1to8, parsePeriod('2026-07-25/2026-08-01')), isTrue);
      expect(overlaps(aug1to8, parsePeriod('2026-08-08/2026-08-15')), isTrue);
    });

    test('does not fire on periods that merely touch end to end', () {
      final aug1to8 = parsePeriod('2026-08-01/2026-08-08');
      expect(overlaps(aug1to8, parsePeriod('2026-07-24/2026-07-31')), isFalse);
      expect(overlaps(aug1to8, parsePeriod('2026-08-09/2026-08-16')), isFalse);
    });
  });

  group('findOverlappingRuns — the live desktop run', () {
    test('blocks an August run made on the phone', () {
      // The whole point of the shared rule: mobile writes 'YYYY-MM', the run it
      // must not duplicate was written as a range by the desktop.
      final hits = findOverlappingRuns('2026-08', live);
      expect(hits, hasLength(1));
      expect(hits.first['total_net'], 7200);
    });

    test('lets September through', () {
      expect(findOverlappingRuns('2026-09', live), isEmpty);
    });

    test('ignores a reversed run', () {
      final deleted = [
        {...live.first, 'deleted_at': '2026-08-09T00:00:00Z'}
      ];
      expect(findOverlappingRuns('2026-08', deleted), isEmpty);
    });

    test('excludes the run being edited', () {
      expect(findOverlappingRuns('2026-08', live, excludeId: '2f16ed07'), isEmpty);
    });

    test('treats an unreadable stored period as overlapping, not as clear', () {
      final odd = [
        {'id': 'x', 'period': 'August 2026', 'deleted_at': null}
      ];
      expect(findOverlappingRuns('2026-08', odd), hasLength(1));
    });

    test('returns nothing when the requested period is unreadable', () {
      expect(findOverlappingRuns('', live), isEmpty);
    });
  });

  group('describePeriod', () {
    test('names a range and a month the way the warning reads them', () {
      expect(describePeriod('2026-08-01/2026-08-08'), '1 Aug – 8 Aug');
      expect(describePeriod('2026-08'), 'August 2026');
    });

    test('collapses a single-day range', () {
      expect(describePeriod('2026-08-08/2026-08-08'), '8 Aug');
    });

    test('returns unreadable input unchanged', () {
      expect(describePeriod('whenever'), 'whenever');
    });
  });
}
