// ignore_for_file: use_build_context_synchronously
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/sales/presentation/add_sale_screen.dart';

// ── Role routing ──────────────────────────────────────────────────────────────

/// Route "New Sale" based on user roles:
///   DRIVER              → Van Sale directly (no choice)
///   OWNER / GLOBAL_ADMIN → choice sheet (POS or Van)
///   SALES / STAFF       → POS Sale directly (no choice)
Future<void> navigateToNewSale(BuildContext context, List<String> roles) {
  if (roles.contains('DRIVER')) {
    return _resolveAndOpenVanSale(context);
  }
  if (roles.contains('OWNER') || roles.contains('GLOBAL_ADMIN')) {
    return _showSaleTypeSheet(context);
  }
  // SALES / STAFF — POS only
  Navigator.push(context, MaterialPageRoute(builder: (_) => const AddSaleScreen()));
  return Future.value();
}

// ── Van sale resolver (shared by sheet + direct DRIVER path) ──────────────────

// onBeforeNavigate is called AFTER all async data is resolved and
// immediately BEFORE navigating — used to close the choice sheet so the
// sheet-pop and the screen-push run back-to-back (no async gap → no race).
Future<void> _resolveAndOpenVanSale(
  BuildContext context, {
  VoidCallback? onBeforeNavigate,
}) async {
  // Push on the root navigator so the AddSaleScreen sits above the
  // dashboard tab navigator (otherwise the navigation can silently
  // route into an inner navigator and the user sees no change).
  final nav       = Navigator.of(context, rootNavigator: true);
  final messenger = ScaffoldMessenger.of(context);

  // Resolve tenant_id
  final session = supabase.auth.currentSession;
  String? tenantId = session?.user.userMetadata?['tenant_id'] as String?;
  if (tenantId == null || tenantId.isEmpty) {
    final uid = supabase.auth.currentUser?.id;
    if (uid != null) {
      final row = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', uid)
          .maybeSingle();
      tenantId = row?['tenant_id'] as String?;
    }
  }

  // Fetch VEHICLE inventory locations (id = locationId, reference_id = vehicleId)
  var locQuery = supabase
      .from('inventory_locations')
      .select('id, reference_id').isFilter('deleted_at', null)
      .eq('type', 'VEHICLE');
  if (tenantId != null && tenantId.isNotEmpty) {
    locQuery = locQuery.eq('tenant_id', tenantId);
  }
  final locs = (await locQuery) as List<dynamic>;

  if (locs.isEmpty) {
    onBeforeNavigate?.call();
    messenger.showSnackBar(
      const SnackBar(content: Text('No vehicles found. Load stock to a van first.')),
    );
    return;
  }

  // Map vehicleId → locationId
  final locMap = <String, String>{
    for (final l in locs) l['reference_id'] as String: l['id'] as String,
  };

  final vehicleIds = locMap.keys.toList();

  final vehicles = (await supabase
      .from('vehicles')
      .select('id, name, plate, "plateNumber"').isFilter('deleted_at', null)
      .inFilter('id', vehicleIds)) as List<dynamic>;

  if (vehicles.isEmpty) {
    onBeforeNavigate?.call();
    messenger.showSnackBar(const SnackBar(content: Text('No vehicles found.')));
    return;
  }

  if (vehicles.length == 1) {
    final vehicleId = vehicles[0]['id'] as String;
    onBeforeNavigate?.call();          // close sheet
    nav.push(MaterialPageRoute(        // push — same sync block, no race
      builder: (_) => AddSaleScreen(
        vehicleId: vehicleId,
        locationId: locMap[vehicleId],
      ),
    ));
    return;
  }

  // Multiple vans — picker
  onBeforeNavigate?.call();
  showBlSheet(
    context: context,
    useRootNavigator: true,
    builder: (_) => _VehiclePicker(vehicles: vehicles, locMap: locMap, parentContext: context),
  );
}


Future<void> _showSaleTypeSheet(BuildContext context) {
  return showBlSheet(
    context: context,
    useRootNavigator: true,
    builder: (_) => _SaleTypeSheet(parentContext: context),
  );
}

class _SaleTypeSheet extends StatefulWidget {
  final BuildContext parentContext;
  const _SaleTypeSheet({required this.parentContext});

  @override
  State<_SaleTypeSheet> createState() => _SaleTypeSheetState();
}

class _SaleTypeSheetState extends State<_SaleTypeSheet> {
  bool _loadingVan = false;

  void _goPOS() {
    // Sheet was opened with useRootNavigator:true, so we pop on the root
    // and push on the same root — keeps the AddSaleScreen full-screen
    // above any inner shell navigator instead of getting swallowed by
    // the dashboard tab navigator (which made the tap appear to do
    // nothing on some layouts).
    final rootNav = Navigator.of(context, rootNavigator: true);
    rootNav.pop();
    rootNav.push(MaterialPageRoute(builder: (_) => const AddSaleScreen()));
  }

