import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';

/// "GSTR-1" (canvas): a month's outward supplies, split B2B / B2CL / B2CS.
class Gstr1Screen extends ConsumerStatefulWidget {
  const Gstr1Screen({super.key});

  @override
  ConsumerState<Gstr1Screen> createState() => _Gstr1ScreenState();
}

class _Gstr1ScreenState extends ConsumerState<Gstr1Screen> {
  int _year = DateTime.now().year;
  int _month = DateTime.now().month;
  int _tab = 0;

  DateTime get _from => DateTime(_year, _month, 1);
  DateTime get _to   => DateTime(_year, _month + 1, 0);

  // ---- computations --------------------------------------------------------
  Map<String, dynamic> _compute(List<Map<String, dynamic>> invoices) {
    double totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    int b2bCount = 0, totalCount = 0;
    final b2bRows = <Map<String, dynamic>>[];
    final b2clRows = <Map<String, dynamic>>[];
    final b2csRows = <Map<String, dynamic>>[];

    for (final inv in invoices) {
      final clientGstin = inv['client_gstin'] as String?;
      final isInterstate = (inv['is_interstate'] as bool?) ?? false;
      final taxable = (inv['taxable_amount'] as num?)?.toDouble() ?? 0;
      final cgst    = (inv['cgst_amount']    as num?)?.toDouble() ?? 0;
      final sgst    = (inv['sgst_amount']    as num?)?.toDouble() ?? 0;
      final igst    = (inv['igst_amount']    as num?)?.toDouble() ?? 0;
      final total   = (inv['grand_total']    as num?)?.toDouble() ?? 0;

      totalTaxable += taxable;
      totalCgst    += cgst;
      totalSgst    += sgst;
      totalIgst    += igst;
      totalCount++;

      final hasGstin = clientGstin != null && clientGstin.length >= 15;
      if (hasGstin) {
        b2bCount++;
        b2bRows.add({
          'invoiceNo':   inv['invoice_number'],
          'clientName':  inv['client_name'],
          'gstin':       clientGstin,
          'taxable':     taxable,
          'cgst':        cgst,
          'sgst':        sgst,
          'igst':        igst,
          'total':       total,
          'isInterstate': isInterstate,
        });
      } else if (isInterstate && total >= 250000) {
        b2clRows.add({
          'invoiceNo':  inv['invoice_number'],
          'clientName': inv['client_name'],
          'taxable':    taxable,
          'igst':       igst,
          'total':      total,
        });
      } else {
        b2csRows.add({
          'taxable': taxable,
          'cgst':    cgst,
          'sgst':    sgst,
          'igst':    igst,
        });
      }
    }

    double b2csTaxable = 0, b2csCgst = 0, b2csSgst = 0, b2csIgst = 0;
    for (final r in b2csRows) {
      b2csTaxable += r['taxable'] as double;
      b2csCgst    += r['cgst']    as double;
      b2csSgst    += r['sgst']    as double;
      b2csIgst    += r['igst']    as double;
    }

    return {
      'totalTaxable': totalTaxable,
      'totalCgst':    totalCgst,
      'totalSgst':    totalSgst,
      'totalIgst':    totalIgst,
      'totalCount':   totalCount,
      'b2bCount':     b2bCount,
      'b2bRows':      b2bRows,
      'b2clRows':     b2clRows,
      'b2csTaxable':  b2csTaxable,
      'b2csCgst':     b2csCgst,
      'b2csSgst':     b2csSgst,
      'b2csIgst':     b2csIgst,
    };
  }

