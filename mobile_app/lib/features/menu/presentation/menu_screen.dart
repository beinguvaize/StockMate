import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/auth/feature_gate.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/clients_suppliers/presentation/crm_screen.dart';
import 'package:mobile_app/features/daybook/presentation/daybook_screen.dart';
import 'package:mobile_app/features/finance/presentation/finance_screen.dart';
import 'package:mobile_app/features/hr/presentation/hr_screen.dart';
import 'package:mobile_app/features/logistics/presentation/driver_route_screen.dart';
import 'package:mobile_app/features/logistics/presentation/logistics_screen.dart';
import 'package:mobile_app/features/purchases/presentation/purchases_screen.dart';
import 'package:mobile_app/features/reports/presentation/reports_screen.dart';
import 'package:mobile_app/features/settings/presentation/settings_screen.dart';
import 'package:mobile_app/features/accounts/presentation/accounts_screen.dart';
import 'package:mobile_app/features/estimates/presentation/estimates_screen.dart';
import 'package:mobile_app/features/cash_collection/presentation/cash_collection_screen.dart';
import 'package:mobile_app/features/manufacturing/presentation/manufacturing_screen.dart';

/// One tile of the Modules grid.
typedef _Module = ({
  String icon,
  Color bg,
  Color fg,
  String label,
  String feature,
  bool alwaysShow,
  Widget Function() screen,
});

const _blue = (Color(0xFFE4EEFF), Color(0xFF1D4E9E));
const _red = (Color(0xFFFDE2E2), Color(0xFFB91C1C));
const _yellow = (Color(0xFFFFF1C9), Color(0xFF8A5A00));
const _green = (Color(0xFFE3F5EA), Color(0xFF17663A));
const _purple = (Color(0xFFF3E8FF), Color(0xFF6D28D9));
const _amber = (Color(0xFFFFF3DC), Color(0xFFB86A0A));
const _grey = (Color(0xFFEFEEEC), Color(0xFF30343A));

_Module _m(
  String icon,
  (Color, Color) tint,
  String label,
  String feature,
  Widget Function() screen, {
  bool alwaysShow = false,
}) => (
  icon: icon,
  bg: tint.$1,
  fg: tint.$2,
  label: label,
  feature: feature,
  alwaysShow: alwaysShow,
  screen: screen,
);

const _factory =
    '<path d="M3 20V10l6 4v-4l6 4V5h6v15z"/><path d="M7 17h2M12 17h2"/>';

final List<_Module> _modules = [
  _m(
    BlIcons.users,
    _blue,
    'Clients & Suppliers',
    'clients',
    () => const CRMScreen(),
  ),
  _m(BlIcons.cash, _red, 'Expenses', 'expenses', () => const FinanceScreen()),
  _m(BlIcons.book, _yellow, 'Day Book', 'daybook', () => const DayBookScreen()),
  _m(
    BlIcons.cart,
    _green,
    'Purchases',
    'purchases',
    () => const PurchasesScreen(),
  ),
  _m(BlIcons.chart, _purple, 'Reports', 'reports', () => const ReportsScreen()),
  _m(BlIcons.idCard, _blue, 'Payroll', 'payroll', () => const HRScreen()),
  _m(
    BlIcons.bank,
    _green,
    'Cash & Bank',
    'accounts',
    () => const AccountsScreen(),
  ),
  _m(
    BlIcons.doc,
    _yellow,
    'Estimates',
    'estimates',
    () => const EstimatesScreen(),
  ),
  _m(
    BlIcons.collect,
    _amber,
    'Cash Collection',
    'clients',
    () => const CashCollectionScreen(),
  ),
  _m(
    _factory,
    _amber,
    'Manufacturing',
    'manufacturing',
    () => const ManufacturingScreen(),
  ),
  _m(
    BlIcons.truck,
    _grey,
    'Vehicles',
    'logistics',
    () => const LogisticsScreen(),
  ),
  _m(
    BlIcons.route,
    _grey,
    'My Route',
    'logistics',
    () => const DriverRouteScreen(),
    alwaysShow: true,
  ),
];

/// Features that are hidden outright (not shown locked) without access, as
/// the list this grid replaces did.
const _hideWithoutAccess = {'reports', 'payroll'};

String _planName(String plan) => plan.isEmpty
    ? plan
    : plan[0].toUpperCase() + plan.substring(1).toLowerCase();

