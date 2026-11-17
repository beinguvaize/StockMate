// The till must open in airplane mode. That needs the last good tenant
// context and business profile on the phone, keyed so one user never sees
// another user's shop.

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/offline_context_cache.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('the tenant context round-trips and parses', () async {
    await OfflineContextCache.saveTenantContext(
      'U1',
      {'id': 'U1', 'email': 'a@b.c', 'name': 'Asha', 'roles': ['OWNER'], 'tenant_id': 'T1'},
      {'id': 'T1', 'name': 'Kirana', 'slug': 'kirana', 'plan': 'PRO', 'status': 'ACTIVE'},
    );
    final raw = await OfflineContextCache.loadTenantContext('U1');
    final u = UserProfile.fromMap(Map<String, dynamic>.from(raw!['user'] as Map));
    final t = Tenant.fromMap(Map<String, dynamic>.from(raw['tenant'] as Map));
    expect(u.tenantId, 'T1');
    expect(u.roles, ['OWNER']);
    expect(t.plan, 'PRO');
  });

  test('another user on the same phone gets nothing', () async {
    await OfflineContextCache.saveTenantContext('U1', {'id': 'U1'}, {'id': 'T1'});
    expect(await OfflineContextCache.loadTenantContext('U2'), isNull);
  });

  test('the business profile keeps tax_mode, so offline checkout totals match', () async {
    await OfflineContextCache.saveBusinessProfile('T1', {'name': 'Kirana', 'tax_mode': 'INCLUSIVE', 'upi_id': 'k@upi'});
    final p = await OfflineContextCache.loadBusinessProfile('T1');
    expect(p!['tax_mode'], 'INCLUSIVE');
    expect(p['upi_id'], 'k@upi');
  });
}
