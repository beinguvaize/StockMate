// ignore_for_file: use_build_context_synchronously
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
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
      .select('id, reference_id')
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
      .select('id, name, plate, "plateNumber"')
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
  showModalBottomSheet(
    context: context,
    backgroundColor: AppColors.surface,
    useRootNavigator: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _VehiclePicker(vehicles: vehicles, locMap: locMap, parentContext: context),
  );
}

// ── POS / Van choice sheet (OWNER / GLOBAL_ADMIN only) ───────────────────────

Future<void> _showSaleTypeSheet(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    backgroundColor: AppColors.surface,
    useRootNavigator: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (_) => _SaleTypeSheet(parentContext: context),
  );
}

// ── Sheet body ────────────────────────────────────────────────────────────────

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

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20, 24, 20, MediaQuery.of(context).viewInsets.bottom + 40,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 36, height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          Text(
            'New Sale',
            style: GoogleFonts.manrope(
              fontSize: 22, fontWeight: FontWeight.w800,
              color: AppColors.inkPrimary, letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Where should stock be deducted from?',
            style: GoogleFonts.manrope(fontSize: 13, color: AppColors.inkSecondary),
          ),
          const SizedBox(height: 24),

          _SaleTile(
            icon: LucideIcons.shoppingBag,
            iconColor: AppColors.primary,
            title: 'POS Sale',
            subtitle: 'Stock deducted from warehouse',
            onTap: _goPOS,
          ),
          const SizedBox(height: 12),
          _SaleTile(
            icon: LucideIcons.truck,
            iconColor: AppColors.secondary,
            title: 'Van Sale',
            subtitle: 'Stock deducted from vehicle',
            loading: _loadingVan,
            onTap: _loadingVan ? null : _goVan,
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

// ── Tile ──────────────────────────────────────────────────────────────────────

class _SaleTile extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool loading;

  const _SaleTile({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: AppColors.canvas,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
        ),
        child: Row(
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, size: 22, color: iconColor),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.manrope(
                      fontSize: 16, fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: GoogleFonts.manrope(
                      fontSize: 12, color: AppColors.inkSecondary,
                    ),
                  ),
                ],
              ),
            ),
            if (loading)
              const SizedBox(
                width: 18, height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.secondary),
              )
            else
              const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.inkTertiary),
          ],
        ),
      ),
    );
  }
}

// ── Vehicle picker (multiple vans) ────────────────────────────────────────────

class _VehiclePicker extends StatelessWidget {
  final List<dynamic> vehicles;
  final Map<String, String> locMap; // vehicleId → locationId
  final BuildContext parentContext;

  const _VehiclePicker({required this.vehicles, required this.locMap, required this.parentContext});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          Text(
            'Select Vehicle',
            style: GoogleFonts.manrope(
              fontSize: 20, fontWeight: FontWeight.w800,
              color: AppColors.inkPrimary, letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 16),
          ...vehicles.map((v) {
            final id    = v['id'] as String;
            final name  = (v['name'] as String?) ?? 'Vehicle';
            final plate = (v['plate'] ?? v['plateNumber']) as String? ?? '';
            return GestureDetector(
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
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                decoration: BoxDecoration(
                  color: AppColors.canvas,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 40, height: 40,
                      decoration: BoxDecoration(
                        color: AppColors.secondary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(LucideIcons.truck, size: 18, color: AppColors.secondary),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name,
                            style: GoogleFonts.manrope(
                              fontSize: 15, fontWeight: FontWeight.w700,
                              color: AppColors.inkPrimary,
                            ),
                          ),
                          if (plate.isNotEmpty)
                            Text(plate,
                              style: GoogleFonts.jetBrainsMono(
                                fontSize: 11, color: AppColors.inkTertiary,
                              ),
                            ),
                        ],
                      ),
                    ),
                    const Icon(LucideIcons.chevronRight, size: 14, color: AppColors.inkTertiary),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