class MenuScreen extends ConsumerWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantAsync = ref.watch(tenantContextProvider);
    final bottom = 84 + MediaQuery.of(context).viewPadding.bottom;

    // The shell's tab stack gives loose constraints; fill it so the grey
    // ground reaches the bottom on a short list.
    return SizedBox.expand(
      child: ColoredBox(
        color: Bl.grey,
        child: tenantAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: Bl.amber, strokeWidth: 2),
          ),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(18),
            child: Text(
              'Could not load your account: $e',
              style: Bl.inter(13, c: Bl.redDeep),
            ),
          ),
          data: (ctx) {
            final roles = ctx?.userRoles ?? [];
            final plan = ctx?.plan ?? 'FREE';
            final permissions = ctx?.permissions;
            final name =
                ctx?.userProfile.name ?? ctx?.userProfile.email ?? 'User';

            final visible = _modules.where((m) {
              if (m.feature == 'logistics' && !m.alwaysShow ||
                  _hideWithoutAccess.contains(m.feature)) {
                return canAccess(
                  m.feature,
                  roles: roles,
                  plan: plan,
                  permissions: permissions,
                );
              }
              if (m.alwaysShow) return true;
              return hasModulePermission(
                m.feature == 'logistics' ? 'vehicles' : m.feature,
                'view',
                roles: roles,
                permissions: permissions,
              );
            }).toList();

            return SingleChildScrollView(
              padding: EdgeInsets.only(bottom: bottom),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: BlEntrance.all([
                  // ── Who is signed in ─────────────────────────────
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
                    child: Row(
                      children: [
                        BlInitials(
                          name.isNotEmpty ? name[0].toUpperCase() : 'U',
                          size: 50,
                          bg: Bl.ink,
                          fg: Bl.white,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Bl.tight(
                                  18,
                                  w: FontWeight.w700,
                                  ls: -0.02,
                                ),
                              ),
                              const SizedBox(height: 1),
                              Text(
                                ctx?.tenant.name ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Bl.inter(
                                  12.5,
                                  c: const Color(0xFF7A8088),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: Bl.ink,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            plan.toUpperCase(),
                            style: Bl.tight(
                              11,
                              w: FontWeight.w700,
                              c: Bl.white,
                              ls: 0.05,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // ── Sync now · Settings · Sign out ───────────────
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                    child: Row(
                      children: [
                        Expanded(
                          child: _Action(
                            BlIcons.sync,
                            'Sync now',
                            onTap: () => _forceSyncFromMenu(context, ref),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _Action(
                            BlIcons.settings,
                            'Settings',
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const SettingsScreen(),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _Action(
                            BlIcons.signOut,
                            'Sign out',
                            danger: true,
                            onTap: () async => supabase.auth.signOut(),
                          ),
                        ),
                      ],
                    ),
                  ),

                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 16, 18, 6),
                    child: Text('MODULES', style: Bl.eyebrow),
                  ),

                  // ── Modules, three to a row ──────────────────────
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      children: [
                        for (var r = 0; r < visible.length; r += 3) ...[
                          if (r > 0) const SizedBox(height: 8),
                          IntrinsicHeight(
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                for (var c = 0; c < 3; c++) ...[
                                  if (c > 0) const SizedBox(width: 8),
                                  Expanded(
                                    child: r + c < visible.length
                                        ? _ModuleTile(
                                            visible[r + c],
                                            plan: plan,
                                          )
                                        : const SizedBox.shrink(),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ]),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Action extends StatelessWidget {
  final String icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;
  const _Action(
    this.icon,
    this.label, {
    required this.onTap,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    final fg = danger ? Bl.redDeep : Bl.ink3;
    return BlTap(
      label: label,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(6, 12, 6, 10),
        decoration: BoxDecoration(
          color: danger ? Bl.redSoft : Bl.wellSoft,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            BlIcon(icon, size: 19, color: fg),
            const SizedBox(height: 6),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Bl.tight(12.5, w: FontWeight.w600, c: fg),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModuleTile extends StatelessWidget {
  final _Module m;
  final String plan;
  const _ModuleTile(this.m, {required this.plan});

  @override
  Widget build(BuildContext context) {
    final locked = !planMeetsRequirement(m.feature, plan);
    final needs = requiredPlanFor(m.feature);
    const dim = Color(0xFFA8ADB4);
    return BlTap(
      label: locked
          ? '${m.label}, needs the ${_planName(needs)} plan'
          : m.label,
      onTap: locked
          ? () => ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Upgrade to $needs to unlock this feature'),
                behavior: SnackBarBehavior.floating,
              ),
            )
          : () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => m.screen()),
            ),
      child: Stack(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(4, 12, 4, 10),
            decoration: BoxDecoration(
              color: locked ? const Color(0xFFFAFAF9) : Bl.tile,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                BlIconTile(
                  locked ? BlIcons.lock : m.icon,
                  size: 38,
                  radius: 12,
                  iconSize: locked ? 16 : 17,
                  bg: locked ? const Color(0xFFEFEEEC) : m.bg,
                  fg: locked ? dim : m.fg,
                ),
                const SizedBox(height: 7),
                Text(
                  m.label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Bl.tight(
                    12,
                    w: FontWeight.w600,
                    h: 1.25,
                    c: locked ? dim : Bl.ink,
                  ),
                ),
              ],
            ),
          ),
          if (locked)
            Positioned(
              top: 7,
              right: 7,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF1C9),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  _planName(needs),
                  style: Bl.tight(
                    9.5,
                    w: FontWeight.w600,
                    c: const Color(0xFF8A5A00),
                    ls: 0,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Manual Force Sync from the More menu. Flushes the offline queue and reports
/// the result. sync() is idempotent + guarded + timed-out, so it's always safe.
Future<void> _forceSyncFromMenu(BuildContext context, WidgetRef ref) async {
  final messenger = ScaffoldMessenger.of(context);
  final svc = ref.read(syncServiceProvider);
  final conn = await Connectivity().checkConnectivity();
  final pending = await svc.pendingCount();
  if (conn == ConnectivityResult.none) {
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          pending > 0
              ? 'No internet — $pending change${pending == 1 ? '' : 's'} saved, will sync when back online.'
              : 'No internet connection.',
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
    return;
  }
  messenger.showSnackBar(
    const SnackBar(
      content: Text('Syncing…'),
      duration: Duration(milliseconds: 900),
      behavior: SnackBarBehavior.floating,
    ),
  );
  await svc.sync();
  final left = await svc.pendingCount();
  if (!context.mounted) return;
  messenger.showSnackBar(
    SnackBar(
      content: Text(
        left == 0
            ? 'All changes synced ✓'
            : '$left change${left == 1 ? '' : 's'} still pending — will retry.',
      ),
      backgroundColor: left == 0
          ? const Color(0xFF16A34A)
          : const Color(0xFFD97706),
      behavior: SnackBarBehavior.floating,
    ),
  );
}
