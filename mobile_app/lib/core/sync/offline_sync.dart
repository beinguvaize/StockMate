import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:mobile_app/core/supabase/client.dart';

enum SyncStatus { online, syncing, offline }

class SyncState {
  final SyncStatus status;
  final int pendingCount;
  final DateTime? lastSynced;
  const SyncState({this.status = SyncStatus.online, this.pendingCount = 0, this.lastSynced});
}

class SyncNotifier extends StateNotifier<SyncState> {
  Timer? _syncTimer;
  StreamSubscription? _connectivitySub;

  SyncNotifier() : super(const SyncState()) {
    _init();
  }

  void _init() {
    _connectivitySub = Connectivity().onConnectivityChanged.listen((result) {
      // connectivity_plus 5.x streams List<ConnectivityResult>
      final isOnline = result != ConnectivityResult.none;
      if (isOnline) {
        triggerSync();
      } else {
        state = SyncState(
          status: SyncStatus.offline,
          pendingCount: state.pendingCount,
          lastSynced: state.lastSynced,
        );
      }
    });
    // Periodic sync every 5 minutes
    _syncTimer = Timer.periodic(const Duration(minutes: 5), (_) => triggerSync());
  }

  Future<void> triggerSync() async {
    if (state.status == SyncStatus.syncing) return;
    state = SyncState(
      status: SyncStatus.syncing,
      pendingCount: state.pendingCount,
      lastSynced: state.lastSynced,
    );
    try {
      // Verify Supabase connection. MUST have a timeout — without it a hung
      // supabase call (auth-queue stall) leaves status stuck on `syncing`
      // forever, and the guard above then bails every retry. Bounded wait
      // guarantees we always resolve to online or offline.
      await supabase
          .from('tenants')
          .select('id')
          .limit(1)
          .timeout(const Duration(seconds: 10));
      state = SyncState(
        status: SyncStatus.online,
        pendingCount: 0,
        lastSynced: DateTime.now(),
      );
    } catch (_) {
      state = SyncState(
        status: SyncStatus.offline,
        pendingCount: state.pendingCount,
        lastSynced: state.lastSynced,
      );
    }
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    _connectivitySub?.cancel();
    super.dispose();
  }
}

final syncProvider = StateNotifierProvider<SyncNotifier, SyncState>((ref) {
  return SyncNotifier();
});
