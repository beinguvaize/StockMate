import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/logistics/presentation/van_stock_screen.dart';
import 'package:mobile_app/features/logistics/presentation/widgets/vehicle_picture.dart';

const _grey = Color(0xFF7A8088);

String _units(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

/// "Fleet Stock" (canvas): what is on board, van by van.
class FleetStockScreen extends ConsumerStatefulWidget {
  const FleetStockScreen({super.key});

  @override
  ConsumerState<FleetStockScreen> createState() => _FleetStockScreenState();
}

class _VanStock {
  final String vehicleId;
  final String name;
  final String plate;
  final VehicleKind kind;
  final double units;
  final int products;
  _VanStock({
    required this.vehicleId,
    required this.name,
    required this.plate,
    required this.kind,
    required this.units,
    required this.products,
  });
}

class _FleetStockScreenState extends ConsumerState<FleetStockScreen> {
  bool _loading = true;
  String? _error;
  List<_VanStock> _rows = [];

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() { _loading = true; _error = null; });
    try {
      final tenantId = ref.read(tenantContextProvider).value?.tenantId;
      if (tenantId == null) throw 'No tenant';

      final vehicles = await supabase
          .from('vehicles')
          .select('id, name, plateNumber, plate, type').isFilter('deleted_at', null)
          .eq('tenant_id', tenantId);
      final vLocs = await supabase
          .from('inventory_locations')
          .select('id, reference_id').isFilter('deleted_at', null)
          .eq('tenant_id', tenantId)
          .eq('type', 'VEHICLE');
      final bals = await supabase
          .from('inventory_balances')
          .select('location_id, quantity');

      // location_id → {units, productCount}
      final stockByLoc = <String, List<double>>{};
      for (final b in bals) {
        final qty = (b['quantity'] as num?)?.toDouble() ?? 0;
        if (qty <= 0) continue;
        final loc = b['location_id'].toString();
        stockByLoc.putIfAbsent(loc, () => []).add(qty);
      }
      // vehicleId → location_id
      final locByVehicle = {
        for (final l in vLocs)
          if (l['reference_id'] != null)
            l['reference_id'].toString(): l['id'].toString()
      };

      final rows = <_VanStock>[];
      for (final v in vehicles) {
        final vid = v['id'].toString();
        final locId = locByVehicle[vid];
        final qs = locId != null ? (stockByLoc[locId] ?? const <double>[]) : const <double>[];
        rows.add(_VanStock(
          vehicleId: vid,
          name: v['name']?.toString() ?? 'Vehicle',
          plate: (v['plateNumber'] ?? v['plate'] ?? '').toString(),
          kind: vehicleKindOf(v['type']?.toString()),
          units: qs.fold(0.0, (s, q) => s + q),
          products: qs.length,
        ));
      }
      rows.sort((a, b) => b.units.compareTo(a.units));

      if (mounted) setState(() { _rows = rows; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Fleet Stock'),
            Expanded(
              child: _loading && _rows.isEmpty
                  ? const Center(
                      child: CircularProgressIndicator(
                          color: Bl.amber, strokeWidth: 2))
                  : _error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                                'Could not load van stock. Check your internet and try again. ($_error)',
                                textAlign: TextAlign.center,
                                style:
                                    Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                          ),
                        )
                      : RefreshIndicator(
                          color: Bl.amber,
                          onRefresh: _fetch,
                          child: ListView(
                            padding: const EdgeInsets.only(bottom: 24),
                            children: [
                              BlGroupHeader('Stock on board, all vans',
                                  trailing:
                                      '${_rows.length} vehicle${_rows.length == 1 ? '' : 's'}'),
                              if (_rows.isEmpty)
                                const BlEmpty(
                                  icon: BlIcons.truck,
                                  title: 'No vehicles yet',
                                  message:
                                      'Add a vehicle, then load it from the warehouse.',
                                ),
                              for (final r in _rows)
                                Semantics(
                                  button: true,
                                  label:
                                      '${r.name}, ${_units(r.units)} units. Open',
                                  excludeSemantics: true,
                                  child: BlTap(
                                    onTap: () => Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => VanStockScreen(
                                            vehicleId: r.vehicleId,
                                            vehicleName: r.name,
                                            plate: r.plate,
                                            kind: r.kind),
                                      ),
                                    ).then((_) => _fetch()),
                                    child: Container(
                                      margin: const EdgeInsets.fromLTRB(
                                          16, 8, 16, 0),
                                      padding: const EdgeInsets.fromLTRB(
                                          12, 12, 12, 12),
                                      decoration: BoxDecoration(
                                          color: Bl.tile,
                                          borderRadius:
                                              BorderRadius.circular(18)),
                                      child: Row(
                                        children: [
                                          VehiclePicture(r.kind,
                                              width: 84,
                                              opacity:
                                                  r.units > 0 ? 1 : 0.55),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(r.name,
                                                    maxLines: 1,
                                                    overflow: TextOverflow
                                                        .ellipsis,
                                                    style: Bl.tight(14.5,
                                                        w: FontWeight.w600)),
                                                const SizedBox(height: 1),
                                                Text(
                                                    [
                                                      if (r.plate.isNotEmpty)
                                                        r.plate,
                                                      r.units <= 0
                                                          ? 'empty'
                                                          : '${r.products} product${r.products == 1 ? '' : 's'}',
                                                    ].join(' · '),
                                                    maxLines: 1,
                                                    overflow: TextOverflow
                                                        .ellipsis,
                                                    style: Bl.inter(12,
                                                        c: _grey)),
                                              ],
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.end,
                                            children: [
                                              Text(_units(r.units),
                                                  style: Bl.tight(18,
                                                      w: FontWeight.w700,
                                                      c: r.units > 0
                                                          ? Bl.ink
                                                          : Bl.mute)),
                                              Text('units',
                                                  style: Bl.inter(11.5,
                                                      c: _grey)),
                                            ],
                                          ),
                                          const SizedBox(width: 6),
                                          const BlIcon(BlIcons.chevronRight,
                                              size: 16,
                                              color: Color(0xFFB8BCC2)),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              if (_rows.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                      18, 14, 18, 0),
                                  child: Row(
                                    children: [
                                      const BlIcon(
                                          '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.500"/>',
                                          size: 16,
                                          color: Bl.body),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                            'Tap a van to see what is on board.',
                                            style: Bl.inter(12.5,
                                                c: Bl.body)),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
