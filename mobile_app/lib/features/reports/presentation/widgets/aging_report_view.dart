import 'package:flutter/material.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';
import 'package:mobile_app/features/reports/utils/financial_calcs.dart';

/// One unpaid invoice or bill, already placed in an age bucket.
class AgedDoc {
  final String partyId;
  final String partyName;
  final String docNo;
  final double amount;
  final String bucket;
  final int daysOverdue;
  final DateTime? date;
  const AgedDoc({
    required this.partyId,
    required this.partyName,
    required this.docNo,
    required this.amount,
    required this.bucket,
    required this.daysOverdue,
    required this.date,
  });
}

const _bucketColors = <String, Color>{
  'CURRENT': Color(0xFF1E9E5A),
  '1-30': Color(0xFF84CC16),
  '31-60': Bl.brand,
  '61-90': Color(0xFFF97316),
  '91-120': Color(0xFFDC2626),
  '120+': Color(0xFF7F1D1D),
};

String _bucketName(String b) =>
    b == 'CURRENT' ? 'Current' : b.replaceAll('-', '–');

Widget _agePill(int days) => days <= 0
    ? BlStatusPill.green('Current')
    : days > 60
        ? BlStatusPill.red('$days days')
        : days > 30
            ? BlStatusPill.yellow('$days days')
            : BlStatusPill.grey('$days days');

/// The shared body of "Money to Collect" and "Money to Pay" (canvas): the
/// total, how old it is, and who it is with.
class AgingReportView extends StatefulWidget {
  final List<AgedDoc> docs;
  final DateTimeRange range;
  final ValueChanged<DateTimeRange> onRangeChanged;
  final String heroLabel; // "To collect" / "To pay"
  final String partyTab; // "By client" / "By supplier"
  final String docTab; // "By invoice" / "By bill"
  final String docNoun; // "invoice" / "bill"
  final String dateWord; // "Due" / "Billed"
  final String? note;
  final String emptyTitle;
  const AgingReportView({
    super.key,
    required this.docs,
    required this.range,
    required this.onRangeChanged,
    required this.heroLabel,
    required this.partyTab,
    required this.docTab,
    required this.docNoun,
    required this.dateWord,
    required this.emptyTitle,
    this.note,
  });

  @override
  State<AgingReportView> createState() => _AgingReportViewState();
}

class _AgingReportViewState extends State<AgingReportView> {
  int _tab = 0;

  String _docTitle(AgedDoc d) => d.docNo.isEmpty
      ? '${widget.docNoun[0].toUpperCase()}${widget.docNoun.substring(1)}'
      : d.docNo;

  String _docDate(AgedDoc d) => d.date == null
      ? ''
      : '${widget.dateWord} ${d.date!.day} ${reportMonths[d.date!.month - 1]} ${d.date!.year}';

