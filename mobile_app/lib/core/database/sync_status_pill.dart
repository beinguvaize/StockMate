// Tiny pill showing offline-sync queue state. Drop into any AppBar.
// Colors: green = all synced, amber = pending, red = failed jobs present.

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
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

    final Color fg;
    final String label;

    if (offline) {
      fg = const Color(0xFFDC2626);
      label = pending > 0 ? 'Offline · $pending queued' : 'Offline';
    } else if (pending > 0) {
      fg = const Color(0xFFD97706);
      label = 'Syncing…';
    } else {
      fg = const Color(0xFF16A34A);
      label = 'Online';
    }

    return GestureDetector(
      onTap: () => ref.read(syncServiceProvider).sync(),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Pulsing dot for offline/syncing, static for online
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: fg,
                shape: BoxShape.circle,
                boxShadow: offline || pending > 0
                    ? [BoxShadow(color: fg.withValues(alpha: 0.4), blurRadius: 4, spreadRadius: 1)]
                    : null,
              ),
            ),
            const SizedBox(width: 5),
            Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: fg,
                letterSpacing: 0.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