  Widget _cell(String label, double value) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: Bl.inter(11, w: FontWeight.w500, c: reportGrey)),
            const SizedBox(height: 1),
            Text(Money.inr(value),
                style: Bl.tight(13.5, w: FontWeight.w600)),
          ],
        ),
      );

  Widget _invoiceCard(Map<String, dynamic> r, {required bool b2b}) {
    final interstate = !b2b || (r['isInterstate'] as bool? ?? false);
    final igst = (r['igst'] as double?) ?? 0;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
          color: Bl.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE6E5E3))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Flexible(
                child: Text((r['invoiceNo'] as String?) ?? 'Invoice',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Bl.tight(14.5, w: FontWeight.w600)),
              ),
              if (interstate) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                      color: const Color(0xFFE4EEFF),
                      borderRadius: BorderRadius.circular(999)),
                  child: Text('Interstate',
                      style: Bl.tight(11,
                          w: FontWeight.w600,
                          ls: 0,
                          c: const Color(0xFF1D4E9E))),
                ),
              ],
              const Spacer(),
              Text(Money.inr((r['total'] as double?) ?? 0),
                  style: Bl.tight(15, w: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 2),
          Text(
              [
                (r['clientName'] as String?) ?? 'Unknown',
                if (b2b) (r['gstin'] as String?) ?? '',
              ].where((s) => s.isNotEmpty).join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Bl.inter(12, c: reportGrey)),
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.only(top: 10),
            decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: Bl.sep))),
            child: Row(
              children: [
                _cell('Taxable', (r['taxable'] as double?) ?? 0),
                if (interstate || igst > 0)
                  _cell('IGST', igst)
                else ...[
                  _cell('CGST', (r['cgst'] as double?) ?? 0),
                  _cell('SGST', (r['sgst'] as double?) ?? 0),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ReportPage(
      title: 'GSTR-1',
      range: DateTimeRange(start: _from, end: _to),
      builder: (context, params) {
        final invoicesAsync = ref.watch(reportInvoicesProvider(params));
        final body = invoicesAsync.when(
          loading: () => const SizedBox(height: 240, child: ReportLoading()),
          error: (e, _) => SizedBox(height: 240, child: ReportError(e)),
          data: (invoices) {
            final d = _compute(invoices);
            final b2b = d['b2bRows'] as List<Map<String, dynamic>>;
            final b2cl = d['b2clRows'] as List<Map<String, dynamic>>;
            final tax = (d['totalCgst'] as double) +
                (d['totalSgst'] as double) +
                (d['totalIgst'] as double);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ReportHero(
                  label: 'Taxable turnover',
                  value: Money.inr(d['totalTaxable'] as double),
                  stats: [
                    ReportStat(Money.inr(tax), 'Tax'),
                    ReportStat('${d['totalCount']}', 'Invoices'),
                    ReportStat('${d['b2bCount']}', 'B2B invoices'),
                  ],
                ),
                if (_tab == 0) ...[
                  BlGroupHeader('B2B invoices', trailing: '${b2b.length}'),
                  if (b2b.isEmpty)
                    const BlEmpty(
                      icon: BlIcons.doc,
                      title: 'No B2B invoices this month',
                      message:
                          'Invoices to clients with a GSTIN appear here.',
                    ),
                  for (final r in b2b) _invoiceCard(r, b2b: true),
                ] else if (_tab == 1) ...[
                  BlGroupHeader('B2C large invoices',
                      trailing: '${b2cl.length}'),
                  if (b2cl.isEmpty)
                    const BlEmpty(
                      icon: BlIcons.doc,
                      title: 'No B2C large invoices this month',
                      message:
                          'Interstate invoices of ₹2,50,000 or more to clients without a GSTIN appear here.',
                    ),
                  for (final r in b2cl) _invoiceCard(r, b2b: false),
                ] else ...[
                  const BlGroupHeader('B2C small · all together'),
                  Container(
                    margin: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                    padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
                    decoration: BoxDecoration(
                        color: Bl.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE6E5E3))),
                    child: Column(
                      children: [
                        ReportLine('Taxable value',
                            Money.inr(d['b2csTaxable'] as double)),
                        ReportLine('CGST', Money.inr(d['b2csCgst'] as double)),
                        ReportLine('SGST', Money.inr(d['b2csSgst'] as double)),
                        ReportLine('IGST', Money.inr(d['b2csIgst'] as double)),
                        ReportLine(
                            'Total tax',
                            Money.inr((d['b2csCgst'] as double) +
                                (d['b2csSgst'] as double) +
                                (d['b2csIgst'] as double)),
                            total: true),
                      ],
                    ),
                  ),
                ],
              ],
            );
          },
        );
        return Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(bottom: 20),
                children: [
                  ReportMonthBar(
                      year: _year,
                      month: _month,
                      onChanged: (y, m) => setState(() {
                            _year = y;
                            _month = m;
                          })),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                    child: BlSegmented(
                      labels: const ['B2B', 'B2CL', 'B2CS'],
                      index: _tab,
                      onChanged: (i) => setState(() => _tab = i),
                    ),
                  ),
                  body,
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const BlButton('Export JSON', kind: BlButtonKind.soft),
                  const SizedBox(height: 8),
                  Text('Export is on the web app for now.',
                      textAlign: TextAlign.center,
                      style: Bl.inter(12, c: Bl.mute)),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
