import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/logistics/presentation/widgets/vehicle_picture.dart';

const _grey = Color(0xFF7A8088);

/// "Fleet Map" (canvas): where each vehicle was last seen. Positions are
/// saved at delivery events (dispatch, stop completed), not tracked live.
class FleetMapScreen extends ConsumerStatefulWidget {
  const FleetMapScreen({super.key});

  @override
  ConsumerState<FleetMapScreen> createState() => _FleetMapScreenState();
}

class _VanLoc {
  final String vehicleId;
  final String name;
  final String plate;
  final VehicleKind kind;
  final double lat;
  final double lng;
  final DateTime? at;
  _VanLoc({
    required this.vehicleId,
    required this.name,
    required this.plate,
    required this.kind,
    required this.lat,
    required this.lng,
    this.at,
  });
}

class _FleetMapScreenState extends ConsumerState<FleetMapScreen> {
  final _map = MapController();
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
          .select('id, name, plateNumber, plate, type').isFilter('deleted_at', null)
          .eq('tenant_id', tenantId);

      final byId = {for (final v in vehicles) v['id'].toString(): v};

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
        final v = byId[vid];
        final plate = (v?['plateNumber'] ?? v?['plate'] ?? '').toString();
        vans.add(_VanLoc(
          vehicleId: vid,
          name: v?['name']?.toString() ?? 'Vehicle',
          plate: plate,
          kind: vehicleKindOf(v?['type']?.toString()),
          lat: lat,
          lng: lng,
          at: DateTime.tryParse(l['updated_at']?.toString() ?? ''),
        ));
      }

      if (mounted) setState(() { _vans = vans; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  String _ago(DateTime? t, {bool short = false}) {
    if (t == null) return '';
    final d = DateTime.now().difference(t);
    final tail = short ? '' : ' ago';
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes}m$tail';
    if (d.inHours < 24) return '${d.inHours}h$tail';
    return '${d.inDays}d$tail';
  }

  @override
  Widget build(BuildContext context) {
    final center = _vans.isNotEmpty
        ? LatLng(_vans.first.lat, _vans.first.lng)
        : const LatLng(20.5937, 78.9629); // India centroid fallback

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              title: 'Fleet Map',
              trailing: BlRoundButton(BlIcons.sync,
                  label: 'Refresh', onTap: _loading ? null : _fetch),
            ),
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
                                'Could not load vehicle places. Check your internet and try again. ($_error)',
                                textAlign: TextAlign.center,
                                style:
                                    Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                          ),
                        )
                      : ListView(
                          padding: const EdgeInsets.only(bottom: 24),
                          children: [
                            Container(
                              height: 300,
                              margin:
                                  const EdgeInsets.fromLTRB(16, 6, 16, 0),
                              clipBehavior: Clip.antiAlias,
                              decoration: BoxDecoration(
                                  color: Bl.well,
                                  borderRadius: BorderRadius.circular(20)),
                              child: FlutterMap(
                                mapController: _map,
                                options: MapOptions(
                                  initialCenter: center,
                                  initialZoom: _vans.isEmpty ? 4.5 : 12,
                                ),
                                children: [
                                  TileLayer(
                                    urlTemplate:
                                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                                    userAgentPackageName:
                                        'com.ledgr.mobile_app',
                                  ),
                                  MarkerLayer(
                                    markers: [
                                      for (final v in _vans)
                                        Marker(
                                          point: LatLng(v.lat, v.lng),
                                          width: 170,
                                          height: 58,
                                          alignment: Alignment.topCenter,
                                          child: Column(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Container(
                                                padding: const EdgeInsets
                                                    .symmetric(
                                                    horizontal: 9,
                                                    vertical: 4),
                                                decoration: BoxDecoration(
                                                  color: Bl.ink,
                                                  borderRadius:
                                                      BorderRadius.circular(
                                                          999),
                                                ),
                                                child: Text(
                                                    '${v.name} · ${_ago(v.at, short: true)}',
                                                    maxLines: 1,
                                                    overflow: TextOverflow
                                                        .ellipsis,
                                                    style: Bl.tight(11.5,
                                                        w: FontWeight.w600,
                                                        ls: 0,
                                                        c: Bl.white)),
                                              ),
                                              const SizedBox(height: 2),
                                              Container(
                                                width: 14,
                                                height: 14,
                                                decoration: BoxDecoration(
                                                    color: Bl.brand,
                                                    shape: BoxShape.circle,
                                                    border: Border.all(
                                                        color: Bl.white,
                                                        width: 2.5)),
                                              ),
                                            ],
                                          ),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(18, 4, 18, 0),
                              child: Text('Map © OpenStreetMap contributors',
                                  textAlign: TextAlign.right,
                                  style: Bl.inter(10.5, c: Bl.mute)),
                            ),
                            BlGroupHeader('Last seen',
                                trailing: '${_vans.length}'),
                            if (_vans.isEmpty)
                              const BlEmpty(
                                icon:
                                    '<path d="M12 21s7-6.200 7-11a7 7 0 10-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.500"/>',
                                title: 'No vehicle places yet',
                              ),
                            for (final v in _vans)
                              Semantics(
                                button: true,
                                label:
                                    '${v.name}, last seen ${_ago(v.at)}. Show on map',
                                excludeSemantics: true,
                                child: BlTap(
                                  onTap: () =>
                                      _map.move(LatLng(v.lat, v.lng), 14),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 18, vertical: 10),
                                    decoration: const BoxDecoration(
                                        border: Border(
                                            bottom:
                                                BorderSide(color: Bl.sep))),
                                    child: Row(
                                      children: [
                                        VehiclePicture(v.kind, width: 64, ground: Bl.white),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(v.name,
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: Bl.tight(14.5,
                                                      w: FontWeight.w600)),
                                              if (v.plate.isNotEmpty) ...[
                                                const SizedBox(height: 1),
                                                Text(v.plate,
                                                    maxLines: 1,
                                                    overflow: TextOverflow
                                                        .ellipsis,
                                                    style: Bl.inter(12,
                                                        c: _grey)),
                                              ],
                                            ],
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Text(_ago(v.at),
                                            style: Bl.inter(12.5,
                                                w: FontWeight.w500,
                                                c: _grey)),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            Container(
                              margin:
                                  const EdgeInsets.fromLTRB(18, 14, 18, 0),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 11),
                              decoration: BoxDecoration(
                                  color: Bl.tile,
                                  borderRadius: BorderRadius.circular(12)),
                              child: Row(
                                children: [
                                  const BlIcon(
                                      '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.500"/>',
                                      size: 18,
                                      color: Bl.body),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                        'Places are saved when a driver dispatches a route or completes a stop.',
                                        style: Bl.inter(12.5,
                                            c: Bl.body, h: 1.4)),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
