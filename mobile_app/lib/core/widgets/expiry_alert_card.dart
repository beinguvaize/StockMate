import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';

/// Dashboard alert: dated batches expired or expiring within 30 days.
/// Hidden when nothing is at risk. Mirrors the web ExpiryAlertCard.
final expiryAlertProvider = FutureProvider<Map<String, num>>((ref) async {
  final in30 = DateTime.now().add(const Duration(days: 30));
  final in30Str =
      '${in30.year}-${in30.month.toString().padLeft(2, '0')}-${in30.day.toString().padLeft(2, '0')}';
  final res = await supabase
      .from('product_batches')
      .select('expiry_date, qty_remaining, unit_cost')
      .not('expiry_date', 'is', null)
      .gt('qty_remaining', 0)
      .lte('expiry_date', in30Str);
  final rows = (res as List).map((e) => Map<String, dynamic>.from(e as Map));
  final today = DateTime.now().toIso8601String().substring(0, 10);
  num expired = 0, soon = 0, value = 0;
  for (final r in rows) {
    if ((r['expiry_date'] as String).compareTo(today) < 0) {
      expired++;
    } else {
      soon++;
    }
    value += (num.tryParse('${r['qty_remaining']}') ?? 0) *
        (num.tryParse('${r['unit_cost'] ?? 0}') ?? 0);
  }
  return {'expired': expired, 'soon': soon, 'value': value};
});

class ExpiryAlertCard extends ConsumerWidget {
  const ExpiryAlertCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(expiryAlertProvider);
    final stats = async.asData?.value;
    if (stats == null || (stats['expired'] == 0 && stats['soon'] == 0)) {
      return const SizedBox.shrink();
    }
    final parts = <String>[
      if (stats['expired']! > 0) '${stats['expired']} expired',
      if (stats['soon']! > 0) '${stats['soon']} expiring in 30 days',
    ];
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFECACA)),
      ),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: const Color(0xFFFEE2E2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(LucideIcons.alertTriangle,
                size: 17, color: Color(0xFFDC2626)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(parts.join(' · '),
                    style: GoogleFonts.manrope(
                        fontSize: 13, fontWeight: FontWeight.w700,
                        color: const Color(0xFFB91C1C))),
                Text(
                  '₹${stats['value']!.round()} of stock at risk',
                  style: GoogleFonts.manrope(
                      fontSize: 11, color: const Color(0xFFEF4444)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
