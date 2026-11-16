// The last good answer to "who am I, which shop, how does it bill", kept on
// the phone so the till opens in airplane mode.
//
// Before this, a cold start with no internet resolved the tenant context to
// null and the app showed "No Business Account" — the cashier could not reach
// the sale screen at all, however much was cached in Drift. The business
// profile had the same hole: offline the checkout fell back to EXCLUSIVE tax,
// so an INCLUSIVE shop's total showed tax added on top of a price that already
// contained it.
//
// Used ONLY when the server cannot be reached. A server that answers "no
// tenant" still wins, so removing a user from a shop is not undone by a cache.
// Keyed by user id, so a different sign-in never sees another user's shop.

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class OfflineContextCache {
  static const _ctxPrefix = 'offline.tenant_ctx.';
  static const _profilePrefix = 'offline.business_profile.';

  static Future<void> saveTenantContext(
      String userId, Map<String, dynamic> user, Map<String, dynamic> tenant) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString('$_ctxPrefix$userId', jsonEncode({'user': user, 'tenant': tenant}));
    } catch (e) {
      debugPrint('[offlineCache] save tenant context failed: $e');
    }
  }

  /// `{user: {...}, tenant: {...}}` or null.
  static Future<Map<String, dynamic>?> loadTenantContext(String userId) async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString('$_ctxPrefix$userId');
      if (raw == null) return null;
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (e) {
      debugPrint('[offlineCache] load tenant context failed: $e');
      return null;
    }
  }

  static Future<void> saveBusinessProfile(String tenantId, Map<String, dynamic> row) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString('$_profilePrefix$tenantId', jsonEncode(row));
    } catch (e) {
      debugPrint('[offlineCache] save business profile failed: $e');
    }
  }

  static Future<Map<String, dynamic>?> loadBusinessProfile(String tenantId) async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString('$_profilePrefix$tenantId');
      if (raw == null) return null;
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (e) {
      debugPrint('[offlineCache] load business profile failed: $e');
      return null;
    }
  }
}
