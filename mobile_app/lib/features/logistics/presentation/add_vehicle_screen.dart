import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/features/logistics/data/models/vehicle.dart';
import 'package:mobile_app/features/logistics/presentation/providers/logistics_provider.dart';
import 'package:mobile_app/features/logistics/presentation/widgets/vehicle_picture.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;

/// "Add Vehicle" (canvas): pick the kind, name it, give it a plate and a
/// status. The same screen edits a vehicle.
class AddVehicleScreen extends ConsumerStatefulWidget {
  /// Non-null = edit this vehicle.
  final Vehicle? vehicle;
  const AddVehicleScreen({super.key, this.vehicle});

  @override
  ConsumerState<AddVehicleScreen> createState() => _AddVehicleScreenState();
}

class _AddVehicleScreenState extends ConsumerState<AddVehicleScreen> {
  final _nameController = TextEditingController();
  final _plateController = TextEditingController();
  String _selectedStatus = 'ACTIVE';
  VehicleKind _kind = VehicleKind.van;
  bool _isLoading = false;
  String? _formError;

  bool get _isEditing => widget.vehicle != null;

  static const _statusOptions = ['ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'];
  static const _statusLabels = ['Active', 'Maintenance', 'Out of service'];

  @override
  void initState() {
    super.initState();
    final v = widget.vehicle;
    if (v != null) {
      _nameController.text = v.name ?? '';
      _plateController.text = v.displayPlate == '—' ? '' : v.displayPlate;
      _selectedStatus = _statusOptions.contains(v.status) ? v.status! : 'ACTIVE';
      _kind = vehicleKindOf(v.type);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _plateController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.isEmpty || _plateController.text.isEmpty) {
      setState(() =>
          _formError = 'Enter the vehicle name and its number plate.');
      return;
    }

    setState(() {
      _isLoading = true;
      _formError = null;
    });
    try {
      final tenantCtx = ref.read(tenantContextProvider).valueOrNull;
      if (tenantCtx == null) {
        throw Exception('Could not tell which shop this is. Sign in again.');
      }
      // id + tenant_id are REQUIRED: vehicles.id has no default and tenant_id
      // defaults to a placeholder that fails RLS. Route through the offline
      // queue (upsert by id) so add/edit both work online or offline.
      final payload = {
        'id': _isEditing
            ? widget.vehicle!.id
            : 'VEH-${DateTime.now().millisecondsSinceEpoch}-${DateTime.now().microsecond}',
        'tenant_id': tenantCtx.tenantId,
        'name': _nameController.text.trim(),
        'plateNumber': _plateController.text.trim().toUpperCase(),
        'status': _selectedStatus,
        // No driver here: vehicles has no driver column, and sending one made
        // Postgres reject the whole save (PGRST204). A vehicle's driver is
        // whoever is on its route.
        'type': vehicleKindValue(_kind),
      };

      await ref.read(syncServiceProvider).upsertOnlineOrQueue('vehicles', payload);

      if (mounted) {
        ref.invalidate(vehiclesProvider);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                _isEditing ? 'Vehicle updated' : 'Vehicle added to fleet'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        debugPrint('[fleet] vehicle save failed: $e');
        setState(() => _formError =
            'May not have saved. Check the vehicle list before trying again. ($e)');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Widget _kindCard(VehicleKind k) {
    final on = _kind == k;
    return Expanded(
      child: Semantics(
        button: true,
        selected: on,
        label: vehicleKindLabel(k),
        excludeSemantics: true,
        child: BlTap(
          onTap: () => setState(() => _kind = k),
          child: Container(
            padding: const EdgeInsets.fromLTRB(4, 10, 4, 8),
            decoration: BoxDecoration(
                color: on ? const Color(0xFFFFF8EC) : Bl.wellSoft,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                    color: on ? Bl.brand : const Color(0x00FFFFFF),
                    width: 1.5)),
            child: Column(
              children: [
                VehiclePicture(k, width: 120),
                const SizedBox(height: 4),
                Text(vehicleKindLabel(k),
                    style: Bl.tight(12,
                        w: FontWeight.w600, ls: 0, c: on ? Bl.ink : Bl.body)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(title: _isEditing ? 'Edit Vehicle' : 'Add Vehicle'),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(18, 4, 18, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 8),
                    Text('Which vehicle?',
                        style: Bl.tight(24, w: FontWeight.w700, ls: -0.03)),
                    const SizedBox(height: 12),
                    Text('Vehicle type',
                        style: Bl.tight(13, w: FontWeight.w600, c: Bl.ink3)),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _kindCard(VehicleKind.van),
                        const SizedBox(width: 8),
                        _kindCard(VehicleKind.miniTruck),
                      ],
                    ),
                    BlField(
                      label: 'Vehicle name or model',
                      hint: 'e.g. Tata Ace 2023',
                      controller: _nameController,
                      capitalization: TextCapitalization.words,
                    ),
                    BlField(
                      label: 'Number plate',
                      hint: 'e.g. MH 12 AB 1234',
                      controller: _plateController,
                      capitalization: TextCapitalization.characters,
                    ),
                    const SizedBox(height: 12),
                    Text('Status',
                        style: Bl.tight(13, w: FontWeight.w600, c: Bl.ink3)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                          color: Bl.wellSoft,
                          borderRadius: BorderRadius.circular(14)),
                      child: Row(
                        children: [
                          for (var i = 0; i < _statusOptions.length; i++)
                            Expanded(
                              child: Semantics(
                                button: true,
                                selected:
                                    _selectedStatus == _statusOptions[i],
                                label: _statusLabels[i],
                                excludeSemantics: true,
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () => setState(() =>
                                      _selectedStatus = _statusOptions[i]),
                                  child: Container(
                                    height: 44,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: _selectedStatus ==
                                              _statusOptions[i]
                                          ? Bl.white
                                          : null,
                                      borderRadius:
                                          BorderRadius.circular(11),
                                      boxShadow: _selectedStatus ==
                                              _statusOptions[i]
                                          ? const [
                                              BoxShadow(
                                                  color: Color(0x1F000000),
                                                  blurRadius: 2,
                                                  offset: Offset(0, 1)),
                                            ]
                                          : null,
                                    ),
                                    child: FittedBox(
                                      fit: BoxFit.scaleDown,
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 4),
                                        child: Text(_statusLabels[i],
                                            maxLines: 1,
                                            style: Bl.tight(13.5,
                                                w: FontWeight.w600,
                                                ls: 0,
                                                c: _selectedStatus ==
                                                        _statusOptions[i]
                                                    ? Bl.ink
                                                    : Bl.body)),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (_formError != null)
                      Container(
                        margin: const EdgeInsets.only(top: 12),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 9),
                        decoration: BoxDecoration(
                            color: Bl.redSoft,
                            borderRadius: BorderRadius.circular(12)),
                        child: Text(_formError!,
                            style: Bl.inter(12.5,
                                w: FontWeight.w500, c: Bl.redDeep)),
                      ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: BlButton(_isEditing ? 'Save changes' : 'Add to fleet',
                  loading: _isLoading, onTap: _isLoading ? null : _submit),
            ),
          ],
        ),
      ),
    );
  }
}