  void _showParty(String name, List<AgedDoc> docs) {
    final sorted = [...docs]
      ..sort((a, b) => b.daysOverdue.compareTo(a.daysOverdue));
    showBlSheet<void>(
      context: context,
      builder: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BlSheetTitle(name, size: 16, divider: true),
          Padding(
            padding: const EdgeInsets.only(top: 10, bottom: 2),
            child: Text(
                '${sorted.length} UNPAID ${widget.docNoun.toUpperCase()}${sorted.length == 1 ? '' : 'S'}',
                style: Bl.eyebrow),
          ),
          for (var i = 0; i < sorted.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 11),
              decoration: i == sorted.length - 1
                  ? null
                  : const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Bl.sep))),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_docTitle(sorted[i]),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Bl.tight(14, w: FontWeight.w600)),
                        if (_docDate(sorted[i]).isNotEmpty) ...[
                          const SizedBox(height: 1),
                          Text(_docDate(sorted[i]),
                              style: Bl.inter(12, c: reportGrey)),
                        ],
                      ],
                    ),
                  ),
                  _agePill(sorted[i].daysOverdue),
                  const SizedBox(width: 10),
                  ConstrainedBox(
                    constraints: const BoxConstraints(minWidth: 62),
                    child: Text(Money.inr(sorted[i].amount),
                        textAlign: TextAlign.right,
                        style: Bl.tight(14, w: FontWeight.w600)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _row(
          {required String name,
          required String avatar,
          required String sub,
          required double amount,
          required int days,
          VoidCallback? onTap}) =>
      BlTap(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Bl.sep))),
          child: Row(
            children: [
              BlTintAvatar(avatar),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.tight(14.5, w: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text(sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Bl.inter(12, c: reportGrey)),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(Money.inr(amount),
                      style: Bl.tight(14.5, w: FontWeight.w600)),
                  const SizedBox(height: 3),
                  _agePill(days),
                ],
              ),
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final docs = widget.docs;
    final total = docs.fold(0.0, (s, r) => s + r.amount);
    final pastDue = docs
        .where((r) => r.bucket != 'CURRENT')
        .fold(0.0, (s, r) => s + r.amount);
    final severe = docs
        .where((r) => ['91-120', '120+'].contains(r.bucket))
        .fold(0.0, (s, r) => s + r.amount);
    final rate = total > 0 ? pastDue / total * 100 : 0.0;
    final buckets = [
      for (final b in agingBuckets)
        (b, docs.where((r) => r.bucket == b).fold(0.0, (s, r) => s + r.amount)),
    ].where((b) => b.$2 > 0).toList();

    final byParty = <String, List<AgedDoc>>{};
    for (final d in docs) {
      (byParty[d.partyId.isEmpty ? d.partyName : d.partyId] ??= []).add(d);
    }
    double sum(List<AgedDoc> l) => l.fold(0.0, (s, r) => s + r.amount);
    final parties = byParty.values.toList()
      ..sort((a, b) => sum(b).compareTo(sum(a)));
    final byDoc = [...docs]
      ..sort((a, b) => b.daysOverdue.compareTo(a.daysOverdue));

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        ReportRangeBar(range: widget.range, onChanged: widget.onRangeChanged),
        ReportHero(
          label: widget.heroLabel,
          value: Money.inr(total),
          stats: [
            ReportStat(Money.inr(pastDue), 'Past due',
                color: pastDue > 0 ? Bl.redDeep : Bl.ink),
            ReportStat(Money.inr(severe), 'Over 90 days',
                color: severe > 0 ? const Color(0xFF7F1D1D) : Bl.ink),
            ReportStat('${rate.round()}%', 'Overdue'),
          ],
        ),
        if (buckets.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: 8,
                  child: Row(
                    children: [
                      for (var i = 0; i < buckets.length; i++)
                        Expanded(
                          flex: (buckets[i].$2 / total * 1000)
                              .round()
                              .clamp(15, 1000),
                          child: Container(
                            margin: EdgeInsets.only(
                                right: i == buckets.length - 1 ? 0 : 3),
                            decoration: BoxDecoration(
                                color: _bucketColors[buckets[i].$1],
                                borderRadius: BorderRadius.circular(4)),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 14,
                  runSpacing: 6,
                  children: [
                    for (final b in buckets)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                              width: 7,
                              height: 7,
                              decoration: BoxDecoration(
                                  color: _bucketColors[b.$1],
                                  shape: BoxShape.circle)),
                          const SizedBox(width: 5),
                          Text('${_bucketName(b.$1)} ${compactINR(b.$2)}',
                              style: Bl.inter(11.5,
                                  w: FontWeight.w500, c: Bl.body)),
                        ],
                      ),
                  ],
                ),
              ],
            ),
          ),
        if (widget.note != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
            child: Text(widget.note!, style: Bl.inter(12, c: reportGrey)),
          ),
        if (docs.isEmpty)
          BlEmpty(
            icon: BlIcons.check,
            title: widget.emptyTitle,
            message:
                'Nothing unpaid was raised in these dates. Pick a wider range to look further back.',
          )
        else ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: BlSegmented(
              labels: [widget.partyTab, widget.docTab],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
          ),
          if (_tab == 0)
            for (final p in parties)
              _row(
                name: p.first.partyName,
                avatar: p.first.partyName,
                sub:
                    '${p.length} unpaid ${widget.docNoun}${p.length == 1 ? '' : 's'}',
                amount: sum(p),
                days: p.fold<int>(
                    0, (m, d) => d.daysOverdue > m ? d.daysOverdue : m),
                onTap: () => _showParty(p.first.partyName, p),
              )
          else
            for (final d in byDoc)
              _row(
                name: _docTitle(d),
                avatar: d.partyName,
                sub: [d.partyName, _docDate(d)]
                    .where((s) => s.isNotEmpty)
                    .join(' · '),
                amount: d.amount,
                days: d.daysOverdue,
              ),
        ],
      ],
    );
  }
}
