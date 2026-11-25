import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'providers/manufacturing_provider.dart';

const _grey = Color(0xFF7A8088);
const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _factoryIcon = '<path d="M3 21V10l6 4V10l6 4V5h5v16z"/>';
const _bomIcon =
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h6"/>';
const _infoIcon = '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>';

String _date(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso);
  if (d == null) return '';
  return '${d.day} ${_mon[d.month - 1]}${d.year == DateTime.now().year ? '' : ' ${d.year}'}';
}

String _qty(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

/// Status as the owner reads it: label, tint, ink.
(String, Color, Color) _statusLook(String status) => switch (status) {
      'COMPLETED' => ('Completed', const Color(0xFFE3F5EA), const Color(0xFF17663A)),
      'IN_PROGRESS' => ('In progress', const Color(0xFFE4EEFF), const Color(0xFF1D4E9E)),
      'CANCELLED' => ('Cancelled', const Color(0xFFFDE2E2), Bl.redDeep),
      _ => ('Planned', const Color(0xFFEFEEEC), Bl.body),
    };

/// "Manufacturing" (canvas): production orders and bills of materials. View
/// only on the phone.
class ManufacturingScreen extends ConsumerStatefulWidget {
  const ManufacturingScreen({super.key});

  @override
  ConsumerState<ManufacturingScreen> createState() =>
      _ManufacturingScreenState();
}

class _ManufacturingScreenState extends ConsumerState<ManufacturingScreen> {
  int _tab = 0;

  Widget _note(String text) => Container(
        margin: const EdgeInsets.fromLTRB(18, 16, 18, 0),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
            color: Bl.tile, borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            const BlIcon(_infoIcon, size: 18, color: Bl.body),
            const SizedBox(width: 10),
            Expanded(
                child: Text(text, style: Bl.inter(12.5, c: Bl.body, h: 1.4))),
          ],
        ),
      );

  Widget _row(
          {required String icon,
          required Color tile,
          required Color ink,
          required String title,
          required String sub,
          Widget? trailing}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Bl.sep))),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: tile, borderRadius: BorderRadius.circular(12)),
              child: BlIcon(icon, size: 18, color: ink),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.tight(14.5, w: FontWeight.w600)),
                  const SizedBox(height: 1),
                  Text(sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Bl.inter(12, c: _grey)),
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 10), trailing],
          ],
        ),
      );

  Widget _failed(Object e, String what) => Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
            'Could not load $what. Check your internet and try again. ($e)',
            textAlign: TextAlign.center,
            style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
      );

  @override
  Widget build(BuildContext context) {
    final bomsAsync = ref.watch(bomsProvider);
    final ordersAsync = ref.watch(productionOrdersProvider);
    final orders = ordersAsync.valueOrNull;
    final boms = bomsAsync.valueOrNull;
    final active = _tab == 0 ? ordersAsync : bomsAsync;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Manufacturing'),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
              child: BlSegmented(
                labels: const ['Production orders', 'BOMs'],
                counts: orders == null || boms == null
                    ? null
                    : [orders.length, boms.length],
                index: _tab,
                onChanged: (i) => setState(() => _tab = i),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: Bl.amber,
                onRefresh: () async {
                  ref.invalidate(productionOrdersProvider);
                  ref.invalidate(bomsProvider);
                },
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    if (active.hasError && !active.hasValue)
                      _failed(active.error!,
                          _tab == 0 ? 'production orders' : 'BOMs')
                    else if (!active.hasValue)
                      const SizedBox(
                        height: 200,
                        child: Center(
                            child: CircularProgressIndicator(
                                color: Bl.amber, strokeWidth: 2)),
                      )
                    else if (_tab == 0) ...[
                      BlGroupHeader('Orders', trailing: '${orders!.length}'),
                      if (orders.isEmpty)
                        const BlEmpty(
                            icon: _factoryIcon,
                            title: 'No production orders yet'),
                      for (final o in orders)
                        Builder(builder: (context) {
                          final st = _statusLook(o.status);
                          final d = _date(o.startDate);
                          return _row(
                            icon: _factoryIcon,
                            tile: st.$2,
                            ink: st.$3,
                            title: boms
                                    ?.where((b) => b.id == o.bomId)
                                    .map((b) => b.name)
                                    .firstOrNull ??
                                o.bomName ??
                                'Production order',
                            sub: [
                              '${_qty(o.qty)} unit${o.qty == 1 ? '' : 's'}',
                              if (d.isNotEmpty)
                                o.status == 'IN_PROGRESS' ? 'started $d' : d,
                            ].join(' · '),
                            trailing: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                  color: st.$2,
                                  borderRadius: BorderRadius.circular(999)),
                              child: Text(st.$1,
                                  style: Bl.tight(11,
                                      w: FontWeight.w600, ls: 0, c: st.$3)),
                            ),
                          );
                        }),
                      _note(
                          'View only on the phone. Start and close production orders in the web app.'),
                    ] else ...[
                      BlGroupHeader('Bills of materials',
                          trailing: '${boms!.length}'),
                      if (boms.isEmpty)
                        const BlEmpty(
                            icon: _bomIcon, title: 'No bills of materials yet'),
                      for (final b in boms)
                        _row(
                          icon: _bomIcon,
                          tile: const Color(0xFFF1ECFF),
                          ink: const Color(0xFF5133A8),
                          title: b.name,
                          sub:
                              'Makes ${_qty(b.outputQty)} unit${b.outputQty == 1 ? '' : 's'} per batch',
                        ),
                      _note(
                          'View only on the phone. Create and edit BOMs in the web app.'),
                    ],
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
