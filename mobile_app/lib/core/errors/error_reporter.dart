// Sends every shown error to platform_error_logs, without ever getting in the
// shopkeeper's way.
//
//   * fire-and-forget: report() returns at once and never throws
//   * offline or refused: the row stays in a small local queue (cap 50, the
//     oldest dropped first) and goes on the next report or reconnect
//   * a failure to log is logged locally only (debugPrint), never reported,
//     so there is no loop
//   * the phone may ship before the migration that adds reference_id and the
//     INSERT policy: until then every insert is refused, quietly, and the
//     queue stays capped
//
// A queued row may be sent twice (a lost reply). reference_id is unique on the
// server, so a duplicate answers 23505 and is dropped as already delivered.

import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show PostgrestException, Supabase;

import 'package:mobile_app/core/errors/error_report.dart';

/// Where queued rows wait. SharedPreferences on the phone, memory in tests.
abstract class ErrorQueueStore {
  Future<List<String>> load();
  Future<void> save(List<String> rows);
}

class PrefsErrorQueueStore implements ErrorQueueStore {
  static const key = 'bl_error_log_queue_v1';
  @override
  Future<List<String>> load() async =>
      (await SharedPreferences.getInstance()).getStringList(key) ?? const [];
  @override
  Future<void> save(List<String> rows) async =>
      (await SharedPreferences.getInstance()).setStringList(key, rows);
}

class MemoryErrorQueueStore implements ErrorQueueStore {
  List<String> rows = [];
  @override
  Future<List<String>> load() async => List.of(rows);
  @override
  Future<void> save(List<String> r) async => rows = List.of(r);
}

typedef ErrorRowSink = Future<void> Function(Map<String, dynamic> row);

Future<void> _supabaseInsert(Map<String, dynamic> row) => Supabase
    .instance.client
    .from('platform_error_logs')
    .insert(row)
    .timeout(const Duration(seconds: 8));

class ErrorReporter {
  static const int cap = 50;

  final ErrorQueueStore store;
  final ErrorRowSink sink;
  ErrorReporter({ErrorQueueStore? store, ErrorRowSink? sink})
      : store = store ?? PrefsErrorQueueStore(),
        sink = sink ?? _supabaseInsert;

  static ErrorReporter instance = ErrorReporter();

  Future<void>? _flushing;
  StreamSubscription<dynamic>? _online;

  /// Flush whenever the phone comes back online. Called once from main().
  void start() {
    try {
      _online ??= Connectivity().onConnectivityChanged.listen((r) {
        if (r != ConnectivityResult.none) unawaited(flush());
      });
      unawaited(flush());
    } catch (e) {
      debugPrint('[error-log] could not watch connectivity: $e');
    }
  }

  /// Queue [r] and try to send. Returns at once; never throws.
  void report(ErrorReport r) {
    unawaited(_reportSafely(r));
  }

  /// The same as [report], awaitable for tests.
  Future<void> reportAndWait(ErrorReport r) => _reportSafely(r);

  Future<void> _reportSafely(ErrorReport r) async {
    try {
      await _enqueue(jsonEncode(r.toRow()));
      await flush();
    } catch (e) {
      debugPrint('[error-log] could not queue ${r.reference}: $e');
    }
  }

  // Every load-then-save runs one at a time, so a row queued while a flush
  // is dropping the one it sent is not lost.
  Future<void> _lock = Future.value();
  Future<T> _locked<T>(Future<T> Function() f) {
    final run = _lock.then((_) => f());
    _lock = run.then((_) {}, onError: (_) {});
    return run;
  }

  Future<void> _enqueue(String row) => _locked(() async {
        final rows = [...await store.load(), row];
        final kept = rows.length > cap ? rows.sublist(rows.length - cap) : rows;
        await store.save(kept);
      });

  /// Send queued rows oldest first; stop at the first one that will not go.
  /// Never throws. Concurrent calls share one run.
  Future<void> flush() => _flushing ??= _flush().whenComplete(() => _flushing = null);

  Future<void> _flush() async {
    try {
      while (true) {
        final rows = await store.load();
        if (rows.isEmpty) return;
        final head = rows.first;
        Map<String, dynamic> row;
        try {
          row = (jsonDecode(head) as Map).cast<String, dynamic>();
        } catch (_) {
          await _dropHead(head); // unreadable: never sendable
          continue;
        }
        try {
          await sink(row);
        } on PostgrestException catch (e) {
          if (e.code == '23505') {
            await _dropHead(head); // already on the server
            continue;
          }
          debugPrint('[error-log] insert refused (kept, ${rows.length} queued): '
              '${e.code} ${e.message}');
          return;
        } catch (e) {
          debugPrint('[error-log] insert failed (kept, ${rows.length} queued): $e');
          return;
        }
        await _dropHead(head);
      }
    } catch (e) {
      debugPrint('[error-log] flush stopped: $e');
    }
  }

  Future<void> _dropHead(String head) => _locked(() async {
        final rows = List.of(await store.load())..remove(head);
        await store.save(rows);
      });
}