  Future<void> _goVan() async {
    if (_loadingVan) return;
    setState(() => _loadingVan = true);
    final sheetNav  = Navigator.of(context);
    final parentCtx = widget.parentContext;
    try {
      // Resolve data while the sheet stays open (spinner visible). The sheet
      // is popped only once data is ready, right before navigation.
      await _resolveAndOpenVanSale(
        parentCtx,
        onBeforeNavigate: () { if (sheetNav.canPop()) sheetNav.pop(); },
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingVan = false);
      debugPrint('[saleType] failed: $e');
      ScaffoldMessenger.of(parentCtx).showSnackBar(const SnackBar(
          content: Text('Something went wrong. Please try again.')));
    }
  }

  static const _shop =
      '<path opacity=".45" d="M4 10h16v10a1 1 0 01-1 1H5a1 1 0 01-1-1z"/><path d="M3 4h18l1 5a3 3 0 01-5.5 1.5 3 3 0 01-5 0 3 3 0 01-5 0A3 3 0 012 9z"/>';
  static const _van =
      '<path opacity=".45" d="M2 6a1 1 0 011-1h11v11H2z"/><path d="M14 8h4l4 4v4h-8z"/><circle cx="6.5" cy="17.5" r="2.3"/><circle cx="17.5" cy="17.5" r="2.3"/>';

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BlSheetTitle('New Sale', size: 16),
        const SizedBox(height: 12),
        Text('Where should stock be deducted from?',
            style: Bl.inter(13, w: FontWeight.w500)),
        const SizedBox(height: 12),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _SaleTile(
                  svg: _shop,
                  primary: true,
                  title: 'POS Sale',
                  subtitle: 'Stock deducted from warehouse',
                  onTap: _goPOS,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _SaleTile(
                  svg: _van,
                  title: 'Van Sale',
                  subtitle: 'Stock deducted from vehicle',
                  loading: _loadingVan,
                  onTap: _loadingVan ? null : _goVan,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// One of the two big choices: amber for the usual one, grey for the other.
class _SaleTile extends StatelessWidget {
  final String svg;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool loading;
  final bool primary;

  const _SaleTile({
    required this.svg,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.loading = false,
    this.primary = false,
  });

  @override
  Widget build(BuildContext context) {
    final fg = primary ? Bl.white : Bl.ink;
    final chip = primary ? const Color(0x38FFFFFF) : Bl.white;
    return BlTap(
      label: '$title. $subtitle',
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 150),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: primary ? Bl.amber : const Color(0xFFF6F5F3),
            borderRadius: BorderRadius.circular(20)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: chip, borderRadius: BorderRadius.circular(14)),
              child: SvgPicture.string(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${primary ? '#ffffff' : '#2563EB'}">$svg</svg>',
                width: 24,
                height: 24,
              ),
            ),
            const SizedBox(height: 14),
            Text(title, style: Bl.tight(16, w: FontWeight.w700, c: fg)),
            const SizedBox(height: 3),
            Text(subtitle,
                style: Bl.inter(12,
                    w: FontWeight.w500,
                    h: 1.35,
                    c: primary
                        ? const Color(0xE0FFFFFF)
                        : const Color(0xFF7A8088))),
            const Spacer(),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerRight,
              child: Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: chip, shape: BoxShape.circle),
                child: loading
                    ? SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: fg))
                    : BlIcon(BlIcons.arrowRight, size: 16, color: fg),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _VehiclePicker extends StatelessWidget {
  final List<dynamic> vehicles;
  final Map<String, String> locMap; // vehicleId → locationId
  final BuildContext parentContext;

  const _VehiclePicker({required this.vehicles, required this.locMap, required this.parentContext});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BlSheetTitle('Select Vehicle', size: 16),
        const SizedBox(height: 2),
        ...vehicles.map((v) {
          final id = v['id'] as String;
          final name = (v['name'] as String?) ?? 'Vehicle';
          final plate = (v['plate'] ?? v['plateNumber']) as String? ?? '';
          return BlTap(
            label: plate.isEmpty ? name : '$name, $plate',
            onTap: () {
              Navigator.pop(context);
              Navigator.push(
                parentContext,
                MaterialPageRoute(
                  builder: (_) => AddSaleScreen(
                    vehicleId: id,
                    locationId: locMap[id],
                  ),
                ),
              );
            },
            child: Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFECEAE7)),
              ),
              child: Row(
                children: [
                  const BlIconTile(BlIcons.truck,
                      bg: Bl.blueSoft, fg: Bl.blue),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: Bl.tight(14, w: FontWeight.w600)),
                        if (plate.isNotEmpty)
                          Text(plate, style: Bl.inter(12, c: Bl.mute)),
                      ],
                    ),
                  ),
                  const BlIcon(BlIcons.chevronRight,
                      size: 16, color: Color(0xFFC4C8CC)),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}
