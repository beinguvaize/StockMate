import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/features/logistics/presentation/providers/driver_provider.dart';
import 'package:mobile_app/features/logistics/presentation/providers/logistics_provider.dart';
import 'package:mobile_app/features/logistics/presentation/widgets/vehicle_picture.dart';

const _grey = Color(0xFF7A8088);

String _units(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

/// "Van Stock" (canvas): what one vehicle is carrying right now.
class VanStockScreen extends ConsumerWidget {
  final String vehicleId;

  /// Shown at once when the caller already has them; otherwise looked up
  /// from the vehicle list.
  final String? vehicleName;
  final String? plate;
  final VehicleKind? kind;
  const VanStockScreen(
      {super.key,
      required this.vehicleId,
      this.vehicleName,
      this.plate,
      this.kind});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stockAsync = ref.watch(vanStockProvider(vehicleId));
    final vehicle = ref
        .watch(vehiclesProvider)
        .valueOrNull
        ?.where((v) => v.id == vehicleId)
        .firstOrNull;
    final name = vehicleName ?? vehicle?.name ?? 'Vehicle';
    final plateText = plate ??
        (vehicle == null || vehicle.displayPlate == '—'
            ? ''
            : vehicle.displayPlate);
    final picture = kind ?? vehicleKindOf(vehicle?.type);

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Van Stock'),
            Expanded(
              child: stockAsync.when(
                skipLoadingOnReload: true,
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'Could not load this van. Check your internet and try again. ($e)',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                  ),
                ),
                data: (all) {
                  final items = all.where((i) => i.quantity > 0).toList()
                    ..sort((a, b) => b.quantity.compareTo(a.quantity));
                  final totalUnits =
                      items.fold(0.0, (s, i) => s + i.quantity);
                  return ListView(
                    padding: const EdgeInsets.only(bottom: 24),
                    children: [
                      Container(
                        margin: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                            color: Bl.tile,
                            borderRadius: BorderRadius.circular(18)),
                        child: Row(
                          children: [
                            VehiclePicture(picture, width: 96),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Bl.tight(15,
                                          w: FontWeight.w600)),
                                  if (plateText.isNotEmpty) ...[
                                    const SizedBox(height: 1),
                                    Text(plateText,
                                        style: Bl.inter(12, c: _grey)),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('${_units(totalUnits)} units',
                                    style:
                                        Bl.tight(16, w: FontWeight.w700)),
                                Text(
                                    '${items.length} product${items.length == 1 ? '' : 's'}',
                                    style: Bl.inter(11.5, c: _grey)),
                              ],
                            ),
                          ],
                        ),
                      ),
                      BlGroupHeader('On board', trailing: '${items.length}'),
                      if (items.isEmpty)
                        const BlEmpty(
                          icon: BlIcons.box,
                          title: 'Van is empty',
                          message: 'Nothing is loaded on this van.',
                        ),
                      for (final item in items)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 18, vertical: 11),
                          decoration: const BoxDecoration(
                              border:
                                  Border(bottom: BorderSide(color: Bl.sep))),
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Row(
                                      children: [
                                        Flexible(
                                          child: Text(item.productName,
                                              maxLines: 1,
                                              overflow:
                                                  TextOverflow.ellipsis,
                                              style: Bl.tight(14.5,
                                                  w: FontWeight.w600)),
                                        ),
                                        if (item.quantity < 5) ...[
                                          const SizedBox(width: 6),
                                          BlStatusPill.yellow('Low stock'),
                                        ],
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Text('${_units(item.quantity)} units',
                                      style: Bl.tight(14.5,
                                          w: FontWeight.w600)),
                                ],
                              ),
                              const SizedBox(height: 8),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(2),
                                child: LinearProgressIndicator(
                                  value: totalUnits > 0
                                      ? (item.quantity / totalUnits)
                                          .clamp(0.0, 1.0)
                                      : 0,
                                  minHeight: 4,
                                  backgroundColor: Bl.well,
                                  color: item.quantity < 5
                                      ? Bl.brand
                                      : Bl.ink,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
