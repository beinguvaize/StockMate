import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/widgets/motion/motion_curves.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/hr/presentation/hr_screen.dart';
import 'package:mobile_app/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile_app/features/inventory/presentation/add_product_screen.dart';
import 'package:mobile_app/features/inventory/presentation/providers/inventory_provider.dart';
import 'package:mobile_app/features/logistics/presentation/driver_route_screen.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart';
import 'package:mobile_app/features/menu/presentation/menu_screen.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
import 'package:mobile_app/features/invoices/presentation/invoices_screen.dart';
import 'package:mobile_app/features/sales/presentation/sale_type_sheet.dart';
import 'package:mobile_app/features/sales/presentation/sales_screen.dart';
import 'dashboard_home.dart';
export 'dashboard_home.dart' show DashboardHome;

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

typedef _NavTab = ({String feature, String icon, String label, Widget tab});

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  int _selectedIndex = 0;
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  // Master tab list. `feature` is the RBAC key; '__menu__' is always shown.
  late final List<_NavTab> _allTabs = [
    (feature: 'dashboard', icon: BlIcons.home, label: 'Dashboard', tab: DashboardHome(onTabSwitch: _switchToFeature)),
    (feature: 'sales',     icon: BlIcons.receipt, label: 'Sales',     tab: const SalesScreen()),
    (feature: 'inventory', icon: BlIcons.box, label: 'Inventory', tab: const InventoryScreen(showAddButton: false)),
    (feature: 'logistics', icon: BlIcons.truck, label: 'My Route',  tab: const DriverRouteScreen()),
    (feature: '__menu__',  icon: BlIcons.more, label: 'More',      tab: const MenuScreen()),
  ];

  // Tabs the current user may see — filtered by the shared RBAC matrix.
  List<_NavTab> _visibleTabs(List<String> roles, String plan, Map? permissions) {
    return _allTabs.where((t) =>
        t.feature == '__menu__' ||
        canAccess(t.feature, roles: roles, plan: plan, permissions: permissions)
    ).toList();
  }

  void _switchTab(int index) => setState(() => _selectedIndex = index);

  // Jump to a tab by feature key (used by in-dashboard shortcuts).
  void _switchToFeature(String feature) {
    final ctx = ref.read(tenantContextProvider).value;
    final visible = _visibleTabs(ctx?.roles ?? [], ctx?.plan ?? 'FREE', ctx?.permissions);
    final idx = visible.indexWhere((t) => t.feature == feature);
    if (idx >= 0) setState(() => _selectedIndex = idx);
  }

  @override
  Widget build(BuildContext context) {
    final ctx = ref.watch(tenantContextProvider).value;
    final tabs = _visibleTabs(
        ctx?.roles ?? [], ctx?.plan ?? 'FREE', ctx?.permissions);
    final selIdx = tabs.isEmpty ? 0 : _selectedIndex.clamp(0, tabs.length - 1);
    final currentFeature = tabs.isEmpty ? '' : tabs[selIdx].feature;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: Bl.white,
      drawerScrimColor: Bl.shade,
      drawer: const _AppDrawer(),
      body: Column(
        children: [
          // ── Global app bar ────────────────────────────────────────
          // The Dashboard draws its own header (logo, shop, menu, bell), so
          // the shell bar would only repeat it. Keep the status-bar inset.
          if (currentFeature == 'dashboard')
            Container(
              color: Bl.white,
              child: const SafeArea(bottom: false, child: SizedBox(height: 4)),
            )
          else
            _GlobalAppBar(
              ground: currentFeature == '__menu__' ? Bl.grey : Bl.white,
              title: tabs.isEmpty ? '' : tabs[selIdx].label,
              onMenuTap: () => _scaffoldKey.currentState?.openDrawer(),
            ),

          // ── Tab content ───────────────────────────────────────────
          Expanded(
            child: Stack(
              children: [
                MediaQuery.removePadding(
                  context: context,
                  removeTop: true,
                  child: IndexedStack(
                    index: selIdx,
                    children: tabs.map((t) => t.tab).toList(),
                  ),
                ),

                // Floating tab bar, with the amber plus beside it on the
                // two tabs that add something.
                Positioned(
                  left: 10,
                  right: 10,
                  bottom: 12 + MediaQuery.of(context).viewPadding.bottom,
                  child: _TabBar(
                    tabs: tabs,
                    selected: selIdx,
                    onSelect: _switchTab,
                    plusLabel: currentFeature == 'inventory'
                        ? 'Add product'
                        : currentFeature == 'sales'
                            ? 'New sale'
                            : null,
                    onPlus: () => _onPlus(currentFeature),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _onPlus(String feature) {
    final container = ProviderScope.containerOf(context, listen: false);
    if (feature == 'inventory') {
      // Hold the container now: reaching for `context` inside the .then() is
      // across an async gap, by which point this widget may be gone.
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const AddProductScreen()),
      ).then((_) => container.invalidate(productsProvider));
      return;
    }
    final roles = container.read(tenantContextProvider).value?.roles ?? [];
    navigateToNewSale(context, roles);
  }
}

/// The floating bottom bar from the canvas (`.tbar`): a white pill holding
/// the tabs and, on Sales and Inventory, a round amber plus beside it.
class _TabBar extends StatelessWidget {
  final List<_NavTab> tabs;
  final int selected;
  final ValueChanged<int> onSelect;
  final String? plusLabel;
  final VoidCallback onPlus;
  const _TabBar({
    required this.tabs,
    required this.selected,
    required this.onSelect,
    required this.plusLabel,
    required this.onPlus,
  });

  static const _lift = [
    BoxShadow(
        color: Color(0x4D000000),
        blurRadius: 22,
        spreadRadius: -8,
        offset: Offset(0, 8)),
    BoxShadow(color: Color(0x0D000000), spreadRadius: 1),
  ];

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: Container(
              height: 54,
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: Bl.white,
                borderRadius: BorderRadius.circular(999),
                boxShadow: _lift,
              ),
              child: Row(
                children: [
                  for (var i = 0; i < tabs.length; i++)
                    Expanded(
                      child: Semantics(
                        button: true,
                        selected: i == selected,
                        label: tabs[i].label,
                        excludeSemantics: true,
                        child: BlTap(
                          onTap: () => onSelect(i),
                          child: Center(
                            child: AnimatedContainer(
                              duration: motionDur(context, 160),
                              curve: MotionCurves.out,
                              height: 46,
                              decoration: BoxDecoration(
                                color: i == selected
                                    ? const Color(0xFFEFEFEF)
                                    : const Color(0x00EFEFEF),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  BlIcon(tabs[i].icon,
                                      size: 17,
                                      color: i == selected
                                          ? Bl.ink
                                          : const Color(0xFF6D7175)),
                                  const SizedBox(height: 1),
                                  Text(tabs[i].label,
                                      maxLines: 1,
                                      softWrap: false,
                                      overflow: TextOverflow.visible,
                                      textScaler: TextScaler.noScaling,
                                      style: Bl.tight(8.5,
                                          w: FontWeight.w600,
                                          ls: 0,
                                          c: i == selected
                                              ? Bl.ink
                                              : const Color(0xFF6D7175))),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (plusLabel != null) ...[
            const SizedBox(width: 6),
            BlTap(
              label: plusLabel,
              onTap: onPlus,
              child: Container(
                width: 50,
                height: 50,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: Bl.amber,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                        color: Color(0x99B45309),
                        blurRadius: 20,
                        spreadRadius: -8,
                        offset: Offset(0, 10)),
                  ],
                ),
                child: const BlIcon(BlIcons.plus, size: 22, color: Bl.white),
              ),
            ),
          ],
        ],
      );
}

// ─────────────────────────────────────────────────────────────────────────────
// Global App Bar
// ─────────────────────────────────────────────────────────────────────────────

/// The notifications sheet, shared by the shell bar and the Dashboard header.
void showNotificationsSheet(BuildContext context) {
  showBlSheet(
    context: context,
    builder: (_) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const BlSheetTitle('Notifications'),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 34, 10, 30),
          child: Column(
            children: [
              Container(
                width: 76,
                height: 76,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                    color: Bl.wellSoft, shape: BoxShape.circle),
                child: const BlIcon(BlIcons.bell,
                    size: 30, color: Bl.mute, stroke: 1.7),
              ),
              const SizedBox(height: 16),
              Text('No new notifications',
                  style: Bl.tight(18, w: FontWeight.w700, ls: -0.02)),
              const SizedBox(height: 6),
              Text('You are all caught up.', style: Bl.inter(13.5, h: 1.5)),
            ],
          ),
        ),
      ],
    ),
  );
}

/// Top bar of every tab except the Dashboard (`.shp`): menu, tab name, the
/// sync pill and the bell.
class _GlobalAppBar extends StatelessWidget {
  final VoidCallback onMenuTap;
  final String title;
  final Color ground;
  const _GlobalAppBar(
      {required this.onMenuTap, required this.title, this.ground = Bl.white});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: ground,
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 48,
          child: Row(
            children: [
              BlTap(
                label: 'Menu',
                onTap: onMenuTap,
                child: const SizedBox(
                  width: 45,
                  height: 48,
                  child: Padding(
                    padding: EdgeInsets.only(left: 16),
                    child: Align(
                        alignment: Alignment.centerLeft,
                        child: BlIcon(BlIcons.menu, size: 20)),
                  ),
                ),
              ),
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.tight(20, w: FontWeight.w700, ls: -0.02),
                ),
              ),
              const SyncStatusPill(),
              BlTap(
                label: 'Notifications',
                onTap: () => showNotificationsSheet(context),
                child: const SizedBox(
                  width: 52,
                  height: 48,
                  child: Center(child: BlIcon(BlIcons.bell, size: 20)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Left drawer
// ─────────────────────────────────────────────────────────────────────────────

class _AppDrawer extends ConsumerWidget {
  const _AppDrawer();

  static const _sections = [
    _DrawerSection(label: 'Sales & finance', items: [
      _DrawerItem(id: 'new-sale', icon: BlIcons.plus, label: 'New sale', feature: 'sales'),
      _DrawerItem(id: 'sales', icon: BlIcons.receipt, label: 'Sales history', feature: 'sales'),
      _DrawerItem(id: 'invoices', icon: BlIcons.doc, label: 'Invoices', feature: 'invoices'),
      _DrawerItem(id: 'expenses', icon: BlIcons.cash, label: 'Expenses', feature: 'expenses'),
      _DrawerItem(id: 'purchases', icon: BlIcons.cart, label: 'Purchases', feature: 'purchases'),
      _DrawerItem(id: 'daybook', icon: BlIcons.book, label: 'Day Book', feature: 'daybook'),
    ]),
    _DrawerSection(label: 'Inventory & clients', items: [
      _DrawerItem(id: 'inventory', icon: BlIcons.box, label: 'Inventory', feature: 'inventory'),
      _DrawerItem(id: 'clients', icon: BlIcons.users, label: 'Clients & Suppliers', feature: 'clients'),
    ]),
    _DrawerSection(label: 'Insights', items: [
      _DrawerItem(id: 'reports', icon: BlIcons.chart, label: 'Reports', feature: 'reports'),
    ]),
    _DrawerSection(label: 'Staff & vehicles', items: [
      _DrawerItem(id: 'payroll', icon: BlIcons.idCard, label: 'Payroll', feature: 'payroll'),
      _DrawerItem(id: 'vehicles', icon: BlIcons.truck, label: 'Vehicles', feature: 'logistics'),
    ]),
  ];

  void _navigate(BuildContext context, String id, {List<String> roles = const []}) {
    Navigator.pop(context); // close drawer
    if (id == 'new-sale') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) navigateToNewSale(context, roles);
      });
      return;
    }
    final Widget? screen = _screenFor(id);
    if (screen != null) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    }
  }

  Widget? _screenFor(String id) {
    switch (id) {
      case 'sales':     return const SalesScreen();
      case 'invoices':  return const InvoicesScreen();
      case 'expenses':  return const FinanceScreen();
      case 'purchases': return const PurchasesScreen();
      case 'daybook':   return const DayBookScreen();
      case 'inventory': return const InventoryScreen();
      case 'clients':   return const CRMScreen();
      case 'reports':   return const ReportsScreen();
      case 'payroll':   return const HRScreen();
      case 'vehicles':  return const LogisticsScreen();
      default:          return null;
    }
  }

  static String _role(List<String> roles) {
    if (roles.contains('OWNER')) return 'Owner';
    if (roles.contains('GLOBAL_ADMIN')) return 'Admin';
    if (roles.contains('DRIVER')) return 'Driver';
    if (roles.contains('SALES')) return 'Sales';
    if (roles.contains('STAFF')) return 'Staff';
    return '';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenant = ref.watch(tenantContextProvider).value;
    final roles = tenant?.roles ?? [];
    final plan = tenant?.plan ?? 'FREE';
    final permissions = tenant?.permissions;
    // Filter drawer by RBAC — drop items and empty sections the user can't access.
    final sections = _sections
        .map((s) => _DrawerSection(
              label: s.label,
              items: s.items
                  .where((i) => canAccess(i.feature,
                      roles: roles, plan: plan, permissions: permissions))
                  .toList(),
            ))
        .where((s) => s.items.isNotEmpty)
        .toList();
    final shop = tenant?.tenant.name ?? '';
    final role = _role(roles);
    final who = [if (shop.isNotEmpty) shop, if (role.isNotEmpty) role].join(' · ');

    return Drawer(
      backgroundColor: Bl.white,
      elevation: 0,
      width: MediaQuery.of(context).size.width * 0.80,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(26)),
      ),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
              decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Bl.sep))),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Image.asset('assets/images/logo_linear.png',
                      width: 150, semanticLabel: 'bookledger'),
                  if (who.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: const BoxDecoration(
                              color: Color(0xFF1E9E5A), shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(who,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Bl.inter(12.5, w: FontWeight.w500)),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final section in sections) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                        child: Text(section.label.toUpperCase(),
                            style: Bl.eyebrow),
                      ),
                      for (final item in section.items)
                        _DrawerTile(
                          item: item,
                          onTap: () => _navigate(context, item.id, roles: roles),
                        ),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 18),
              child: BlButton(
                'Sign out',
                kind: BlButtonKind.danger,
                leading:
                    const BlIcon(BlIcons.signOut, size: 16, color: Bl.redDeep),
                onTap: () async {
                  Navigator.pop(context);
                  await supabase.auth.signOut();
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerSection {
  final String label;
  final List<_DrawerItem> items;
  const _DrawerSection({required this.label, required this.items});
}

class _DrawerItem {
  final String id;
  final String icon;
  final String label;
  final String feature; // RBAC key
  const _DrawerItem({
    required this.id,
    required this.icon,
    required this.label,
    required this.feature,
  });
}

class _DrawerTile extends StatelessWidget {
  final _DrawerItem item;
  final VoidCallback onTap;
  const _DrawerTile({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    // "New sale" is the one highlighted row.
    final primary = item.id == 'new-sale';
    return BlTap(
      label: item.label,
      onTap: onTap,
      child: Container(
        height: 44,
        margin: const EdgeInsets.symmetric(horizontal: 10),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: primary ? const Color(0xFFFFF8EC) : null,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            BlIconTile(item.icon,
                size: 30,
                bg: primary ? Bl.brand : Bl.wellSoft,
                fg: primary ? Bl.white : Bl.ink3),
            const SizedBox(width: 12),
            Expanded(
              child: Text(item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.tight(14.5, w: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}
