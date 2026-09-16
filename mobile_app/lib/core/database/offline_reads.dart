// Offline read fallbacks for the tables cached in schema v6.
//
// Schema v6 gave the app a local copy of day_book, client_payments, employees,
// inventory_locations, inventory_balances, product_batches, vehicles,
// route_stops, purchase_returns and users. Filling those tables changed nothing
// on its own: every screen still called Supabase directly, so DayBook, HR,
// logistics and the rest carried on failing with no connection.
//
// Each function here returns rows keyed by their POSTGRES column names, not the
// Drift field names. That is the whole point — a call site can drop one of these
// into its catch block and its existing fromMap/fromJson parser keeps working
// untouched, so the offline path cannot drift away from the online shape.
//
// Reads only. Writes continue to go through SyncService's outbox.

import 'dart:convert';

import 'package:drift/drift.dart' show OrderingTerm, OrderingMode;

import 'database.dart';

String? _iso(DateTime? d) => d?.toIso8601String();

/// day_book, newest first.
Future<List<Map<String, dynamic>>> cachedDayBook(
  AppDatabase db,
  String tenantId, {
  int limit = 60,
}) async {
  final rows = await (db.select(db.dayBookLocal)
        ..where((t) => t.tenantId.equals(tenantId))
        ..orderBy([(t) => OrderingTerm(expression: t.date, mode: OrderingMode.desc)])
        ..limit(limit))
      .get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'date': r.date,
            'location_id': r.locationId,
            'opening_balance': r.openingBalance,
            'closing_balance': r.closingBalance,
            'total_sales': r.totalSales,
            'total_expenses': r.totalExpenses,
            'is_closed': r.isClosed,
            'closed_at': _iso(r.closedAt),
            'closed_by': r.closedBy,
            'physical_cash': r.physicalCash,
            'variance': r.variance,
          })
      .toList();
}

/// client_payments, optionally narrowed to one date or one client.
Future<List<Map<String, dynamic>>> cachedClientPayments(
  AppDatabase db,
  String tenantId, {
  String? date,
  String? clientId,
}) async {
  final q = db.select(db.clientPayments)..where((t) => t.tenantId.equals(tenantId));
  if (date != null) q.where((t) => t.date.equals(date));
  if (clientId != null) q.where((t) => t.clientId.equals(clientId));
  q.orderBy([(t) => OrderingTerm(expression: t.date, mode: OrderingMode.desc)]);
  final rows = await q.get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'client_id': r.clientId,
            'amount': r.amount,
            'date': r.date,
            'payment_method': r.paymentMethod,
            'notes': r.notes,
            'recorded_by': r.recordedBy,
          })
      .toList();
}

/// employees, name-ordered. Pass [role] to match the driver lookups.
Future<List<Map<String, dynamic>>> cachedEmployees(
  AppDatabase db,
  String tenantId, {
  String? role,
}) async {
  final q = db.select(db.employees)..where((t) => t.tenantId.equals(tenantId));
  if (role != null) q.where((t) => t.role.equals(role));
  q.orderBy([(t) => OrderingTerm(expression: t.name)]);
  final rows = await q.get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'name': r.name,
            'role': r.role,
            'position': r.position,
            'department': r.department,
            'status': r.status,
            'pay_type': r.payType,
            'salary': r.salary,
            'daily_rate': r.dailyRate,
            'days_worked': r.daysWorked,
            'amount_paid': r.amountPaid,
            'phone': r.phone,
            'email': r.email,
            'bank_account': r.bankAccount,
            'employment_type': r.employmentType,
            'joining_date': r.joiningDate,
            'notes': r.notes,
            'user_id': r.userId,
          })
      .toList();
}

/// inventory_locations, optionally one type (WAREHOUSE / VEHICLE).
Future<List<Map<String, dynamic>>> cachedInventoryLocations(
  AppDatabase db,
  String tenantId, {
  String? type,
}) async {
  final q = db.select(db.inventoryLocations)..where((t) => t.tenantId.equals(tenantId));
  if (type != null) q.where((t) => t.type.equals(type));
  q.orderBy([(t) => OrderingTerm(expression: t.name)]);
  final rows = await q.get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'name': r.name,
            'type': r.type,
            'reference_id': r.referenceId,
          })
      .toList();
}

/// inventory_balances, optionally for one location.
Future<List<Map<String, dynamic>>> cachedInventoryBalances(
  AppDatabase db,
  String tenantId, {
  String? locationId,
}) async {
  final q = db.select(db.inventoryBalances)..where((t) => t.tenantId.equals(tenantId));
  if (locationId != null) q.where((t) => t.locationId.equals(locationId));
  final rows = await q.get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'product_id': r.productId,
            'location_id': r.locationId,
            'quantity': r.quantity,
          })
      .toList();
}

/// product_batches holding stock, oldest first (FIFO order, as the server
/// returns them). Only lots with qty remaining are cached.
Future<List<Map<String, dynamic>>> cachedProductBatches(
  AppDatabase db,
  String tenantId, {
  String? productId,
}) async {
  final q = db.select(db.productBatches)..where((t) => t.tenantId.equals(tenantId));
  if (productId != null) q.where((t) => t.productId.equals(productId));
  q.orderBy([(t) => OrderingTerm(expression: t.receivedDate)]);
  final rows = await q.get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'product_id': r.productId,
            'purchase_id': r.purchaseId,
            'supplier_id': r.supplierId,
            'warehouse_id': r.warehouseId,
            'received_date': r.receivedDate,
            'expiry_date': r.expiryDate,
            'unit_cost': r.unitCost,
            'qty_received': r.qtyReceived,
            'qty_remaining': r.qtyRemaining,
            'origin': r.origin,
            'cost_basis': r.costBasis,
            'note': r.note,
          })
      .toList();
}

