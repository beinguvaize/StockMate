import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/core/theme/typography.dart';
import 'package:mobile_app/core/widgets/app_states.dart';
import 'package:mobile_app/features/clients_suppliers/data/receivable_aging.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/providers/receivable_aging_provider.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';

// Neutral on purpose, as on the web: bills have no due dates, so nothing here is
// known to be late, and red or green would claim otherwise. Weight carries it,
// and the oldest bucket is the heaviest.
FontWeight ageBucketWeight(String b) => b == '120+' ? FontWeight.w800 : FontWeight.w600;

/// Loads the aging data for a screen. A failure is said in words and offers a
/// retry; a figure is drawn only from a load that fully succeeded.
class AgingLoader extends ConsumerWidget {
  final Widget Function(ReceivableAgingData data) builder;
  const AgingLoader({super.key, required this.builder});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    void retry() => ref.invalidate(receivableAgingProvider);
    return ref.watch(receivableAgingProvider).when(
          skipLoadingOnRefresh: false,
          loading: () => const AppSpinner(),
          error: (e, _) => e is AgingOffline
              ? AppEmptyState(
                  icon: LucideIcons.wifiOff,
                  title: 'Needs internet',
                  message: 'What customers owe is worked out on the server, '
                      'so it stays right. Connect and try again.',
                  actionLabel: 'Try again',
                  onAction: retry,
                )
              : AppEmptyState(
                  icon: LucideIcons.alertTriangle,
                  title: 'Customer Aging could not load',
                  message: '$e\nNothing here is a figure yet. Try again, or check Clients for balances.',
                  actionLabel: 'Retry',
                  onAction: retry,
                ),
          data: builder,
        );
  }
}

class AgingTieOut extends StatelessWidget {
  final ReceivableAging aging;
  const AgingTieOut(this.aging, {super.key});

  @override
  Widget build(BuildContext context) => Text(
        tieOutLine(aging, formatINR),
        key: const Key('aging-tie-out'),
        style: AppText.caption.copyWith(color: AppColors.inkSecondary, height: 1.4),
      );
}

/// Loaded, and no sale has money left to pay. The tie-out stays on screen, as
/// balances can be owed with no bill behind them.
class AgingNothingUnpaid extends StatelessWidget {
  final ReceivableAging aging;
  const AgingNothingUnpaid(this.aging, {super.key});

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: AgingTieOut(aging),
          ),
          const Expanded(
            child: AppEmptyState(
              icon: LucideIcons.checkCircle2,
              title: 'Nothing unpaid',
              message: 'No sale has money left to pay.',
            ),
          ),
        ],
      );
}

class AgingBucketPill extends StatelessWidget {
  final String bucket;
  final double? amount;
  const AgingBucketPill(this.bucket, {super.key, this.amount});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.canvas,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Text(
        amount == null ? '$bucket days' : '$bucket days ${compactINR(amount!)}',
        style: AppText.label.copyWith(fontWeight: ageBucketWeight(bucket),
          color: AppColors.inkPrimary),
      ),
    );
  }
}

String agingBillDate(String? iso) {
  final d = DateTime.tryParse(iso ?? '');
  if (d == null) return '';
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${m[d.month - 1]} ${d.year}';
}
