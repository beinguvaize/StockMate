import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/sync_status_pill.dart'
    show connectivityProvider, pendingSyncCountProvider;
import 'package:mobile_app/core/widgets/logo_mark.dart';

import 'dash_common.dart';

/// Small bookledger mark, shop name, one line of status, and the same round
/// top-right action the old dashboard had (opens the drawer).
class DashboardHeader extends ConsumerWidget {
  final VoidCallback onMenu;
  final bool showingSavedFigures;
  const DashboardHeader(
      {super.key, required this.onMenu, this.showingSavedFigures = false});

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
    final ctx = ref.watch(tenantContextProvider).value;
    final pending = ref.watch(pendingSyncCountProvider).asData?.value ?? 0;
    final offline = ref.watch(connectivityProvider).asData?.value ==
        ConnectivityResult.none;

    // The app tracks whether the queue is empty, not WHEN it last synced, so
    // the line says what is true now instead of inventing "2 min ago".
    final String sync;
    final Color dot;
    if (offline) {
      sync = pending > 0 ? 'Offline · $pending waiting' : 'Offline';
      dot = DashColors.amber;
    } else if (pending > 0) {
      sync = '$pending waiting to sync';
      dot = DashColors.amber;
    } else if (showingSavedFigures) {
      sync = 'Showing saved figures';
      dot = DashColors.amber;
    } else {
      sync = 'Synced';
      dot = DashColors.green;
    }
    final role = _role(ctx?.roles ?? const []);
    final name = ctx?.tenant.name ?? '';

    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
      child: Row(
        children: [
          const LogoMark(height: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name.isEmpty ? 'bookledger' : name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: DashText.tight(17, w: FontWeight.w700, ls: -0.02)),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration:
                          BoxDecoration(color: dot, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        role.isEmpty ? sync : '$role · $sync',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: DashText.tight(12,
                            w: FontWeight.w600, c: DashColors.mute),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Tap(
            onTap: onMenu,
            child: Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                  color: DashColors.card, shape: BoxShape.circle),
              child: const Icon(LucideIcons.user,
                  size: 20, color: DashColors.ink),
            ),
          ),
        ],
      ),
    );
  }
}

/// Today / Week / Month with a sliding white pill.
class PeriodSwitch extends StatelessWidget {
  final int index;
  final ValueChanged<int> onChanged;
  const PeriodSwitch({super.key, required this.index, required this.onChanged});

  static const _labels = ['Today', 'Week', 'Month'];
  static const double _w = 84;
  static const double _h = 34;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: const Color(0xFFE9E8E5),
          borderRadius: BorderRadius.circular(999),
        ),
        child: SizedBox(
          width: _w * 3,
          height: _h,
          child: Stack(
            children: [
              AnimatedPositioned(
                duration: dashDur(context, 220),
                curve: dashOut,
                left: _w * index,
                top: 0,
                width: _w,
                height: _h,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(999),
                    boxShadow: const [
                      BoxShadow(
                          color: Color(0x1A000000),
                          blurRadius: 3,
                          offset: Offset(0, 1)),
                    ],
                  ),
                ),
              ),
              Row(
                children: [
                  for (var i = 0; i < 3; i++)
                    SizedBox(
                      width: _w,
                      height: _h,
                      child: Semantics(
                        button: true,
                        selected: i == index,
                        label: _labels[i],
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => onChanged(i),
                          child: Center(
                            child: AnimatedDefaultTextStyle(
                              duration: dashDur(context, 160),
                              style: DashText.tight(12.5,
                                  w: FontWeight.w600,
                                  c: i == index
                                      ? DashColors.ink
                                      : DashColors.mute),
                              child: Text(_labels[i]),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
