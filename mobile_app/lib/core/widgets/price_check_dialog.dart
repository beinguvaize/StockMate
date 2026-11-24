import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/utils/price_check.dart';

/// "Is this price right?" -- asked once before a purchase saves, listing every
/// line more than [PriceCheck.pricePct] away from what the item last cost.
///
/// Returns true for "Yes, these prices are right" (save as typed) and false
/// for "Change it" or a dismiss; the caller then focuses the first flagged
/// line's amount. Same wording as the web dialog.
Future<bool> showPriceCheckDialog(BuildContext context, List<PriceFlag> flagged) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => PriceCheckDialog(flagged: flagged),
  );
  return ok == true;
}

class PriceCheckDialog extends StatelessWidget {
  final List<PriceFlag> flagged;
  final DateTime? today;
  const PriceCheckDialog({super.key, required this.flagged, this.today});

  @override
  Widget build(BuildContext context) {
    final one = flagged.length == 1;
    return AlertDialog(
      backgroundColor: AppColors.canvas,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      titlePadding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      contentPadding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      actionsPadding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      title: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.warningContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(LucideIcons.alertTriangle, size: 17, color: AppColors.warning),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(one ? 'Is this price right?' : 'Are these prices right?',
                    style: AppText.heading.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  '${one ? 'It is' : 'They are'} more than ${PriceCheck.pricePct}% away from the last purchase.',
                  style: AppText.caption.copyWith(color: AppColors.inkTertiary),
                ),
              ],
            ),
          ),
        ],
      ),
      content: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.45),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final f in flagged)
                Container(
                  key: const ValueKey('price-check-line'),
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.canvasWarm,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Text(PriceCheck.message(f, today: today),
                      style: AppText.body.copyWith(height: 1.35)),
                ),
            ],
          ),
        ),
      ),
      actions: [
        Row(
          children: [
            OutlinedButton(
              onPressed: () => Navigator.of(context).pop(false),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.onSurface,
                side: const BorderSide(color: AppColors.outlineVariant),
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              ),
              child: const Text('Change it'),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).pop(true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: AppColors.onPrimary,
                  elevation: 0,
                  shape: const StadiumBorder(),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: const Text('Yes, these prices are right', textAlign: TextAlign.center),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
