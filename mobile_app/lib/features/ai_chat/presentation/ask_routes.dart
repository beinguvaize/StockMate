// Which phone screen a server screen_key opens. The server decides the key
// (with the plan's fallback already applied); the phone only maps it. An
// unknown key, or a question the server marks as having no phone screen, draws
// no link.

import 'package:flutter/material.dart';
import 'package:mobile_app/features/accounts/presentation/accounts_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/reports/presentation/inventory_report_screen.dart';
import 'package:mobile_app/features/reports/presentation/sales_summary_screen.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';

/// Return to the dashboard, the app's first route, instead of pushing a copy.
const askHomeKeys = {'dashboard', 'reports_expiry'};

typedef AskScreenBuilder = Widget Function(Map<String, dynamic>? params);

/// The answer's period as a range of calendar days, or null when it has none.
DateTimeRange? askPeriod(Map<String, dynamic>? params) {
  DateTime? day(Object? v) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch('${v ?? ''}');
    return m == null ? null : DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
  }
  final from = day(params?['from']);
  final to = day(params?['to']);
  if (from == null || to == null || to.isBefore(from)) return null;
  return DateTimeRange(start: from, end: to);
}

/// Screens a phone link can open. A dated screen opens on the answer's own
/// period, so the tap never lands on a different number.
final Map<String, AskScreenBuilder> askScreens = {
  'reports_daily_sales': (p) => SalesSummaryScreen(initialRange: askPeriod(p)),
  'sales': (_) => const SalesScreen(),
  'reports_low_stock': (_) => const InventoryReportScreen(),
  'reports_inventory_dead': (_) => const InventoryReportScreen(),
  'inventory': (_) => const InventoryScreen(showAddButton: false),
  'clients': (_) => const CRMScreen(),
  'daybook': (_) => const DayBookScreen(),
  'accounts': (_) => const AccountsScreen(),
};

/// Screens the phone has but deliberately does not link to, and why. The tap
/// would land on a different number from the answer.
const askDroppedScreens = {
  // Sales Summary and the Sales tab total every live sale, voided, cancelled
  // and refunded included; the answer counts only countable sales. Making
  // their headline the server's figure needs a sales-total RPC open to every
  // role (ai_sales_summary is owner-only and get_pl_ranged has no gross
  // figure), so the "sold today" link goes until that exists. The screen
  // already takes the answer's period (initialRange) for when it returns.
  'reports_daily_sales': 'totals voided, cancelled and refunded sales, which the answer leaves out',
  'sales': 'totals voided, cancelled and refunded sales, which the answer leaves out',
};

/// The key the phone can open for an answer, or null for no link.
String? askMobileKey(Map<String, dynamic>? screen) {
  if (screen == null || screen['mobile'] != true) return null;
  final key = screen['key'] as String?;
  if (key == null || askDroppedScreens.containsKey(key)) return null;
  if (askHomeKeys.contains(key) || askScreens.containsKey(key)) return key;
  return null;
}

/// The label for that link. Going home is labelled as the dashboard it opens.
String? askLinkLabel(String? key, Map<String, dynamic> strings) {
  if (key == null) return null;
  final links = strings['links'] as Map<String, dynamic>;
  return (askHomeKeys.contains(key) ? links['dashboard'] : links[key]) as String?;
}

void askOpen(BuildContext context, String key, [Map<String, dynamic>? params]) {
  if (askHomeKeys.contains(key)) {
    Navigator.of(context).popUntil((r) => r.isFirst);
    return;
  }
  final b = askScreens[key];
  if (b != null) Navigator.of(context).push(MaterialPageRoute(builder: (_) => b(params)));
}
