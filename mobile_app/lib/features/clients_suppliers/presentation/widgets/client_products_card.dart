import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/utils/units.dart';
import 'package:mobile_app/features/clients_suppliers/data/client_products.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/widgets/client_utils.dart';

/// What this client actually buys, under the money statement.
///
/// The sheet already answers "how much do they owe". Standing at a counter with
/// a customer in front of you, the other question is "what do they take" — for
/// a reorder, a substitute, or knowing what to stock. That was only answerable
/// on the web (Item-Party report), never on the phone.
///
/// Rolled up from sales already in memory, so it costs no query and works
/// offline exactly as far as the cached sales do.
class ClientProductsCard extends StatefulWidget {
  final List<ClientProductLine> lines;
  const ClientProductsCard({super.key, required this.lines});

  @override
  State<ClientProductsCard> createState() => _ClientProductsCardState();
}

class _ClientProductsCardState extends State<ClientProductsCard> {
  // A regular customer can have dozens of products; showing them all pushes
  // the ledger far off screen. Show the spend that matters, offer the rest.
  static const _collapsedCount = 6;
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final lines = widget.lines;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(LucideIcons.package, size: 13, color: AppColors.inkTertiary),
            const SizedBox(width: 6),
            Text(
              'PRODUCTS BOUGHT',
              // Same label treatment as "BILLS & PAYMENTS" below it.
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10, fontWeight: FontWeight.w700,
                letterSpacing: 1.2, color: AppColors.inkTertiary,
              ),
            ),
            const Spacer(),
            if (lines.isNotEmpty)
              Text(
                lines.length == 1 ? '1 item' : '${lines.length} items',
                style: GoogleFonts.manrope(
                  fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.inkTertiary,
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),

        if (lines.isEmpty)
          _empty()
        else ...[
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.7)),
            ),
            child: Column(
              children: [
                for (var i = 0;
                     i < (_expanded ? lines.length : lines.length.clamp(0, _collapsedCount));
                     i++)
                  _row(lines[i], isLast: i ==
                      (_expanded ? lines.length : lines.length.clamp(0, _collapsedCount)) - 1),
              ],
            ),
          ),
          if (lines.length > _collapsedCount)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _expanded = !_expanded),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  _expanded
                      ? 'Show less'
                      : 'Show all ${lines.length} products',
                  style: GoogleFonts.manrope(
                    fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary,
                  ),
                ),
              ),
            ),
        ],
      ],
    );
  }

  Widget _row(ClientProductLine l, {required bool isLast}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : Border(bottom: BorderSide(
                color: AppColors.outlineVariant.withValues(alpha: 0.5))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.manrope(
                    fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.inkPrimary,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  // formatQty keeps 0.25 KG as 0.25 KG and strips float noise.
                  '${formatQty(l.qty, l.unit)}'
                  '${l.orders > 1 ? '  ·  ${l.orders} times' : ''}'
                  '${l.lastDate.isNotEmpty ? '  ·  last ${_shortDate(l.lastDate)}' : ''}',
                  style: GoogleFonts.manrope(
                    fontSize: 11.5, fontWeight: FontWeight.w500, color: AppColors.inkTertiary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            compactAmount(l.value),
            style: GoogleFonts.manrope(
              fontSize: 13.5, fontWeight: FontWeight.w700,
              color: AppColors.inkPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }

  Widget _empty() => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.outlineVariant.withValues(alpha: 0.7)),
        ),
        child: Column(
          children: [
            const Icon(LucideIcons.packageOpen, size: 18, color: AppColors.inkTertiary),
            const SizedBox(height: 8),
            Text(
              'No products recorded for this client yet',
              textAlign: TextAlign.center,
              style: GoogleFonts.manrope(
                fontSize: 12.5, fontWeight: FontWeight.w500, color: AppColors.inkTertiary,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              // Says why it can be empty when the ledger is not: a balance can
              // come from an invoice raised without going through the till.
              'Sales billed to them will appear here',
              textAlign: TextAlign.center,
              style: GoogleFonts.manrope(
                fontSize: 11, fontWeight: FontWeight.w400, color: AppColors.inkTertiary,
              ),
            ),
          ],
        ),
      );

  /// '2026-08-05' → '5 Aug'. Returns the input untouched if it is not ISO.
  static String _shortDate(String iso) {
    if (iso.length < 10) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final y = int.tryParse(iso.substring(0, 4));
    final m = int.tryParse(iso.substring(5, 7));
    final d = int.tryParse(iso.substring(8, 10));
    if (y == null || m == null || d == null || m < 1 || m > 12) return iso;
    return '$d ${months[m - 1]}';
  }
}
