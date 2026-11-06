// The phone's profit figures. All of them come from get_pl_ranged, the call the
// web's Financial report makes, so a period has one answer on both surfaces.
//
// Nothing here works profit out. Reading a figure from a row is the whole job.
// Add a figure to the RPC, never a sum to this file. The call's shape is pinned
// by shared/fixtures/pl_ranged.json, which the web suite also reads.

import 'package:flutter/material.dart' show DateTimeRange;
import 'package:mobile_app/features/finance/data/recurring.dart' show todayIst;

const plRangedRpc = 'get_pl_ranged';

/// A calendar day as the RPC takes it. The fields are read as they stand, with
/// no time zone conversion, so the day on the picker is the day that is sent.
String plDay(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The default period: the last 30 days, ending today in IST, the shop's day,
/// whatever zone the phone is set to.
DateTimeRange defaultPlRange([DateTime? now]) {
  final end = DateTime.parse(todayIst(now));
  return DateTimeRange(start: DateTime(end.year, end.month, end.day - 30), end: end);
}

typedef PlQuery = ({String tenantId, String from, String to});

PlQuery plQuery(String tenantId, DateTimeRange range) =>
    (tenantId: tenantId, from: plDay(range.start), to: plDay(range.end));

Map<String, dynamic> plParams(PlQuery q) =>
    {'p_tenant_id': q.tenantId, 'p_from': q.from, 'p_to': q.to};

double _figure(Map<String, dynamic> row, String key) {
  final v = row[key];
  final n = v is num ? v.toDouble() : double.tryParse('$v');
  // A missing figure fails the load. Reading it as 0 would state a zero as fact.
  if (n == null) throw FormatException('get_pl_ranged returned no $key');
  return n;
}

class ProfitLoss {
  final double netSales; // after GST and returns
  final double cogs;
  final double grossProfit;
  final double expenses;
  final double netProfit;
  final double returnsTotal;
  final double outputGst;

  const ProfitLoss({
    required this.netSales,
    required this.cogs,
    required this.grossProfit,
    required this.expenses,
    required this.netProfit,
    required this.returnsTotal,
    required this.outputGst,
  });

  factory ProfitLoss.fromRow(Map<String, dynamic> row) => ProfitLoss(
        netSales: _figure(row, 'revenue_net'),
        cogs: _figure(row, 'cogs'),
        grossProfit: _figure(row, 'gross_profit'),
        expenses: _figure(row, 'expenses'),
        netProfit: _figure(row, 'net_profit'),
        returnsTotal: _figure(row, 'returns_total'),
        outputGst: _figure(row, 'output_gst'),
      );

  /// The RPC's gross profit as a share of its net sales, as the web's Financial
  /// report shows it. Null when there were no sales to take a share of.
  double? get grossMarginPct => netSales > 0 ? grossProfit / netSales * 100 : null;
}
