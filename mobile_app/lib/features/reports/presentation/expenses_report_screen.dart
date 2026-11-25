import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart'
    show expenseCategoryLook;
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';

/// "Expenses" report (canvas): what was spent in a period, by category and
/// by day.
class ExpensesReportScreen extends ConsumerStatefulWidget {
  const ExpensesReportScreen({super.key});

  @override
  ConsumerState<ExpensesReportScreen> createState() =>
      _ExpensesReportScreenState();
}

class _ExpensesReportScreenState extends ConsumerState<ExpensesReportScreen> {
  DateTimeRange _range = reportLastDays(30);

  @override
  Widget build(BuildContext context) {
    return ReportPage(
      title: 'Expenses',
      range: _range,
      builder: (context, params) {
        final async = ref.watch(reportExpensesProvider(params));
        return async.when(
          loading: () => const ReportLoading(),
          error: (e, _) => ReportError(e),
          data: (expenses) {
            double amt(Map<String, dynamic> e) =>
                (e['amount'] as num?)?.toDouble() ?? 0;
            final total = expenses.fold(0.0, (s, e) => s + amt(e));
            final byCat = <String, (double, int)>{};
            final byDate = <String, double>{};
            for (final e in expenses) {
              final cat = (e['category'] as String?) ?? 'Other';
              final cur = byCat[cat] ?? (0.0, 0);
              byCat[cat] = (cur.$1 + amt(e), cur.$2 + 1);
              final d = ((e['date'] as String?) ?? '').split('T').first;
              byDate[d] = (byDate[d] ?? 0) + amt(e);
            }
            final shares = reportTopShares(byCat);
            final days = _range.end.difference(_range.start).inDays + 1;
            final list = [...expenses]..sort((a, b) =>
                ((b['date'] as String?) ?? '')
                    .compareTo((a['date'] as String?) ?? ''));
            final shown = list.take(50).toList();

            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                ReportRangeBar(
                    range: _range,
                    onChanged: (r) => setState(() => _range = r)),
                ReportDonut(
                  values: [for (final s in shares) s.value],
                  total: Money.inr(total),
                  label: 'Total spent',
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                  child: Row(
                    children: [
                      ReportStat(shares.isEmpty ? '—' : shares.first.name,
                          'Biggest cost',
                          center: true),
                      const SizedBox(width: 10),
                      ReportStat(Money.inr(days > 0 ? total / days : 0),
                          'A day',
                          center: true),
                      const SizedBox(width: 10),
                      ReportStat('${expenses.length}',
                          expenses.length == 1 ? 'Entry' : 'Entries',
                          center: true),
                    ],
                  ),
                ),
                const BlGroupHeader('Spend by day', trailing: 'LAST 7 DAYS'),
                ReportDayBars(byDate: byDate, range: _range, height: 56),
                BlGroupHeader('By category', trailing: '${byCat.length}'),
                if (expenses.isEmpty)
                  const BlEmpty(
                    icon: BlIcons.receipt,
                    title: 'Nothing spent in these dates',
                    message: 'Pick a wider range to see older expenses.',
                  ),
                for (var i = 0; i < shares.length; i++)
                  ReportShareRow(
                    color: reportShareColors[i],
                    name: shares[i].name,
                    sub:
                        '${shares[i].count} entr${shares[i].count == 1 ? 'y' : 'ies'}',
                    amount: shares[i].value,
                    total: total,
                  ),
                if (shown.isNotEmpty)
                  BlGroupHeader('Recent expenses',
                      trailing: '${expenses.length}'),
                for (final e in shown)
                  Builder(builder: (context) {
                    final cat = (e['category'] as String?) ?? 'Other';
                    final note = ((e['note'] as String?) ?? '').trim();
                    final look = expenseCategoryLook(cat);
                    return ReportEntryRow(
                      leading: Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: look.tile, shape: BoxShape.circle),
                        child: BlIcon(look.icon, size: 17, color: look.ink),
                      ),
                      name: note.isEmpty ? cat : note,
                      sub: [
                        reportDate((e['date'] as String?) ?? ''),
                        if (note.isNotEmpty) cat,
                      ].join(' · '),
                      amount: Money.inr(amt(e)),
                    );
                  }),
                if (list.length > shown.length)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                    child: Text(
                        'Showing the latest ${shown.length} of ${list.length} expenses.',
                        style: Bl.inter(12, c: reportGrey)),
                  ),
              ],
            );
          },
        );
      },
    );
  }
}
