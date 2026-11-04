// The inventory write gate on mobile is the same matrix the web app's
// hasPermission('inventory', action) applies. The products RLS policies carry
// no role dimension, so until they do, this gate is what keeps a STAFF user
// off Add Product, Edit, Adjust Stock and Delete — on both apps. These pin the
// role rows so the two copies cannot drift apart unnoticed.

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';

void main() {
  group('inventory writes', () {
    test('STAFF may view inventory but not write to it', () {
      expect(hasModulePermission('inventory', 'view', roles: ['STAFF']), isTrue);
      for (final action in ['create', 'edit', 'delete']) {
        expect(canEdit('inventory', roles: ['STAFF'], action: action), isFalse,
            reason: 'STAFF must not get $action on inventory');
      }
    });

    test('STAFF keeps its own write modules', () {
      expect(canEdit('sales', roles: ['STAFF']), isTrue);
      expect(canEdit('clients', roles: ['STAFF']), isTrue);
      expect(canEdit('daybook', roles: ['STAFF']), isTrue);
    });

    test('the INVENTORY role writes inventory', () {
      for (final action in ['create', 'edit', 'delete']) {
        expect(canEdit('inventory', roles: ['INVENTORY'], action: action), isTrue);
      }
      expect(canEdit('sales', roles: ['INVENTORY']), isFalse);
    });

    test('OWNER and GLOBAL_ADMIN write everything', () {
      for (final role in ['OWNER', 'GLOBAL_ADMIN']) {
        for (final action in ['create', 'edit', 'delete']) {
          expect(canEdit('inventory', roles: [role], action: action), isTrue);
        }
      }
    });

    test('SALES and DRIVER get no inventory write', () {
      expect(canEdit('inventory', roles: ['SALES']), isFalse);
      expect(canEdit('inventory', roles: ['DRIVER']), isFalse);
    });

    test('a CUSTOM role is answered per verb, not per module', () {
      const perms = {
        'inventory': {'view': true, 'edit': true, 'create': false, 'delete': false},
      };
      expect(canEdit('inventory', roles: ['CUSTOM'], permissions: perms), isTrue);
      expect(
          canEdit('inventory',
              roles: ['CUSTOM'], permissions: perms, action: 'create'),
          isFalse);
      expect(
          canEdit('inventory',
              roles: ['CUSTOM'], permissions: perms, action: 'delete'),
          isFalse);
    });

    test('no role at all writes nothing', () {
      expect(canEdit('inventory', roles: const []), isFalse);
    });
  });
}
