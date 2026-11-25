import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/location/location_service.dart';
import 'package:mobile_app/core/supabase/client.dart';

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
      if (mounted) {
        _snack('May not have dispatched. Check Routes before trying again. ($e)');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String msg) => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));

  Future<void> _pickDriver() async {
    String label(Map<String, dynamic> d) => d['position'] != null &&
            d['position'].toString().trim().isNotEmpty
        ? '${d['name']} · ${d['position']}'
        : '${d['name']}';
    final current =
        _drivers.where((d) => d['id'].toString() == _driverId).firstOrNull;
    final picked = await showBlPicker(context,
        title: 'Driver',
        options: [for (final d in _drivers) label(d)],
        selected: current == null ? null : label(current));
    if (picked == null || !mounted) return;
    setState(() => _driverId =
        _drivers.firstWhere((d) => label(d) == picked)['id'].toString());
  }

  @override
  Widget build(BuildContext context) {
    final driver =
        _drivers.where((d) => d['id'].toString() == _driverId).firstOrNull;
    final driverName = driver?['name']?.toString();
    final allOn = _invoices.isNotEmpty && _selected.length == _invoices.length;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Dispatch Route'),
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(
                          color: Bl.amber, strokeWidth: 2))
                  : _error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                                'Could not load drivers and deliveries. Check your internet and try again. ($_error)',
                                textAlign: TextAlign.center,
                                style:
                                    Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                          ),
                        )
                      : ListView(
                          padding: const EdgeInsets.only(bottom: 20),
                          children: [
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(18, 12, 18, 0),
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.stretch,
                                children: [
                                  Text('Send ${widget.vehicleName} out',
                                      style: Bl.tight(24,
                                          w: FontWeight.w700, ls: -0.03)),
                                  BlField(
                                    label: 'Driver',
                                    hint: _drivers.isEmpty
                                        ? 'No drivers yet. Add one in Payroll.'
                                        : 'Select driver',
                                    value: driverName,
                                    onTap:
                                        _drivers.isEmpty ? () {} : _pickDriver,
                                  ),
                                  BlField(
                                    label: 'Starting odometer',
                                    hint: '0',
                                    controller: _odometerCtrl,
                                    keyboardType: TextInputType.number,
                                    inputFormatters: [
                                      FilteringTextInputFormatter.digitsOnly,
                                    ],
                                    trailing: Padding(
                                      padding:
                                          const EdgeInsets.only(right: 8),
                                      child: Text('km',
                                          style: Bl.inter(13,
                                              w: FontWeight.w500,
                                              c: const Color(0xFF7A8088))),
                                    ),
                                  ),
                                  BlField(
                                    label: 'Area (optional)',
                                    hint: 'e.g. North Zone',
                                    controller: _locationCtrl,
                                    capitalization: TextCapitalization.words,
                                  ),
                                ],
                              ),
                            ),
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(18, 16, 18, 4),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                        'DELIVERIES · ${_selected.length} OF ${_invoices.length}',
                                        style: Bl.eyebrow),
                                  ),
                                  if (_invoices.isNotEmpty)
                                    BlTap(
                                      onTap: () => setState(() {
                                        if (_selected.length ==
                                            _invoices.length) {
                                          _selected.clear();
                                        } else {
                                          _selected
                                            ..clear()
                                            ..addAll(_invoices.map(
                                                (i) => i['id'].toString()));
                                        }
                                      }),
                                      child: Text(
                                          allOn ? 'Clear all' : 'Select all',
                                          style: Bl.tight(12.5,
                                              w: FontWeight.w600,
                                              ls: 0,
                                              c: const Color(0xFFB86A0A))),
                                    ),
                                ],
                              ),
                            ),
                            if (_invoices.isEmpty)
                              BlEmpty(
                                icon: BlIcons.doc,
                                title: 'No pending deliveries',
                                message: _loadedStock.isEmpty
                                    ? 'Load the van first, or mark a bill for delivery.'
                                    : 'The van can still go out to sell what is loaded.',
                              ),
                            for (final inv in _invoices)
                              Builder(builder: (context) {
                                final id = inv['id'].toString();
                                final on = _selected.contains(id);
                                final address =
                                    (inv['delivery_address'] ?? '')
                                        .toString()
                                        .trim();
                                return Semantics(
                                  button: true,
                                  checked: on,
                                  label:
                                      '${inv['client_name'] ?? 'Customer'}, ₹${_num(inv['grand_total']).toStringAsFixed(0)}',
                                  excludeSemantics: true,
                                  child: BlTap(
                                    onTap: () => setState(() => on
                                        ? _selected.remove(id)
                                        : _selected.add(id)),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 18, vertical: 11),
                                      decoration: const BoxDecoration(
                                          border: Border(
                                              bottom: BorderSide(
                                                  color: Bl.sep))),
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 22,
                                            height: 22,
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                              color: on ? Bl.brand : null,
                                              shape: BoxShape.circle,
                                              border: on
                                                  ? null
                                                  : Border.all(
                                                      width: 1.5,
                                                      color: const Color(
                                                          0xFFCFCFCF)),
                                            ),
                                            child: on
                                                ? const BlIcon(BlIcons.check,
                                                    size: 13,
                                                    color: Bl.white,
                                                    stroke: 3)
                                                : null,
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                    inv['client_name']
                                                            ?.toString() ??
                                                        'Customer',
                                                    maxLines: 1,
                                                    overflow: TextOverflow
                                                        .ellipsis,
                                                    style: Bl.tight(14.5,
                                                        w: FontWeight.w600)),
                                                if (address.isNotEmpty) ...[
                                                  const SizedBox(height: 1),
                                                  Text(address,
                                                      maxLines: 1,
                                                      overflow: TextOverflow
                                                          .ellipsis,
                                                      style: Bl.inter(12,
                                                          c: const Color(
                                                              0xFF7A8088))),
                                                ],
                                              ],
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Text(
                                              '₹${_num(inv['grand_total']).toStringAsFixed(0)}',
                                              style: Bl.tight(14.5,
                                                  w: FontWeight.w600)),
                                        ],
                                      ),
                                    ),
                                  ),
                                );
                              }),
                          ],
                        ),
            ),
            if (!_loading && _error == null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                                '${driverName ?? 'No driver yet'} · ${widget.vehicleName}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Bl.inter(13,
                                    w: FontWeight.w500, c: Bl.body)),
                          ),
                          Text(
                              '${_selected.length} stop${_selected.length == 1 ? '' : 's'}',
                              style: Bl.tight(14, w: FontWeight.w700)),
                        ],
                      ),
                    ),
                    BlButton('Dispatch route',
                        loading: _submitting,
                        onTap: _submitting ? null : _dispatch),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
