import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/location/location_service.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';

/// DispatchRouteScreen — start a delivery route for a vehicle.
/// Mirrors the web dispatchRoute flow: picks a driver + pending delivery
/// invoices, then calls dispatch_vehicle_route + lock_van_opening_stock.
class DispatchRouteScreen extends ConsumerStatefulWidget {
  final String vehicleId;
  final String vehicleName;
  const DispatchRouteScreen({
    super.key,
    required this.vehicleId,
    required this.vehicleName,
  });

  @override
  ConsumerState<DispatchRouteScreen> createState() => _DispatchRouteScreenState();
}

class _DispatchRouteScreenState extends ConsumerState<DispatchRouteScreen> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  final _odometerCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();

  List<Map<String, dynamic>> _drivers = [];
  List<Map<String, dynamic>> _invoices = []; // pending delivery invoices
  List<Map<String, dynamic>> _loadedStock = [];
  String? _driverId;
  final Set<String> _selected = {};

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  @override
  void dispose() {
    _odometerCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() { _loading = true; _error = null; });
    try {
      final tenantId = ref.read(tenantContextProvider).value?.tenantId;
      if (tenantId == null) throw 'No tenant';

      // Drivers (employees)
      final emps = await supabase
          .from('employees')
          .select('id, name, position').isFilter('deleted_at', null)
          .eq('tenant_id', tenantId);

      // Pending delivery invoices
      final invs = await supabase
          .from('invoices')
          .select('id, client_name, grand_total, delivery_address').isFilter('deleted_at', null)
          .eq('tenant_id', tenantId)
          .eq('delivery_status', 'PENDING');

      // Vehicle current stock → loadedStock snapshot
      final vLocRows = await supabase
          .from('inventory_locations')
          .select('id').isFilter('deleted_at', null)
          .eq('tenant_id', tenantId)
          .eq('type', 'VEHICLE')
          .eq('reference_id', widget.vehicleId);
      final loaded = <Map<String, dynamic>>[];
      if (vLocRows.isNotEmpty) {
        final vLocId = vLocRows[0]['id'];
        final bals = await supabase
            .from('inventory_balances')
            .select('product_id, quantity')
            .eq('location_id', vLocId);
        final prods = await supabase
            .from('products')
            .select('*').isFilter('deleted_at', null)
            .eq('tenant_id', tenantId);
        final byId = {for (final p in prods) p['id'].toString(): p};
        for (final b in bals) {
          final qty = (b['quantity'] as num?)?.toDouble() ?? 0;
          if (qty <= 0) continue;
          final pid = b['product_id'].toString();
          final p = byId[pid];
          loaded.add({
            'productId': pid,
            'quantity': qty,
            'sellingPrice': _num(p?['sellingPrice'] ?? p?['selling_price']),
            'costPrice': _num(p?['costPrice'] ?? p?['cost_price']),
          });
        }
      }

      setState(() {
        _drivers = List<Map<String, dynamic>>.from(emps);
        _invoices = List<Map<String, dynamic>>.from(invs);
        _loadedStock = loaded;
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  static double _num(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }

  double get _targetAmount => _invoices
      .where((i) => _selected.contains(i['id'].toString()))
      .fold(0.0, (s, i) => s + _num(i['grand_total']));

  Future<void> _dispatch() async {
    if (_submitting) return;
    if (_driverId == null) {
      _snack('Select a driver');
      return;
    }
    if (_selected.isEmpty && _loadedStock.isEmpty) {
      _snack('Select at least one delivery, or load van stock first');
      return;
    }
    setState(() => _submitting = true);
    try {
      final tenantId = ref.read(tenantContextProvider).value?.tenantId;
      if (tenantId == null) throw 'No tenant';

      final routeId = await supabase.rpc('dispatch_vehicle_route', params: {
        'p_vehicle_id': widget.vehicleId,
        'p_driver_id': _driverId,
        'p_location': _locationCtrl.text.trim().isEmpty
            ? 'Route'
            : _locationCtrl.text.trim(),
        'p_odometer': double.tryParse(_odometerCtrl.text.trim()) ?? 0,
        'p_assigned_orders': _selected.toList(),
        'p_loaded_stock': _loadedStock,
        'p_tenant_id': tenantId,
        'p_target_amount': _targetAmount,
      });

      // Lock the opening-stock snapshot (non-fatal if it fails)
      try {
        await supabase.rpc('lock_van_opening_stock', params: {
          'p_vehicle_id': widget.vehicleId,
          'p_route_id': routeId,
          'p_tenant_id': tenantId,
        });
      } catch (_) {}

      // Capture last-known location at dispatch (best-effort).
      await recordVehicleLocation(
        tenantId: tenantId,
        vehicleId: widget.vehicleId,
        driverId: _driverId,
      );

      if (!mounted) return;
      _snack('Route dispatched for ${widget.vehicleName}');
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) _snack('Dispatch failed: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String msg) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: const IconThemeData(color: AppColors.inkPrimary),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Dispatch Route',
              style: GoogleFonts.manrope(
                fontWeight: FontWeight.w800,
                fontSize: 17,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              widget.vehicleName.toUpperCase(),
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.secondary,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.manrope(color: AppColors.danger)),
                  ),
                )
              : Column(
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                        children: [
                          _label('DRIVER'),
                          _card(
                            child: DropdownButtonHideUnderline(
                              child: DropdownButton<String>(
                                isExpanded: true,
                                value: _driverId,
                                hint: Text('Select driver',
                                    style: GoogleFonts.manrope(
                                        color: AppColors.inkTertiary, fontSize: 14)),
                                items: _drivers
                                    .map((d) => DropdownMenuItem<String>(
                                          value: d['id'].toString(),
                                          child: Text(
                                            d['position'] != null
                                                ? '${d['name']} — ${d['position']}'
                                                : '${d['name']}',
                                            style: GoogleFonts.manrope(fontSize: 14),
                                          ),
                                        ))
                                    .toList(),
                                onChanged: (v) => setState(() => _driverId = v),
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _label('STARTING ODOMETER'),
                          _card(
                            child: TextField(
                              controller: _odometerCtrl,
                              keyboardType: TextInputType.number,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly
                              ],
                              decoration: const InputDecoration(
                                border: InputBorder.none,
                                hintText: '0',
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _label('ROUTE / AREA (OPTIONAL)'),
                          _card(
                            child: TextField(
                              controller: _locationCtrl,
                              textCapitalization: TextCapitalization.words,
                              decoration: const InputDecoration(
                                border: InputBorder.none,
                                hintText: 'e.g. North Zone',
                              ),
                            ),
                          ),
                          const SizedBox(height: 18),
                          Row(
                            children: [
                              Expanded(
                                child: _label(
                                    'DELIVERIES (${_selected.length}/${_invoices.length})'),
                              ),
                              if (_invoices.isNotEmpty)
                                GestureDetector(
                                  onTap: () => setState(() {
                                    if (_selected.length == _invoices.length) {
                                      _selected.clear();
                                    } else {
                                      _selected
                                        ..clear()
                                        ..addAll(_invoices
                                            .map((i) => i['id'].toString()));
                                    }
                                  }),
                                  child: Text(
                                    _selected.length == _invoices.length
                                        ? 'Clear all'
                                        : 'Select all',
                                    style: GoogleFonts.jetBrainsMono(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          if (_invoices.isEmpty)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              child: Text('No pending deliveries',
                                  style: GoogleFonts.manrope(
                                      color: AppColors.inkTertiary, fontSize: 13)),
                            )
                          else
                            ..._invoices.map((inv) {
                              final id = inv['id'].toString();
                              final on = _selected.contains(id);
                              return GestureDetector(
                                onTap: () => setState(() {
                                  on ? _selected.remove(id) : _selected.add(id);
                                }),
                                child: Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: AppColors.surface,
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                      color: on
                                          ? AppColors.primary.withValues(alpha: 0.5)
                                          : Colors.black.withValues(alpha: 0.06),
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(
                                        on
                                            ? LucideIcons.checkCircle2
                                            : LucideIcons.circle,
                                        size: 20,
                                        color: on
                                            ? AppColors.primary
                                            : AppColors.inkTertiary,
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              inv['client_name']?.toString() ??
                                                  'Customer',
                                              style: GoogleFonts.manrope(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 13,
                                                color: AppColors.inkPrimary,
                                              ),
                                            ),
                                            if (inv['delivery_address'] != null)
                                              Text(
                                                inv['delivery_address'].toString(),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: GoogleFonts.manrope(
                                                  fontSize: 11,
                                                  color: AppColors.inkTertiary,
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                      Text(
                                        '₹${_num(inv['grand_total']).toStringAsFixed(0)}',
                                        style: GoogleFonts.jetBrainsMono(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 13,
                                          color: AppColors.inkPrimary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }),
                        ],
                      ),
                    ),
                    // Confirm
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: SizedBox(
                          height: 54,
                          child: ElevatedButton(
                            onPressed: _submitting ? null : _dispatch,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.inkPrimary,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: _submitting
                                ? const SizedBox(
                                    width: 20, height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white),
                                  )
                                : Text(
                                    'Dispatch Route',
                                    style: GoogleFonts.manrope(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 14,
                                    ),
                                  ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: GoogleFonts.jetBrainsMono(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
            color: AppColors.inkTertiary,
          ),
        ),
      );

  Widget _card({required Widget child}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
        ),
        child: child,
      );
}