/// vehicles. Note the camelCase keys — vehicles is the one table created with
/// quoted mixed-case column names server-side, and the models read them that way.
Future<List<Map<String, dynamic>>> cachedVehicles(AppDatabase db, String tenantId) async {
  final rows = await (db.select(db.vehicles)
        ..where((t) => t.tenantId.equals(tenantId))
        ..orderBy([(t) => OrderingTerm(expression: t.name)]))
      .get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'name': r.name,
            'plateNumber': r.plateNumber,
            'type': r.type,
            'status': r.status,
            'capacity': r.capacity,
            'fuelType': r.fuelType,
          })
      .toList();
}

/// route_stops for one route, in visit order.
Future<List<Map<String, dynamic>>> cachedRouteStops(
  AppDatabase db,
  String tenantId, {
  String? routeId,
}) async {
  final q = db.select(db.routeStops)..where((t) => t.tenantId.equals(tenantId));
  if (routeId != null) q.where((t) => t.routeId.equals(routeId));
  q.orderBy([(t) => OrderingTerm(expression: t.sequence)]);
  final rows = await q.get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'route_id': r.routeId,
            'invoice_id': r.invoiceId,
            'client_id': r.clientId,
            'client_name': r.clientName,
            'sequence': r.sequence,
            'status': r.status,
            'notes': r.notes,
            'cash_collected': r.cashCollected,
            // Stored encoded; decoded back so the call site sees the jsonb shape
            // Supabase would have handed it.
            'items_delivered':
                r.itemsDeliveredJson == null ? null : jsonDecode(r.itemsDeliveredJson!),
            'visited_at': _iso(r.visitedAt),
          })
      .toList();
}

/// purchase_returns, newest first.
Future<List<Map<String, dynamic>>> cachedPurchaseReturns(AppDatabase db, String tenantId) async {
  final rows = await (db.select(db.purchaseReturns)
        ..where((t) => t.tenantId.equals(tenantId))
        ..orderBy([(t) => OrderingTerm(expression: t.date, mode: OrderingMode.desc)]))
      .get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'purchase_id': r.purchaseId,
            'supplier_id': r.supplierId,
            'supplier_name': r.supplierName,
            'product_id': r.productId,
            'product_name': r.productName,
            'quantity': r.quantity,
            'unit_price': r.unitPrice,
            'total_amount': r.totalAmount,
            'reason': r.reason,
            'date': r.date,
          })
      .toList();
}

// --- DayBook ledger, offline ---
//
// sales/expenses/purchases were already cached, but with a DateTime `date`
// column rather than the server's text date, so they cannot be filtered by an
// equality on a 'YYYY-MM-DD' string the way the online query does. These three
// narrow to the requested day locally and hand back the exact column names the
// ledger parses.

bool _sameDay(DateTime d, String ymd) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}' == ymd;

Future<List<Map<String, dynamic>>> cachedSalesForDate(
    AppDatabase db, String tenantId, String date) async {
  final rows = await (db.select(db.sales)..where((t) => t.tenantId.equals(tenantId))).get();
  return rows.where((r) => _sameDay(r.date, date)).map((r) => <String, dynamic>{
        'id': r.id,
        'totalAmount': r.totalAmount,
        'paymentMethod': r.paymentMethod,
        'customerInfo':
            r.customerInfoJson == null ? null : jsonDecode(r.customerInfoJson!),
        'items': jsonDecode(r.itemsJson),
        'created_at': _iso(r.createdAt),
      }).toList();
}

Future<List<Map<String, dynamic>>> cachedExpensesForDate(
    AppDatabase db, String tenantId, String date) async {
  final rows = await (db.select(db.expenses)..where((t) => t.tenantId.equals(tenantId))).get();
  return rows.where((r) => _sameDay(r.date, date)).map((r) => <String, dynamic>{
        'id': r.id,
        'amount': r.amount,
        'category': r.category,
        'note': r.note,
        'created_at': _iso(r.createdAt),
      }).toList();
}

Future<List<Map<String, dynamic>>> cachedPurchasesForDate(
    AppDatabase db, String tenantId, String date) async {
  final rows = await (db.select(db.purchases)..where((t) => t.tenantId.equals(tenantId))).get();
  return rows.where((r) => _sameDay(r.date, date)).map((r) => <String, dynamic>{
        'id': r.id,
        'total_amount': r.totalAmount,
        // The ledger reads this and treats null as CASH, which would report a
        // credit purchase as cash leaving the drawer — hence it is cached.
        'payment_type': r.paymentType,
        'supplier_id': r.supplierId,
        'created_at': _iso(r.createdAt),
      }).toList();
}

/// users (staff), name-ordered.
Future<List<Map<String, dynamic>>> cachedUsers(AppDatabase db, String tenantId) async {
  final rows = await (db.select(db.usersLocal)
        ..where((t) => t.tenantId.equals(tenantId))
        ..orderBy([(t) => OrderingTerm(expression: t.name)]))
      .get();
  return rows
      .map((r) => <String, dynamic>{
            'id': r.id,
            'tenant_id': r.tenantId,
            'name': r.name,
            'email': r.email,
            'status': r.status,
            'avatar_url': r.avatarUrl,
            'roles': r.rolesJson == null ? null : jsonDecode(r.rolesJson!),
            'permissions': r.permissionsJson == null ? null : jsonDecode(r.permissionsJson!),
          })
      .toList();
}
