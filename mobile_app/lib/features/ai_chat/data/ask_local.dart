// What the phone keeps between visits: the chosen language and the last
// question list, so the list can show, disabled, while offline. No answer and
// no figure is ever stored.

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AskLocal {
  final FlutterSecureStorage _store;
  const AskLocal([this._store = const FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true))]);

  String _langKey(String userId) => 'ask_lang_$userId';
  String _listKey(String userId, String tenantId, String lang) => 'ask_list_${userId}_${tenantId}_$lang';

  Future<String?> lang(String userId) => _read(_langKey(userId));
  Future<void> setLang(String userId, String lang) => _write(_langKey(userId), lang);

  Future<Map<String, dynamic>?> list(String userId, String tenantId, String lang) async {
    final raw = await _read(_listKey(userId, tenantId, lang));
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// The list without its state and usage, which go stale.
  Future<void> setList(String userId, String tenantId, String lang, Map<String, dynamic> list) =>
      _write(_listKey(userId, tenantId, lang), jsonEncode({...list}..remove('state')..remove('usage')));

  Future<String?> _read(String k) async {
    try {
      return await _store.read(key: k);
    } catch (e) {
      debugPrint('[ask] local read failed: $e');
      return null;
    }
  }

  Future<void> _write(String k, String v) async {
    try {
      await _store.write(key: k, value: v);
    } catch (e) {
      debugPrint('[ask] local write failed: $e');
    }
  }
}
