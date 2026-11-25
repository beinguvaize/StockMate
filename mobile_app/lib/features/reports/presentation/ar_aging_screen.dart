import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/aging_report_view.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';

/// "Money to Collect" (canvas): unpaid invoices raised in the period, by how
/// overdue they are.
class ArAgingScreen extends ConsumerStatefulWidget {
  const ArAgingScreen({super.key});

  @override
  ConsumerState<ArAgingScreen> createState() => _ArAgingScreenState();
}

class _ArAgingScreenState extends ConsumerState<ArAgingScreen> {
  // 90 days, not 30: an invoice older than the range drops out of the
  // report, and a short default would hide the oldest dues.
  DateTimeRange _range = reportLastDays(90);

  @override
  Widget build(BuildContext context) {
    return ReportPage(
      title: 'Money to Collect',
      range: _range,
      builder: (context, params) {
        final invoicesAsync = ref.watch(reportInvoicesProvider(params));
        if (invoicesAsync.hasError && !invoicesAsync.hasValue) {
          return ReportError(invoicesAsync.error!);
        }
        if (!invoicesAsync.hasValue) return const ReportLoading();
        final invoices = invoicesAsync.value ?? [];

        final aged = <AgedDoc>[];
        for (final inv in invoices) {
          final status =
              ((inv['payment_status'] ?? inv['status']) as String?)?.toUpperCase() ?? '';
          if (status == 'PAID') continue;
          final amt =
              (inv['grand_total'] ?? inv['total_amount'] ?? inv['amount'] as num?)
                  ?.toDouble() ??
                  0;
          if (amt <= 0) continue;
          final dueDateStr =
              (inv['due_date'] ?? inv['invoice_date'] ?? inv['date']) as String?;
          final dueDate = dueDateStr != null ? DateTime.tryParse(dueDateStr) : null;
          final daysOverdue = dueDate != null ? daysBetween(dueDate) : 0;
          final bucket = getAgingBucket(daysOverdue);
          aged.add(AgedDoc(
            partyId: inv['client_id'] as String? ?? '',
            partyName: inv['client_name'] as String? ?? 'Unknown',
            docNo: inv['invoice_number'] as String? ?? '',
            amount: amt,
            bucket: bucket,
            daysOverdue: daysOverdue,
            date: dueDate,
          ));
        }


        return AgingReportView(
          docs: aged,
          range: _range,
          onRangeChanged: (r) => setState(() => _range = r),
          heroLabel: 'To collect',
          partyTab: 'By client',
          docTab: 'By invoice',
          docNoun: 'invoice',
          dateWord: 'Due',
          emptyTitle: 'Nothing to collect',
        );
      },
    );
  }
}
