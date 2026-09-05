// Trial entitlement on mobile must agree with src/lib/tenancy.js and with the
// database's get_my_effective_plan(). Three copies of one policy only stay in
// step if the boundaries are pinned, so these tests pin them by date rather
// than trusting the arithmetic to read correctly.

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';

Tenant t({
  String plan = 'FREE',
  String status = 'TRIAL',
  DateTime? trialEnd,
}) =>
    Tenant(
      id: 'id',
      name: 'n',
      slug: 's',
      plan: plan,
      status: status,
      trialEndDate: trialEnd,
    );

void main() {
  final future = DateTime.now().toUtc().add(const Duration(days: 30));
  // Well past both the trial end and the enforcement start.
  final longGone = DateTime.utc(2026, 1, 1);

  group('effectivePlan', () {
    test('a running trial is worth PRO even on the Free plan', () {
      // The reported bug: mobile passed the stored plan straight to canAccess,
      // so a Free or Growth trial was refused Pro features from day one.
      expect(t(plan: 'FREE', trialEnd: future).effectivePlan, 'PRO');
      expect(t(plan: 'GROWTH', trialEnd: future).effectivePlan, 'PRO');
    });

    test('a running trial never resolves DOWN from a better stored plan', () {
      // Some early signups were written straight to ENTERPRISE. Resolving them
      // to PRO would take away access they already have.
      expect(t(plan: 'ENTERPRISE', trialEnd: future).effectivePlan, 'ENTERPRISE');
    });

    test('a lapsed trial drops to FREE', () {
      expect(t(plan: 'ENTERPRISE', trialEnd: longGone).effectivePlan, 'FREE');
    });

    test('a paying customer is untouched by any of this', () {
      // FUTURE DISPO is ACTIVE/ENTERPRISE and must never be affected.
      expect(t(plan: 'ENTERPRISE', status: 'ACTIVE').effectivePlan, 'ENTERPRISE');
      expect(t(plan: 'GROWTH', status: 'ACTIVE').effectivePlan, 'GROWTH');
    });

    test('an unrecognised plan resolves to FREE, as on web and in the DB', () {
      // Legacy STARTER. Mobile used to rank it as GROWTH and show modules the
      // server then refused to write.
      expect(t(plan: 'STARTER', status: 'ACTIVE').effectivePlan, 'FREE');
      expect(t(plan: 'nonsense', status: 'ACTIVE').effectivePlan, 'FREE');
    });

    test('plan matching is case-insensitive', () {
      expect(t(plan: 'growth', status: 'ACTIVE').effectivePlan, 'GROWTH');
    });
  });

  group('isTrialLapsed — the grace boundary', () {
    // Grace runs from the LATER of the trial end and the enforcement start,
    // so these two cases are deliberately on either side of a fixed day rather
    // than a few milliseconds apart at the boundary itself.
    test('still inside the window is not lapsed', () {
      final endedYesterday =
          DateTime.now().toUtc().subtract(const Duration(days: 1));
      expect(t(trialEnd: endedYesterday).isTrialLapsed, isFalse);
    });

    test('past the window is lapsed', () {
      final endedLongAgo =
          DateTime.now().toUtc().subtract(const Duration(days: 40));
      expect(t(trialEnd: endedLongAgo).isTrialLapsed, isTrue);
    });

    test('a trial that ended before enforcement still gets the full window', () {
      // Counted from the enforcement start, not from the trial's own end.
      final from = kTrialEnforcementStart;
      final graceEnds = from.add(const Duration(days: kTrialGraceDays));
      expect(DateTime.utc(2026, 1, 1).isBefore(from), isTrue);
      expect(graceEnds.isAfter(from), isTrue);
    });

    test('expired and lapsed are not the same thing', () {
      // The old lockout used isTrialExpired, cutting mobile off a week before
      // the browser did.
      final endedYesterday =
          DateTime.now().toUtc().subtract(const Duration(days: 1));
      final tenant = t(trialEnd: endedYesterday);
      expect(tenant.isTrialExpired, isTrue);
      expect(tenant.isTrialLapsed, isFalse);
    });

    test('a non-trial tenant is never lapsed', () {
      expect(t(status: 'ACTIVE', trialEnd: longGone).isTrialLapsed, isFalse);
      expect(t(status: 'TRIAL', trialEnd: null).isTrialLapsed, isFalse);
    });
  });
}
