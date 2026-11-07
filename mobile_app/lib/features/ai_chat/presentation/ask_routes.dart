// Which phone screen a server screen_key opens. The server decides the key
// (with the plan's fallback already applied); the phone only maps it. An
// unknown key, or a question the server marks as having no phone screen, draws
// no link.

import 'package:flutter/material.dart';
import 'package:mobile_app/features/accounts/presentation/accounts_screen.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/reports/presentation/gstr3b_screen.dart';
import 'package:mobile_app/features/reports/presentation/inventory_report_screen.dart';
import 'package:mobile_app/features/reports/presentation/sales_summary_screen.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';

/// Return to the dashboard, the app's first route, instead of pushing a copy.
const askHomeKeys = {'dashboard', 'reports_expiry'};

final Map<String, WidgetBuilder> askScreens = {
  'reports_daily_sales': (_) => const SalesSummaryScreen(),
  'sales': (_) => const SalesScreen(),
  'reports_low_stock': (_) => const InventoryReportScreen(),
  'reports_inventory_dead': (_) => const InventoryReportScreen(),
  'inventory': (_) => const InventoryScreen(showAddButton: false),
  'clients': (_) => const CRMScreen(),
  'daybook': (_) => const DayBookScreen(),
  'accounts': (_) => const AccountsScreen(),
  'reports_gstr3b': (_) => const Gstr3bScreen(),
};

/// The key the phone can open for an answer, or null for no link.
String? askMobileKey(Map<String, dynamic>? screen) {
  if (screen == null || screen['mobile'] != true) return null;
  final key = screen['key'] as String?;
  if (key == null) return null;
  if (askHomeKeys.contains(key) || askScreens.containsKey(key)) return key;
  return null;
}

/// The label for that link. Going home is labelled as the dashboard it opens.
String? askLinkLabel(String? key, Map<String, dynamic> strings) {
  if (key == null) return null;
  final links = strings['links'] as Map<String, dynamic>;
  return (askHomeKeys.contains(key) ? links['dashboard'] : links[key]) as String?;
}

void askOpen(BuildContext context, String key) {
  if (askHomeKeys.contains(key)) {
    Navigator.of(context).popUntil((r) => r.isFirst);
    return;
  }
  final b = askScreens[key];
  if (b != null) Navigator.of(context).push(MaterialPageRoute(builder: b));
}
