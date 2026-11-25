import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/daybook/data/daybook_models.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart'
    show dayBookDateLabel;
import 'package:mobile_app/features/daybook/providers/daybook_providers.dart';

const _greenDeep = Color(0xFF17663A);
const _grey = Color(0xFF7A8088);

/// ₹48,60,000 → "₹48.6L". Short enough for a three-across stat row.
String _short(double v) {
  final a = v.abs();
  final sign = v < 0 ? '−' : '';
  String trim(double x) => x.toStringAsFixed(1).replaceFirst(RegExp(r'\.0$'), '');
  if (a >= 10000000) return '$sign₹${trim(a / 10000000)}Cr';
  if (a >= 100000) return '$sign₹${trim(a / 100000)}L';
  return '$sign${Money.inr(a)}';
}

/// "Day Book History" (canvas): every day the book was opened, newest first.
/// Tapping a day opens it in the Day Book.
class DayBookHistoryScreen extends ConsumerWidget {
  const DayBookHistoryScreen({super.key});

  Widget _stat(String value, String label) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.tight(15, w: FontWeight.w700)),
            const SizedBox(height: 1),
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Bl.inter(11.5, w: FontWeight.w500, c: _grey)),
          ],
        ),
      );

  Widget _status(DayBookRecord r) {
    if (!r.isClosed) return BlStatusPill.yellow('Open');
    final v = r.variance;
    if (v == null) return BlStatusPill.grey('Closed');
    if (v.abs() < 0.01) return BlStatusPill.green('Balanced');
    return v > 0
        ? BlStatusPill.grey('Over ${Money.inr(v)}')
        : BlStatusPill.red('Short ${Money.inr(-v)}');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(dayBookListProvider);
    final thisYear = DateTime.now().year;

    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            const BlBackHeader(title: 'Day Book History'),
            Expanded(
              child: listAsync.when(
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Bl.amber, strokeWidth: 2)),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'Could not load the history. Check your internet and try again. ($e)',
                        textAlign: TextAlign.center,
                        style: Bl.inter(13.5, c: Bl.redDeep, h: 1.5)),
                  ),
                ),
                data: (list) {
                  if (list.isEmpty) {
                    return const Center(
                      child: BlEmpty(
                        icon: BlIcons.book,
                        title: 'No day book history yet',
                        message: 'Days you open in the Day Book appear here.',
                      ),
                    );
                  }
                  final sorted = [...list]
                    ..sort((a, b) => b.date.compareTo(a.date));
                  final closed = sorted.where((r) => r.isClosed).length;
                  final sales =
                      sorted.fold<double>(0, (s, r) => s + r.totalSales);
                  final expenses =
                      sorted.fold<double>(0, (s, r) => s + r.totalExpenses);
                  final net = sales - expenses;

                  return ListView(
                    padding: const EdgeInsets.only(bottom: 20),
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Net cash flow · all time',
                                style: Bl.inter(13,
                                    w: FontWeight.w500, c: Bl.body)),
                            const SizedBox(height: 6),
                            Text(
                                net < 0
                                    ? '− ${Money.inr(-net)}'
                                    : Money.inr(net),
                                style: Bl.tight(36,
                                    w: FontWeight.w700,
                                    ls: -0.04,
                                    h: 1.05,
                                    c: net < 0 ? Bl.redDeep : _greenDeep)),
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                _stat('${sorted.length}',
                                    'Days · $closed closed'),
                                const SizedBox(width: 10),
                                _stat(_short(sales), 'Sales'),
                                const SizedBox(width: 10),
                                _stat(_short(expenses), 'Expenses'),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const BlGroupHeader('All days'),
                      for (final r in sorted)
                        Semantics(
                          button: true,
                          label:
                              '${dayBookDateLabel(r.date)}, ${r.isClosed ? 'closing ${Money.inr(r.closingBalance)}' : 'not closed yet'}. Open',
                          excludeSemantics: true,
                          child: BlTap(
                            onTap: () {
                              ref
                                  .read(selectedDayBookDateProvider.notifier)
                                  .state = r.date;
                              Navigator.pop(context);
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 18, vertical: 11),
                              decoration: const BoxDecoration(
                                  border: Border(
                                      bottom: BorderSide(color: Bl.sep))),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Flexible(
                                              child: Text(
                                                  dayBookDateLabel(r.date,
                                                      year: !r.date.startsWith(
                                                          '$thisYear')),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: Bl.tight(14.5,
                                                      w: FontWeight.w600)),
                                            ),
                                            const SizedBox(width: 6),
                                            _status(r),
                                          ],
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                            // Sales and expenses are written to
                                            // the row when the day is locked;
                                            // until then they are zero, not
                                            // "nothing sold".
                                            r.isClosed
                                                ? 'Sales ${Money.inr(r.totalSales)} · Expenses ${Money.inr(r.totalExpenses)}'
                                                : 'Not closed yet',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: Bl.inter(12, c: _grey)),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                          Money.inr(r.isClosed
                                              ? r.closingBalance
                                              : r.openingBalance),
                                          style: Bl.tight(14.5,
                                              w: FontWeight.w600)),
                                      Text(r.isClosed ? 'closing' : 'opening',
                                          style:
                                              Bl.inter(11.5, c: _grey)),
                                    ],
                                  ),
                                  const SizedBox(width: 8),
                                  const BlIcon(BlIcons.chevronRight,
                                      size: 16, color: Color(0xFFB8BCC2)),
                                ],
                              ),
                            ),
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
