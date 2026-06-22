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

class SyncStatusPill extends ConsumerStatefulWidget {
  const SyncStatusPill({super.key});

  @override
  ConsumerState<SyncStatusPill> createState() => _SyncStatusPillState();
}

class _SyncStatusPillState extends ConsumerState<SyncStatusPill> {
  bool _syncing = false;

  /// Manual "Force Sync" — flushes the queue and reports the result. Safe to
  /// tap any time: sync() is idempotent + reentrant-guarded, and never throws
  /// out (errors are handled inside), so it can't interrupt the app.
  Future<void> _forceSync(bool offline, int pending) async {
    final messenger = ScaffoldMessenger.of(context);
    if (offline) {
      messenger.showSnackBar(SnackBar(
        content: Text(pending > 0
            ? 'No internet — $pending change${pending == 1 ? '' : 's'} saved, will sync when back online.'
            : 'No internet connection.'),
        behavior: SnackBarBehavior.floating,
      ));
      return;
    }
    if (_syncing) return;
    setState(() => _syncing = true);
    final svc = ref.read(syncServiceProvider);
    messenger.showSnackBar(const SnackBar(
      content: Text('Syncing…'), duration: Duration(milliseconds: 900),
      behavior: SnackBarBehavior.floating,
    ));
    await svc.sync();
    final left = await svc.pendingCount();
    if (!mounted) return;
    setState(() => _syncing = false);
    messenger.showSnackBar(SnackBar(
      content: Text(left == 0
          ? 'All changes synced ✓'
          : '$left change${left == 1 ? '' : 's'} still pending — will retry.'),
      backgroundColor: left == 0 ? const Color(0xFF16A34A) : const Color(0xFFD97706),
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final pending = ref.watch(pendingSyncCountProvider).asData?.value ?? 0;
    final conn = ref.watch(connectivityProvider).asData?.value;
    final offline = conn == ConnectivityResult.none;

    final Color fg;
    final String label;

    if (offline) {
      fg = const Color(0xFFDC2626);
      label = pending > 0 ? 'Offline · $pending queued' : 'Offline';
    } else if (_syncing) {
      fg = const Color(0xFFD97706);
      label = 'Syncing…';
    } else if (pending > 0) {
      fg = const Color(0xFFD97706);
      label = '$pending to sync';
    } else {
      fg = const Color(0xFF16A34A);
      label = 'Online';
    }

    return GestureDetector(
      onTap: () => _forceSync(offline, pending),
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
              style: GoogleFonts.manrope(
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
