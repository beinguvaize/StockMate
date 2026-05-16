// Supabase realtime subscriptions — keeps providers fresh when another
// device / web user mutates rows. One channel per tenant; lifecycle bound
// to the tenant being resolved.
//
// On INSERT/UPDATE/DELETE for a watched table we invalidate the matching
// Riverpod provider so the next watch re-fetches.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/sales/presentation/providers/sales_provider.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/crm_provider.dart';
import 'package:mobile_app/features/finance/presentation/providers/finance_provider.dart';
import 'package:mobile_app/features/dashboard/presentation/providers/telemetry_provider.dart';

class RealtimeSync {
  RealtimeChannel? _channel;
  String? _tenantId;

  void start(String tenantId, WidgetRef ref) {
    if (_tenantId == tenantId && _channel != null) return;
    stop();
    _tenantId = tenantId;

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
  }

  void stop() {
    if (_channel != null) {
      supabase.removeChannel(_channel!);
      _channel = null;
    }
    _tenantId = null;
  }
}

/// Provider exposing a single long-lived RealtimeSync instance.
final realtimeSyncProvider = Provider<RealtimeSync>((ref) {
  final svc = RealtimeSync();
  ref.onDispose(svc.stop);
  return svc;
});
