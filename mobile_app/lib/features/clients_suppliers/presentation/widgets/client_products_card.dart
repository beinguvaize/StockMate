import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/core/utils/units.dart';
import 'package:mobile_app/features/clients_suppliers/data/client_products.dart';

/// What this client actually buys, under the money statement. Rolled up from
/// sales already in memory, so it costs no query and works offline exactly as
/// far as the cached sales do.
class ClientProductsCard extends StatefulWidget {
  final List<ClientProductLine> lines;
  const ClientProductsCard({super.key, required this.lines});

  @override
  State<ClientProductsCard> createState() => _ClientProductsCardState();
}

class _ClientProductsCardState extends State<ClientProductsCard> {
  // A regular customer can have dozens of products. Show the spend that
  // matters, offer the rest.
  static const _collapsed = 6;
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final lines = widget.lines;
    final n = _expanded ? lines.length : lines.length.clamp(0, _collapsed);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BlGroupHeader('Products bought',
            trailing: '${lines.length} item${lines.length == 1 ? '' : 's'}'),
        if (lines.isEmpty)
          // Says why it can be empty when the ledger is not: a balance can
          // come from an invoice raised without going through the till.
          const BlEmpty(
            icon: BlIcons.box,
            title: 'No products recorded for this client yet',
            message: 'Sales billed to them will appear here',
          ),
        for (var i = 0; i < n; i++)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
            decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: Bl.sep))),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(lines[i].name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Bl.tight(14, w: FontWeight.w600)),
                      const SizedBox(height: 1),
                      Text(
                          [
                            formatQty(lines[i].qty, lines[i].unit),
                            if (lines[i].orders > 1)
                              '${lines[i].orders} times',
                            if (lines[i].lastDate.isNotEmpty)
                              'last ${_shortDate(lines[i].lastDate)}',
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Bl.inter(12, c: const Color(0xFF7A8088))),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Text(Money.inr(lines[i].value),
                    style: Bl.tight(14.5, w: FontWeight.w600)),
              ],
            ),
          ),
        if (lines.length > _collapsed)
          Align(
            alignment: Alignment.centerLeft,
            child: BlTap(
              onTap: () => setState(() => _expanded = !_expanded),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                child: Text(
                    _expanded
                        ? 'Show less'
                        : 'Show all ${lines.length} products',
                    style: Bl.tight(13, w: FontWeight.w600, c: Bl.amberDeep)),
              ),
            ),
          ),
      ],
    );
  }

  /// '2026-08-05' → '5 Aug'. Returns the input untouched if it is not ISO.
  static String _shortDate(String iso) {
    if (iso.length < 10) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final m = int.tryParse(iso.substring(5, 7));
    final d = int.tryParse(iso.substring(8, 10));
    if (m == null || d == null || m < 1 || m > 12) return iso;
    return '$d ${months[m - 1]}';
  }
}
