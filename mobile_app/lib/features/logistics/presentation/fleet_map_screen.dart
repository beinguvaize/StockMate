import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';

/// FleetMapScreen — last-known location of each vehicle on an OSM map.
/// Positions are captured at delivery events (dispatch, stop completed),
/// not by continuous GPS tracking.
class FleetMapScreen extends ConsumerStatefulWidget {
  const FleetMapScreen({super.key});

  @override
  ConsumerState<FleetMapScreen> createState() => _FleetMapScreenState();
}

class _VanLoc {
  final String vehicleId;
  final String name;
  final double lat;
  final double lng;
  final DateTime? at;
  _VanLoc({
    required this.vehicleId,
    required this.name,
    required this.lat,
    required this.lng,
    this.at,
  });
}

class _FleetMapScreenState extends ConsumerState<FleetMapScreen> {
  bool _loading = true;
  String? _error;
  List<_VanLoc> _vans = [];

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

      final locs = await supabase
          .from('vehicle_locations')
          .select('vehicle_id, lat, lng, updated_at')
          .eq('tenant_id', tenantId)
          .order('updated_at', ascending: false);
      final vehicles = await supabase
          .from('vehicles')
          .select('id, name')
          .eq('tenant_id', tenantId);

      final nameById = {
        for (final v in vehicles) v['id'].toString(): (v['name']?.toString() ?? 'Vehicle')
      };

      // Latest row per vehicle (locs already sorted newest-first).
      final seen = <String>{};
      final vans = <_VanLoc>[];
      for (final l in locs) {
        final vid = l['vehicle_id']?.toString();
        if (vid == null || seen.contains(vid)) continue;
        final lat = (l['lat'] as num?)?.toDouble();
        final lng = (l['lng'] as num?)?.toDouble();
        if (lat == null || lng == null) continue;
        seen.add(vid);
        vans.add(_VanLoc(
          vehicleId: vid,
          name: nameById[vid] ?? 'Vehicle',
          lat: lat,
          lng: lng,
          at: DateTime.tryParse(l['updated_at']?.toString() ?? ''),
        ));
      }

      setState(() { _vans = vans; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  String _ago(DateTime? t) {
    if (t == null) return '';
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes}m ago';
    if (d.inHours < 24) return '${d.inHours}h ago';
    return '${d.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final center = _vans.isNotEmpty
        ? LatLng(_vans.first.lat, _vans.first.lng)
        : const LatLng(20.5937, 78.9629); // India centroid fallback

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
              'Fleet Map',
              style: GoogleFonts.manrope(
                fontWeight: FontWeight.w800,
                fontSize: 17,
                color: AppColors.inkPrimary,
              ),
            ),
            Text(
              'LAST-KNOWN VEHICLE LOCATIONS',
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
                        style: GoogleFonts.manrope(color: AppColors.danger)),
                  ),
                )
              : Stack(
                  children: [
                    FlutterMap(
                      options: MapOptions(
                        initialCenter: center,
                        initialZoom: _vans.isEmpty ? 4.5 : 12,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate:
                              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                          userAgentPackageName: 'com.ledgr.mobile_app',
                        ),
                        MarkerLayer(
                          markers: _vans
                              .map((v) => Marker(
                                    point: LatLng(v.lat, v.lng),
                                    width: 140,
                                    height: 64,
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: AppColors.inkPrimary,
                                            borderRadius:
                                                BorderRadius.circular(8),
                                          ),
                                          child: Text(
                                            v.name,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: GoogleFonts.manrope(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800,
                                              color: Colors.white,
                                            ),
                                          ),
                                        ),
                                        const Icon(LucideIcons.mapPin,
                                            color: AppColors.primary, size: 30),
                                      ],
                                    ),
                                  ))
                              .toList(),
                        ),
                      ],
                    ),
                    if (_vans.isEmpty)
                      Center(
                        child: Container(
                          margin: const EdgeInsets.all(32),
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                                color: Colors.black.withValues(alpha: 0.06)),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(LucideIcons.mapPinOff,
                                  size: 32, color: AppColors.inkTertiary),
                              const SizedBox(height: 10),
                              Text(
                                'No vehicle locations yet',
                                style: GoogleFonts.manrope(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: AppColors.inkPrimary,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Locations are recorded when drivers\ndispatch routes and complete stops.',
                                textAlign: TextAlign.center,
                                style: GoogleFonts.manrope(
                                  fontSize: 12,
                                  color: AppColors.inkTertiary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    // Bottom sheet — vehicle list
                    if (_vans.isNotEmpty)
                      Align(
                        alignment: Alignment.bottomCenter,
                        child: Container(
                          margin: const EdgeInsets.all(12),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                                color: Colors.black.withValues(alpha: 0.06)),
                            boxShadow: [AppColors.cardShadow],
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: _vans
                                .map((v) => ListTile(
                                      dense: true,
                                      leading: const Icon(LucideIcons.truck,
                                          size: 18, color: AppColors.primary),
                                      title: Text(
                                        v.name,
                                        style: GoogleFonts.manrope(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 13,
                                        ),
                                      ),
                                      trailing: Text(
                                        _ago(v.at),
                                        style: GoogleFonts.jetBrainsMono(
                                          fontSize: 10,
                                          color: AppColors.inkTertiary,
                                        ),
                                      ),
                                    ))
                                .toList(),
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }
}
