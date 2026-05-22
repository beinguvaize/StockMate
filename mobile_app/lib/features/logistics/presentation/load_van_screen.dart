import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';

/// LoadVanScreen — warehouse → vehicle stock transfer.
/// Mirrors the web `loadVan` flow: per product, adjust_inventory_atomic
/// deducts from the warehouse location and adds to the vehicle location.
class LoadVanScreen extends ConsumerStatefulWidget {
  final String vehicleId;
  final String vehicleName;
  const LoadVanScreen({
    super.key,
    required this.vehicleId,
    required this.vehicleName,
  });

  @override
  ConsumerState<LoadVanScreen> createState() => _LoadVanScreenState();
}

class _WarehouseItem {
  final String productId;
  final String name;
  final double available;
  _WarehouseItem({required this.productId, required this.name, required this.available});
}

class _LoadVanScreenState extends ConsumerState<LoadVanScreen> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  String _search = '';
  String? _warehouseLocId;

  List<_WarehouseItem> _items = [];
  final Map<String, int> _qty = {}; // productId → qty to load

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

      // Warehouse location
      final whRows = await supabase
          .from('inventory_locations')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('type', 'WAREHOUSE')
          .limit(1);
      if (whRows.isEmpty) throw 'No warehouse location found';
      _warehouseLocId = whRows[0]['id'].toString();

      // Warehouse balances + product names
      final bals = await supabase
          .from('inventory_balances')
          .select('product_id, quantity')
          .eq('location_id', _warehouseLocId!);
      final prods = await supabase
          .from('products')
          .select('id, name')
          .eq('tenant_id', tenantId);

      final nameById = {
        for (final p in prods) p['id'].toString(): (p['name']?.toString() ?? 'Unnamed')
      };

      final items = <_WarehouseItem>[];
      for (final b in bals) {
        final qty = (b['quantity'] as num?)?.toDouble() ?? 0;
        if (qty <= 0) continue;
        final pid = b['product_id'].toString();
        items.add(_WarehouseItem(
          productId: pid,
          name: nameById[pid] ?? 'Unnamed',
          available: qty,
        ));
      }
      items.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

      setState(() { _items = items; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  int get _totalUnits => _qty.values.fold(0, (s, q) => s + q);

  void _setQty(_WarehouseItem item, int next) {
    final capped = next.clamp(0, item.available.toInt());
    setState(() {
      if (capped <= 0) {
        _qty.remove(item.productId);
      } else {
        _qty[item.productId] = capped;
      }
    });
  }

  Future<void> _confirm() async {
    if (_submitting || _totalUnits <= 0) return;
    setState(() => _submitting = true);
    try {
      final tenantId = ref.read(tenantContextProvider).value?.tenantId;
      if (tenantId == null) throw 'No tenant';

      // Resolve / create the vehicle inventory location
      final vRows = await supabase
          .from('inventory_locations')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('type', 'VEHICLE')
          .eq('reference_id', widget.vehicleId);
      String vehicleLocId;
      if (vRows.isNotEmpty) {
        vehicleLocId = vRows[0]['id'].toString();
      } else {
        final ins = await supabase.from('inventory_locations').insert({
          'type': 'VEHICLE',
          'reference_id': widget.vehicleId,
          'name': 'Van – ${widget.vehicleName}',
          'tenant_id': tenantId,
        }).select('id').single();
        vehicleLocId = ins['id'].toString();
      }

      final errors = <String>[];
      for (final entry in _qty.entries) {
        final pid = entry.key;
        final qty = entry.value;
        if (qty <= 0) continue;

        // Deduct from warehouse
        try {
          await supabase.rpc('adjust_inventory_atomic', params: {
            'p_product_id': pid,
            'p_location_id': _warehouseLocId,
            'p_amount': -qty,
            'p_reason': 'Van load',
            'p_tenant_id': tenantId,
          });
        } catch (e) {
          errors.add('Deduct $pid: $e');
          continue;
        }
        // Add to vehicle
        try {
          await supabase.rpc('adjust_inventory_atomic', params: {
            'p_product_id': pid,
            'p_location_id': vehicleLocId,
            'p_amount': qty,
            'p_reason': 'Van load',
            'p_tenant_id': tenantId,
          });
        } catch (e) {
          // Roll back the warehouse deduction
          try {
            await supabase.rpc('adjust_inventory_atomic', params: {
              'p_product_id': pid,
              'p_location_id': _warehouseLocId,
              'p_amount': qty,
              'p_reason': 'Van load rollback',
              'p_tenant_id': tenantId,
            });
          } catch (_) {}
          errors.add('Add $pid: $e');
        }
      }

      if (!mounted) return;
      if (errors.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Some items failed: ${errors.first}')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Loaded $_totalUnits units onto ${widget.vehicleName}')),
        );
      }
      Navigator.pop(context, errors.isEmpty);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Load failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = _search.toLowerCase().trim();
    final visible = q.isEmpty
        ? _items
        : _items.where((i) => i.name.toLowerCase().contains(q)).toList();

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
              'Load Van',
              style: GoogleFonts.hankenGrotesk(
                fontWeight: FontWeight.w800,
                fontSize: 17,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'WAREHOUSE → ${widget.vehicleName.toUpperCase()}',
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
                        style: GoogleFonts.inter(color: AppColors.danger)),
                  ),
                )
              : Column(
                  children: [
                    // Search
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                      child: TextField(
                        onChanged: (v) => setState(() => _search = v),
                        decoration: InputDecoration(
                          hintText: 'Search products…',
                          prefixIcon: const Icon(LucideIcons.search, size: 18),
                          filled: true,
                          fillColor: AppColors.surface,
                          contentPadding: const EdgeInsets.symmetric(vertical: 4),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide(color: Colors.black.withValues(alpha: 0.06)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide(color: Colors.black.withValues(alpha: 0.06)),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: visible.isEmpty
                          ? Center(
                              child: Text('No warehouse stock',
                                  style: GoogleFonts.inter(color: AppColors.inkTertiary)),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                              itemCount: visible.length,
                              itemBuilder: (context, i) {
                                final item = visible[i];
                                final qty = _qty[item.productId] ?? 0;
                                return Container(
                                  margin: const EdgeInsets.only(bottom: 10),
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: AppColors.surface,
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(
                                      color: qty > 0
                                          ? AppColors.primary.withValues(alpha: 0.4)
                                          : Colors.black.withValues(alpha: 0.06),
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              item.name,
                                              style: GoogleFonts.hankenGrotesk(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 14,
                                                color: AppColors.inkPrimary,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              '${item.available.toStringAsFixed(0)} in warehouse',
                                              style: GoogleFonts.inter(
                                                fontSize: 11,
                                                color: AppColors.inkTertiary,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      _StepBtn(
                                        icon: LucideIcons.minus,
                                        onTap: qty > 0 ? () => _setQty(item, qty - 1) : null,
                                      ),
                                      SizedBox(
                                        width: 38,
                                        child: Text(
                                          '$qty',
                                          textAlign: TextAlign.center,
                                          style: GoogleFonts.jetBrainsMono(
                                            fontWeight: FontWeight.w900,
                                            fontSize: 16,
                                            color: AppColors.inkPrimary,
                                          ),
                                        ),
                                      ),
                                      _StepBtn(
                                        icon: LucideIcons.plus,
                                        onTap: qty < item.available
                                            ? () => _setQty(item, qty + 1)
                                            : null,
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                    ),
                    // Confirm bar
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: SizedBox(
                          height: 54,
                          child: ElevatedButton(
                            onPressed: (_totalUnits > 0 && !_submitting) ? _confirm : null,
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
                                    _totalUnits > 0
                                        ? 'Load Vehicle ($_totalUnits units)'
                                        : 'Select products to load',
                                    style: GoogleFonts.hankenGrotesk(
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
}

class _StepBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _StepBtn({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: enabled
              ? AppColors.primary.withValues(alpha: 0.1)
              : Colors.black.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(
          icon,
          size: 16,
          color: enabled ? AppColors.primary : AppColors.inkTertiary,
        ),
      ),
    );
  }
}
