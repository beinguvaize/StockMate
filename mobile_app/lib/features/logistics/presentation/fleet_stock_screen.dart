import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/logistics/presentation/van_stock_screen.dart';

/// FleetStockScreen — stock-on-board overview for every vehicle.
class FleetStockScreen extends ConsumerStatefulWidget {
  const FleetStockScreen({super.key});

  @override
  ConsumerState<FleetStockScreen> createState() => _FleetStockScreenState();
}

class _VanStock {
  final String vehicleId;
  final String name;
  final double units;
  final int products;
  _VanStock({
    required this.vehicleId,
    required this.name,
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
          .select('id, name')
          .eq('tenant_id', tenantId);
      final vLocs = await supabase
          .from('inventory_locations')
          .select('id, reference_id')
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
          units: qs.fold(0.0, (s, q) => s + q),
          products: qs.length,
        ));
      }
      rows.sort((a, b) => b.units.compareTo(a.units));

      setState(() { _rows = rows; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalUnits = _rows.fold(0.0, (s, r) => s + r.units);

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
              'Fleet Stock',
              style: GoogleFonts.hankenGrotesk(
                fontWeight: FontWeight.w800,
                fontSize: 17,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'STOCK ON BOARD — ALL VANS',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: AppColors.secondary,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.refreshCw, size: 18),
            onPressed: _fetch,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.inter(color: AppColors.danger)),
                  ),
                )
              : _rows.isEmpty
                  ? Center(
                      child: Text('No vehicles',
                          style: GoogleFonts.inter(color: AppColors.inkTertiary)),
                    )
                  : Column(
                      children: [
                        Container(
                          margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            children: [
                              const Icon(LucideIcons.truck,
                                  color: AppColors.inkPrimary, size: 26),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${totalUnits.toStringAsFixed(0)} units across fleet',
                                      style: GoogleFonts.hankenGrotesk(
                                        fontWeight: FontWeight.w900,
                                        fontSize: 20,
                                        color: AppColors.inkPrimary,
                                      ),
                                    ),
                                    Text(
                                      '${_rows.length} vehicle${_rows.length > 1 ? 's' : ''}',
                                      style: GoogleFonts.inter(
                                        fontSize: 12,
                                        color: AppColors.secondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                            itemCount: _rows.length,
                            itemBuilder: (context, i) {
                              final r = _rows[i];
                              return GestureDetector(
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        VanStockScreen(vehicleId: r.vehicleId),
                                  ),
                                ),
                                child: Container(
                                  margin: const EdgeInsets.only(bottom: 10),
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: AppColors.surface,
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(
                                        color: Colors.black.withValues(alpha: 0.06)),
                                  ),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 40,
                                        height: 40,
                                        decoration: BoxDecoration(
                                          color: AppColors.primary
                                              .withValues(alpha: 0.08),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: const Icon(LucideIcons.truck,
                                            size: 18, color: AppColors.primary),
                                      ),
                                      const SizedBox(width: 14),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              r.name,
                                              style: GoogleFonts.hankenGrotesk(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 14,
                                                color: AppColors.inkPrimary,
                                              ),
                                            ),
                                            Text(
                                              r.units <= 0
                                                  ? 'Empty'
                                                  : '${r.products} product${r.products > 1 ? 's' : ''}',
                                              style: GoogleFonts.inter(
                                                fontSize: 11,
                                                color: AppColors.inkTertiary,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Text(
                                        r.units.toStringAsFixed(0),
                                        style: GoogleFonts.jetBrainsMono(
                                          fontWeight: FontWeight.w900,
                                          fontSize: 18,
                                          color: r.units <= 0
                                              ? AppColors.inkTertiary
                                              : AppColors.primary,
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        'units',
                                        style: GoogleFonts.inter(
                                          fontSize: 10,
                                          color: AppColors.inkTertiary,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      const Icon(LucideIcons.chevronRight,
                                          size: 16, color: AppColors.inkTertiary),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
    );
  }
}
