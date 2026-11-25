import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';

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
          .select('id').isFilter('deleted_at', null)
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
          .select('id, name').isFilter('deleted_at', null)
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
          .select('id').isFilter('deleted_at', null)
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
          SnackBar(
            content: Text(
                '${errors.length} product${errors.length == 1 ? '' : 's'} may not have moved. Check the van stock before loading again. (${errors.first})'),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 8),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'Loaded $_totalUnits units onto ${widget.vehicleName}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      Navigator.pop(context, errors.isEmpty);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'May not have loaded. Check the van stock before trying again. ($e)'),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 8),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = _search.trim().toLowerCase();
    final shown = q.isEmpty
        ? _items
        : _items.where((i) => i.name.toLowerCase().contains(q)).toList();
    final picked = _qty.length;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Load Van'),
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
                                'Could not load warehouse stock. Check your internet and try again. ($_error)',
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
                                  const EdgeInsets.fromLTRB(16, 6, 16, 0),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 12),
                                decoration: BoxDecoration(
                                    color: Bl.tile,
                                    borderRadius: BorderRadius.circular(16)),
                                child: Row(
                                  children: [
                                    Text('Warehouse',
                                        style: Bl.tight(14,
                                            w: FontWeight.w600)),
                                    const Padding(
                                      padding: EdgeInsets.symmetric(
                                          horizontal: 10),
                                      child: BlIcon(BlIcons.arrowRight,
                                          size: 16,
                                          color: Color(0xFF7A8088)),
                                    ),
                                    Expanded(
                                      child: Text(widget.vehicleName,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: Bl.tight(14,
                                              w: FontWeight.w600)),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            Container(
                              height: 44,
                              margin:
                                  const EdgeInsets.fromLTRB(16, 12, 16, 0),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14),
                              decoration: BoxDecoration(
                                  color: Bl.well,
                                  borderRadius: BorderRadius.circular(999)),
                              child: Row(
                                children: [
                                  const BlIcon(BlIcons.search,
                                      size: 20, color: Bl.mute),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: TextField(
                                      onChanged: (v) =>
                                          setState(() => _search = v),
                                      cursorColor: Bl.brand,
                                      style: Bl.inter(14,
                                          w: FontWeight.w500, c: Bl.ink),
                                      decoration: InputDecoration(
                                        isCollapsed: true,
                                        filled: false,
                                        border: InputBorder.none,
                                        enabledBorder: InputBorder.none,
                                        focusedBorder: InputBorder.none,
                                        hintText: 'Search products',
                                        hintStyle: Bl.inter(14,
                                            w: FontWeight.w500, c: Bl.mute),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            BlGroupHeader('Warehouse stock',
                                trailing: '${shown.length}'),
                            if (shown.isEmpty)
                              BlEmpty(
                                icon: BlIcons.box,
                                title: _items.isEmpty
                                    ? 'Nothing in the warehouse'
                                    : 'No results for "$_search"',
                                message: _items.isEmpty
                                    ? 'Stock has to be in the warehouse before it can go on a van.'
                                    : null,
                              ),
                            for (final item in shown)
                              Builder(builder: (context) {
                                final n = _qty[item.productId] ?? 0;
                                final avail = item.available.toInt();
                                return Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 18, vertical: 10),
                                  decoration: const BoxDecoration(
                                      border: Border(
                                          bottom:
                                              BorderSide(color: Bl.sep))),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(item.name,
                                                maxLines: 1,
                                                overflow:
                                                    TextOverflow.ellipsis,
                                                style: Bl.tight(14.5,
                                                    w: FontWeight.w600)),
                                            const SizedBox(height: 1),
                                            Text('$avail in warehouse',
                                                style: Bl.inter(12,
                                                    c: const Color(
                                                        0xFF7A8088))),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Container(
                                        padding: const EdgeInsets.all(3),
                                        decoration: BoxDecoration(
                                            color: Bl.wellSoft,
                                            borderRadius:
                                                BorderRadius.circular(999)),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            _StepBtn(
                                                icon: BlIcons.minus,
                                                label:
                                                    'One fewer ${item.name}',
                                                onTap: n > 0
                                                    ? () =>
                                                        _setQty(item, n - 1)
                                                    : null),
                                            SizedBox(
                                              width: 38,
                                              child: Text('$n',
                                                  textAlign: TextAlign.center,
                                                  style: Bl.tight(15,
                                                      w: FontWeight.w700,
                                                      c: n > 0
                                                          ? Bl.ink
                                                          : Bl.mute)),
                                            ),
                                            _StepBtn(
                                                icon: BlIcons.plus,
                                                label:
                                                    'One more ${item.name}',
                                                onTap: n < avail
                                                    ? () =>
                                                        _setQty(item, n + 1)
                                                    : null),
                                          ],
                                        ),
                                      ),
                                    ],
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
                                picked == 0
                                    ? 'Nothing picked yet'
                                    : 'Loading · $picked product${picked == 1 ? '' : 's'}',
                                style: Bl.inter(13,
                                    w: FontWeight.w500, c: Bl.body)),
                          ),
                          Text(
                              '$_totalUnits unit${_totalUnits == 1 ? '' : 's'}',
                              style: Bl.tight(14, w: FontWeight.w700)),
                        ],
                      ),
                    ),
                    BlButton('Load vehicle',
                        loading: _submitting,
                        onTap: _totalUnits > 0 && !_submitting
                            ? _confirm
                            : null),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _StepBtn extends StatelessWidget {
  final String icon;
  final String label;
  final VoidCallback? onTap;
  const _StepBtn({required this.icon, required this.label, this.onTap});

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        enabled: onTap != null,
        label: label,
        excludeSemantics: true,
        child: BlTap(
          onTap: onTap,
          child: Opacity(
            opacity: onTap == null ? 0.35 : 1,
            child: Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                  color: Bl.white, shape: BoxShape.circle),
              child: BlIcon(icon, size: 16, stroke: 2.2),
            ),
          ),
        ),
      );
}
