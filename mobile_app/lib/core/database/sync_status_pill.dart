// Tiny pill showing offline-sync queue state. Drop into any AppBar.
// Colors: green = all synced, amber = pending, red = failed jobs present.

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/main.dart' show syncServiceProvider;

final pendingSyncCountProvider = StreamProvider<int>((ref) {
  final svc = ref.watch(syncServiceProvider);
  return svc.watchPendingCount();
});

/// Reactive connectivity stream — yields the latest ConnectivityResult.
final connectivityProvider = StreamProvider<ConnectivityResult>((ref) async* {
  yield await Connectivity().checkConnectivity();
  yield* Connectivity().onConnectivityChanged;
});

class SyncStatusPill extends ConsumerWidget {
  const SyncStatusPill({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingSyncCountProvider).asData?.value ?? 0;
    final conn = ref.watch(connectivityProvider).asData?.value;
    final offline = conn == ConnectivityResult.none;

    if (!offline && pending == 0) return const SizedBox.shrink();

    final Color bg;
    final Color fg;
    final IconData icon;
    final String label;

    if (offline) {
      bg = const Color(0xFFFEF2F2);
      fg = const Color(0xFFB91C1C);
      icon = LucideIcons.wifiOff;
      label = pending > 0 ? 'Offline · $pending pending' : 'Offline';
    } else if (pending > 0) {
      bg = const Color(0xFFFFFBEB);
      fg = const Color(0xFFB45309);
      icon = LucideIcons.cloudOff;
      label = 'Syncing $pending…';
    } else {
      // Unreachable due to guard above.
      bg = const Color(0xFFECFDF5);
      fg = const Color(0xFF047857);
      icon = LucideIcons.cloud;
      label = 'Synced';
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: GestureDetector(
        onTap: () {
          // Manual flush trigger
          ref.read(syncServiceProvider).sync();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(99),
            border: Border.all(color: fg.withValues(alpha: 0.25)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 12, color: fg),
              const SizedBox(width: 6),
              Text(
                label,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: fg,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
