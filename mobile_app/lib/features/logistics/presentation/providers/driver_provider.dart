import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/logistics/data/models/route.dart';
import 'package:mobile_app/features/logistics/data/models/route_stop.dart';
import 'package:mobile_app/features/logistics/data/models/van_stock.dart';

// ── Tenant business profile (currency symbol, etc.) ──────────────────────────
final tenantProfileProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final session  = supabase.auth.currentSession;
  final tenantId = session?.user.userMetadata?['tenant_id'] as String?;
  if (tenantId == null) return null;

  final res = await supabase
      .from('business_profile')
      .select('currencySymbol, businessName, country')
      .eq('tenant_id', tenantId)
      .maybeSingle();
  return res;
});

/// Convenience: just the currency symbol, falls back to empty string.
final currencySymbolProvider = Provider<AsyncValue<String>>((ref) {
  return ref.watch(tenantProfileProvider).whenData(
    (profile) => (profile?['currencySymbol'] as String?) ?? '',
  );
});

// ── Active route for the logged-in driver ────────────────────────────────────
// Reads the single ACTIVE route where driver_id = current user.
final activeRouteProvider = StreamProvider<LogisticRoute?>((ref) {
  final userId = supabase.auth.currentUser?.id;
  if (userId == null) return Stream.value(null);

  return supabase
      .from('routes')
      .stream(primaryKey: ['id'])
      .eq('status', 'ACTIVE')
      // NOTE: stream() doesn't support .eq chaining like select().
      // We filter driver_id client-side after.
      .map((rows) {
        // Supabase stream returns snake_case; fall back to camelCase for legacy schemas
        final match = rows.where((r) =>
          (r['driver_id'] ?? r['driverId']) == userId
        ).toList();
        if (match.isEmpty) return null;
        return LogisticRoute.fromJson(match.first);
      });
});

// ── Route stops for active route ─────────────────────────────────────────────
final routeStopsProvider = StreamProvider.family<List<RouteStop>, String>((ref, routeId) {
  return supabase
      .from('route_stops')
      .stream(primaryKey: ['id'])
      .eq('route_id', routeId)
      .order('sequence')
      .map((rows) => rows.map(RouteStop.fromJson).toList());
});

// ── Van stock for active route's vehicle ─────────────────────────────────────
final vanStockProvider = FutureProvider.family<List<VanStockItem>, String>((ref, vehicleId) async {
  // 1. Find inventory_location for this vehicle
  final locRes = await supabase
      .from('inventory_locations')
      .select('id')
      .eq('type', 'VEHICLE')
      .eq('reference_id', vehicleId)
      .maybeSingle();

  if (locRes == null) return [];
  final locationId = locRes['id'] as String;

  // 2. Fetch balances with product name + price
  final balRes = await supabase
      .from('inventory_balances')
      .select('product_id, quantity, location_id, products(name, "sellingPrice")')
      .eq('location_id', locationId)
      .gt('quantity', 0);

  return (balRes as List).map((r) => VanStockItem.fromJson(r)).toList();
});

// ── Update a stop status ──────────────────────────────────────────────────────
Future<void> updateStopStatus(
  String stopId,
  String status, {
  double? cashCollected,
  String? notes,
  String? tenantId,
}) async {
  final updates = <String, dynamic>{
    'status':     status,
    'visited_at': DateTime.now().toIso8601String(),
    if (cashCollected != null) 'cash_collected': cashCollected,
    if (notes != null) 'notes': notes,
  };
  await supabase.from('route_stops').update(updates).eq('id', stopId);

  // Mirror to invoice delivery_status
  final stop = await supabase
      .from('route_stops')
      .select('invoice_id')
      .eq('id', stopId)
      .maybeSingle();

  final invId = stop?['invoice_id'] as String?;
  if (invId != null) {
    final invStatus = status == 'DELIVERED'
        ? 'DELIVERED'
        : status == 'NO_SALE'
            ? 'PENDING'
            : 'IN_TRANSIT';
    await supabase.from('invoices').update({'delivery_status': invStatus}).eq('id', invId);
  }
}

// ── Van sale — calls process_sale with van's location_id ─────────────────────
Future<({bool success, String? error})> placeVanSale({
  required String userId,
  required String tenantId,
  required String vehicleId,
  required String? clientId,
  required List<Map<String, dynamic>> items,  // [{id, name, quantity}]
  required double totalAmount,
  required String paymentMethod,
  String? routeId,
}) async {
  // Resolve van inventory location
  final locRes = await supabase
      .from('inventory_locations')
      .select('id')
      .eq('type', 'VEHICLE')
      .eq('reference_id', vehicleId)
      .maybeSingle();

  if (locRes == null) {
    return (success: false, error: 'Van inventory location not found');
  }
  final locationId = locRes['id'] as String;

  final saleId = 'VAN-${DateTime.now().millisecondsSinceEpoch}';

  try {
    await supabase.rpc('process_sale', params: {
      'p_id':             saleId,
      'p_shop_id':        clientId,
      'p_items':          items,
      'p_total_amount':   totalAmount,
      'p_payment_method': paymentMethod,
      'p_payment_status': paymentMethod == 'CREDIT' ? 'PENDING' : 'PAID',
      'p_date':           DateTime.now().toIso8601String().substring(0, 10),
      'p_user_id':        userId,
      'p_location_id':    locationId,
      'p_tenant_id':      tenantId,
      'p_route_id':       routeId,
    });
    return (success: true, error: null);
  } catch (e) {
    return (success: false, error: e.toString());
  }
}
