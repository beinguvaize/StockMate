import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/utils/money.dart';
import 'package:mobile_app/features/reports/data/report_providers.dart';
import 'package:mobile_app/features/reports/presentation/widgets/report_widgets.dart';

// A GSTIN is 15 chars: 2 state digits + 10-char PAN + 3 more. Good enough to
// tell "registered supplier" from a blank/placeholder, matching web's check.
bool _hasValidGstin(String? gstin) {
  if (gstin == null) return false;
  final v = gstin.trim().toUpperCase().replaceAll(' ', '');
  return RegExp(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$').hasMatch(v);
}

/// "GSTR-3B" (canvas): a month's tax on sales, less tax already paid on
/// purchases. New look only: the figures are worked out exactly as before.
class Gstr3bScreen extends ConsumerStatefulWidget {
  const Gstr3bScreen({super.key});

  @override
  ConsumerState<Gstr3bScreen> createState() => _Gstr3bScreenState();
}

class _Gstr3bScreenState extends ConsumerState<Gstr3bScreen> {
  int _year = DateTime.now().year;
  int _month = DateTime.now().month;

  Widget _card(String title, List<Widget> lines) => Container(
        margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
        decoration: BoxDecoration(
            color: Bl.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE6E5E3))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(title,
                  style: Bl.tight(12, w: FontWeight.w600, c: Bl.ink3)),
            ),
            ...lines,
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final month = reportMonthsFull[_month - 1];
    return ReportPage(
      title: 'GSTR-3B',
      range: DateTimeRange(
          start: DateTime(_year, _month, 1), end: DateTime(_year, _month + 1, 0)),
      builder: (context, params) {
        final invoicesAsync = ref.watch(reportInvoicesProvider(params));
        final purchasesAsync = ref.watch(reportPurchasesProvider(params));
        final suppliersAsync = ref.watch(reportSuppliersProvider(params));
        final bar = ReportMonthBar(
            year: _year,
            month: _month,
            onChanged: (y, m) => setState(() {
                  _year = y;
                  _month = m;
                }));

        final failed = invoicesAsync.error ?? purchasesAsync.error;
        if (failed != null) {
          return Column(children: [bar, Expanded(child: ReportError(failed))]);
        }
        if (!invoicesAsync.hasValue ||
            !purchasesAsync.hasValue ||
            suppliersAsync.isLoading) {
          return Column(
              children: [bar, const Expanded(child: ReportLoading())]);
        }

        final invoices = invoicesAsync.value ?? [];
        final purchases = purchasesAsync.value ?? [];
        // ITC is only claimable from GST-registered suppliers — build the set
        // of registered supplier ids so unregistered-supplier purchases are
        // excluded.
        final registeredSupplierIds = <String>{
          for (final s in (suppliersAsync.value ?? []))
            if (_hasValidGstin(s['gstin'] as String? ?? s['gst_no'] as String?))
              s['id'] as String,
        };

        // ── Section 3.1 — Outward supplies ─────────────────────────────────────────
        double outwardTaxable = 0,
            outwardCgst = 0,
            outwardSgst = 0,
            outwardIgst = 0;
        for (final inv in invoices) {
          outwardTaxable += (inv['taxable_amount'] as num?)?.toDouble() ?? 0;
          outwardCgst += (inv['cgst_amount'] as num?)?.toDouble() ?? 0;
          outwardSgst += (inv['sgst_amount'] as num?)?.toDouble() ?? 0;
          outwardIgst += (inv['igst_amount'] as num?)?.toDouble() ?? 0;
        }
        final grossTax = outwardCgst + outwardSgst + outwardIgst;

        // ── Section 3.2 — Inter-state ───────────────────────────────────────────────
        final interStateInvoices = invoices
            .where((inv) => (inv['is_interstate'] as bool?) == true)
            .toList();
        final interStateTaxable = interStateInvoices.fold(
            0.0,
            (s, inv) =>
                s + ((inv['taxable_amount'] as num?)?.toDouble() ?? 0));
        final interStateIgst = interStateInvoices.fold(
            0.0,
            (s, inv) =>
                s + ((inv['igst_amount'] as num?)?.toDouble() ?? 0));

        // ── Section 4 — ITC ─────────────────────────────────────────────────────────
        // Claimable only from GST-REGISTERED suppliers (Sec 16). Purchases from
        // unregistered suppliers carry no creditable input tax — counting them
        // over-claimed ITC and understated tax payable.
        double itcEstimate = 0;
        double ineligibleItc = 0;
        for (final p in purchases) {
          final method = ((p['payment_type']) as String?)?.toUpperCase() ?? '';
          if (method == 'CREDIT') continue; // unpaid — no ITC yet
          final amt = (p['total_amount'] as num?)?.toDouble() ?? 0;
          final tax = amt * (18 / 118); // back-calculate 18% GST from total
          final registered = registeredSupplierIds.contains(p['supplier_id']);
          if (registered) {
            itcEstimate += tax;
          } else {
            ineligibleItc += tax;
          }
        }
        final totalITC = itcEstimate;

        // ── Section 6.1 — Net ───────────────────────────────────────────────────────
        final netTaxDue =
            (grossTax - totalITC).clamp(0.0, double.infinity);


        final n = interStateInvoices.length;
        return ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            bar,
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
              child: Column(
                children: [
                  Text('Net tax to pay for $month',
                      style:
                          Bl.inter(13, w: FontWeight.w500, c: Bl.body)),
                  const SizedBox(height: 6),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(Money.inr(netTaxDue),
                        style: Bl.tight(36,
                            w: FontWeight.w700, ls: -0.04, h: 1.05)),
                  ),
                ],
              ),
            ),
            Container(
              margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                  color: Bl.tile, borderRadius: BorderRadius.circular(16)),
              child: Column(
                children: [
                  ReportLine('Tax on your sales', Money.inr(grossTax)),
                  ReportLine('Tax already paid on purchases (ITC)',
                      '− ${Money.inr(totalITC)}',
                      color: reportGreen),
                  ReportLine('Net tax to pay', Money.inr(netTaxDue),
                      total: true),
                ],
              ),
            ),
            _card('3.1 Outward supplies', [
              ReportLine('Taxable value', Money.inr(outwardTaxable)),
              ReportLine('CGST', Money.inr(outwardCgst)),
              ReportLine('SGST', Money.inr(outwardSgst)),
              ReportLine('IGST', Money.inr(outwardIgst)),
              ReportLine('Total tax', Money.inr(grossTax), total: true),
            ]),
            _card('3.2 Inter-state supplies', [
              ReportLine('$n inter-state invoice${n == 1 ? '' : 's'}',
                  'Taxable ${Money.inr(interStateTaxable)}'),
              ReportLine('IGST', Money.inr(interStateIgst), last: true),
            ]),
            _card('4. Input tax credit (ITC)', [
              ReportLine('From GST-registered suppliers', Money.inr(totalITC),
                  color: reportGreen),
              ReportLine('Not claimable (unregistered)',
                  Money.inr(ineligibleItc),
                  color: reportGrey, last: true),
            ]),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
              child: Text(
                  'ITC counts only purchases from GST-registered suppliers, estimated at 18% on paid bills. Verify against actual invoices.',
                  style: Bl.inter(12, c: reportGrey, h: 1.4)),
            ),
            Container(
              margin: const EdgeInsets.fromLTRB(18, 14, 18, 0),
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                  color: const Color(0xFFFFF6DD),
                  borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  const BlIcon(
                      '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
                      size: 18,
                      color: Color(0xFF8A5A00)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                        'Figures are estimates. File the official GSTR-3B on the GST portal.',
                        style: Bl.inter(12.5,
                            c: const Color(0xFF8A5A00), h: 1.4)),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
