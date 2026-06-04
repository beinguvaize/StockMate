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
      // tax_mode + bill_settings are required by the checkout sheet so it
      // can back tax out of the price on INCLUSIVE tenants. They were
      // missing from this select, so _taxMode always fell back to
      // EXCLUSIVE and an INCLUSIVE tenant's checkout added tax on top of
      // a price that already contained it.
      .select('currencySymbol, name, country, upi_id, bank_name, account_no, ifsc_code, tax_mode, bill_settings, gst_no, state')
      .eq('tenant_id', tenantId)
      .maybeSingle();
  if (res == null) return null;
  // Mirror `name` into `businessName` so existing call sites that read
  // either key keep working — the source-of-truth column on the table
  // is `name`; older code still reads `businessName`.
  return {
    ...res,
    'businessName': res['name'],
  };
});

/// Convenience: just the currency symbol, falls back to empty string.
final currencySymbolProvider = Provider<AsyncValue<String>>((ref) {
  return ref.watch(tenantProfileProvider).whenData(
    (profile) => (profile?['currencySymbol'] as String?) ?? '',
  );
});

// ── Current driver's employee id ─────────────────────────────────────────────
// Routes are dispatched with the driver's EMPLOYEE id, but the app logs in as
// an auth USER. employees.user_id links the two — resolve it here.
final driverEmployeeIdProvider = FutureProvider<String?>((ref) async {
  final userId = supabase.auth.currentUser?.id;
  if (userId == null) return null;
  try {
    final row = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
    return row?['id']?.toString();
  } catch (_) {
    return null;
  }
});

// ── Active route for the logged-in driver ────────────────────────────────────
// Streams all routes, filters client-side for ACTIVE or IN_TRANSIT belonging
// to the current driver. A route's driverId may be the auth user id OR the
// linked employee id — match against both.
final activeRouteProvider = StreamProvider<LogisticRoute?>((ref) {
  final userId = supabase.auth.currentUser?.id;
  if (userId == null) return Stream.value(null);

  final empId = ref.watch(driverEmployeeIdProvider).asData?.value;
  final driverIds = <String>{userId, ?empId};

  const activeStatuses = {'ACTIVE', 'IN_TRANSIT'};

  return supabase
      .from('routes')
      .stream(primaryKey: ['id'])
      .map((rows) {
        final match = rows.where((r) {
          final status = (r['status'] as String?)?.toUpperCase() ?? '';
          final driverId = (r['driver_id'] ?? r['driverId'])?.toString();
          return activeStatuses.contains(status) && driverIds.contains(driverId);
        }).toList();
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
// StreamProvider: live-updates whenever inventory_balances change so VanSaleScreen
// always shows fresh quantities after a sale without needing a manual refresh.
final vanStockProvider = StreamProvider.family<List<VanStockItem>, String>((ref, vehicleId) async* {
  // 1. Resolve the inventory_location id for this vehicle (one-time lookup)
  final locRes = await supabase
      .from('inventory_locations')
      .select('id')
      .eq('type', 'VEHICLE')
      .eq('reference_id', vehicleId)
      .maybeSingle();

  if (locRes == null) { yield []; return; }
  final locationId = locRes['id'] as String;

  // 2. Stream inventory_balances for this location; re-fetch products on every change
  await for (final rows in supabase
      .from('inventory_balances')
      .stream(primaryKey: ['product_id', 'location_id'])
      .eq('location_id', locationId)) {

    final withStock = (rows).where((r) => ((r['quantity'] as num?)?.toDouble() ?? 0) > 0).toList();
    if (withStock.isEmpty) { yield []; continue; }

    // Fetch product details in one round-trip
    final productIds = withStock.map((r) => r['product_id'] as String).toList();
    final prodRes = await supabase
        .from('products')
        .select('id, name, "sellingPrice"')
        .inFilter('id', productIds);

    final prodMap = <String, Map<String, dynamic>>{
      for (final p in prodRes as List) (p['id'] as String): p as Map<String, dynamic>,
    };

    yield withStock.map((r) {
      final prod = prodMap[r['product_id'] as String];
      return VanStockItem(
        productId:    r['product_id'] as String,
        productName:  prod?['name'] as String? ?? r['product_id'] as String,
        quantity:     (r['quantity'] as num?)?.toDouble() ?? 0,
        sellingPrice: (prod?['sellingPrice'] as num?)?.toDouble() ?? 0,
        locationId:   locationId,
      );
    }).toList()
      ..sort((a, b) => a.productName.compareTo(b.productName));
  }
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
    'cash_collected': ?cashCollected,
    'notes': ?notes,
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
      'p_source_app':     'VAN',
    });
    return (success: true, error: null);
  } catch (e) {
    return (success: false, error: e.toString());
  }
}
