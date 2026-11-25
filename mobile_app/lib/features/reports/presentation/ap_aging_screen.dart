import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/aging_report_view.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';

/// "Money to Pay" (canvas): credit purchases made in the period, by how
/// overdue they are.
class ApAgingScreen extends ConsumerStatefulWidget {
  const ApAgingScreen({super.key});

  @override
  ConsumerState<ApAgingScreen> createState() => _ApAgingScreenState();
}

class _ApAgingScreenState extends ConsumerState<ApAgingScreen> {
  static const _creditMethods = {'CREDIT', 'ON_CREDIT', 'UNPAID', 'DUE'};
  static const _defaultTermsDays = 30;

  // 90 days, not 30: a bill older than the range drops out of the report,
  // and a short default would hide the oldest dues.
  DateTimeRange _range = reportLastDays(90);

  @override
  Widget build(BuildContext context) {
    return ReportPage(
      title: 'Money to Pay',
      range: _range,
      builder: (context, params) {
        final purchasesAsync = ref.watch(reportPurchasesProvider(params));
        if (purchasesAsync.hasError && !purchasesAsync.hasValue) {
          return ReportError(purchasesAsync.error!);
        }
        if (!purchasesAsync.hasValue) return const ReportLoading();
        final purchases = purchasesAsync.value ?? [];

        final aged = <AgedDoc>[];
        for (final p in purchases) {
          final method =
              (p['payment_type'] as String?)?.toUpperCase() ?? '';
          if (!_creditMethods.contains(method)) continue;
          final amt = (p['total_amount'] as num?)?.toDouble() ?? 0;
          if (amt <= 0) continue;
          final dateStr = p['date'] as String?;
          final billDate =
              dateStr != null ? DateTime.tryParse(dateStr) : DateTime.now();
          final impliedDue = (billDate ?? DateTime.now())
              .add(const Duration(days: _defaultTermsDays));
          final daysOverdue = daysBetween(impliedDue);
          final bucket = getAgingBucket(daysOverdue);
          aged.add(AgedDoc(
            partyId: p['supplier_id'] as String? ?? '',
            partyName: p['supplier_name'] as String? ?? 'Unknown',
            docNo: '',
            amount: amt,
            bucket: bucket,
            daysOverdue: daysOverdue,
            date: billDate,
          ));
        }


        return AgingReportView(
          docs: aged,
          range: _range,
          onRangeChanged: (r) => setState(() => _range = r),
          heroLabel: 'To pay',
          partyTab: 'By supplier',
          docTab: 'By bill',
          docNoun: 'bill',
          dateWord: 'Billed',
          note: 'Counted from bill date + $_defaultTermsDays days to pay.',
          emptyTitle: 'Nothing to pay',
        );
      },
    );
  }
}
