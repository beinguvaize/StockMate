// Supabase realtime subscriptions — keeps providers fresh when another
// device / web user mutates rows. One channel per tenant; lifecycle bound
// to the tenant being resolved.
//
// On INSERT/UPDATE/DELETE for a watched table we invalidate the matching
// Riverpod provider so the next watch re-fetches.

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/auth/data/auth_provider.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';

class RealtimeSync {
  RealtimeSync(this._ref);

  /// The PROVIDER's ref, which lives exactly as long as this object does.
  ///
  /// This used to be the WidgetRef of whichever screen called [start]. That
  /// screen is the tenant gate, and the gate is disposed whenever the app
  /// shows anything else in its place — after which every invalidation threw
  /// "Cannot use ref after the widget was disposed". The throw was caught and
  /// logged, so nothing crashed; live refresh simply stopped. And because
  /// [start] returns early for a tenant it is already running for, the gate
  /// coming back did not replace the dead ref: it stayed broken until the app
  /// was restarted.
  final Ref _ref;

  RealtimeChannel? _channel;
  String?          _tenantId;
  Timer?           _backstopTimer;

  /// Cellular networks regularly drop the websocket, so realtime events
  /// can be missed. This timer re-invalidates the key providers every
  /// 60s as a safety net — the user sees fresh data without having to
  /// back out of the current screen and return.
  static const Duration _backstopInterval = Duration(seconds: 60);

  void start(String tenantId) {
    if (_tenantId == tenantId && _channel != null) return;
    stop();
    _tenantId = tenantId;
    final ref = _ref;

    final channel = supabase.channel('tenant-realtime-$tenantId');

    void on(String table, void Function() onChange) {
      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: table,
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'tenant_id',
          value: tenantId,
        ),
        callback: (payload) {
          debugPrint('[realtime] $table ${payload.eventType.name}');
          try { onChange(); } catch (e) { debugPrint('[realtime] invalidate error: $e'); }
        },
      );
    }

    on('sales', () {
      ref.invalidate(recentSalesProvider);
      ref.invalidate(telemetryProvider);
    });
    on('invoices', () {
      // invoicesProvider lives inside invoices_screen.dart — invalidate via name lookup
      // but it's a top-level provider so we use it directly when known.
      // Best-effort: invalidate the telemetry which reads invoices indirectly.
      ref.invalidate(telemetryProvider);
    });
    on('products', () {
      ref.invalidate(productsProvider);
    });
    on('clients', () {
      ref.invalidate(clientsProvider);
    });
    on('expenses', () {
      ref.invalidate(expensesProvider);
      ref.invalidate(telemetryProvider);
    });
    on('purchases', () {
      ref.invalidate(telemetryProvider);
    });

    channel.subscribe((status, error) {
      debugPrint('[realtime] channel status=$status error=$error');
    });

    _channel = channel;

    // Backstop poll — invalidates every 60s in case the websocket dropped
    // and missed events. Cheap (no network until something `watch`es).
    _backstopTimer?.cancel();
    _backstopTimer = Timer.periodic(_backstopInterval, (_) => refreshAll());
  }

  /// Force-refresh every provider the channel watches. Safe to call from
  /// pull-to-refresh handlers and app-lifecycle resume.
  void refreshAll() {
    // Nothing is being watched until a tenant has been started.
    if (_tenantId == null) return;
    try {
      _ref.invalidate(productsProvider);
      _ref.invalidate(clientsProvider);
      _ref.invalidate(recentSalesProvider);
      _ref.invalidate(expensesProvider);
      _ref.invalidate(telemetryProvider);
    } catch (e) {
      debugPrint('[realtime] refreshAll error: $e');
    }
  }

  void stop() {
    _backstopTimer?.cancel();
    _backstopTimer = null;
    if (_channel != null) {
      supabase.removeChannel(_channel!);
      _channel = null;
    }
    _tenantId = null;
  }
}

/// Provider exposing a single long-lived RealtimeSync instance.
final realtimeSyncProvider = Provider<RealtimeSync>((ref) {
  final svc = RealtimeSync(ref);
  // Signing out ends the subscription. Nothing did before, so the channel for
  // the shop just left stayed open with its 60s timer running; and a sign-in
  // to the same shop then found it "already running" and never restarted it.
  ref.listen<String?>(userIdProvider, (previous, next) {
    if (next == null) svc.stop();
  });
  ref.onDispose(svc.stop);
  return svc;
});
