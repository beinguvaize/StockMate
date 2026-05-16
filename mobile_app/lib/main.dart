import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/database/realtime_sync.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/auth/data/auth_provider.dart';
import 'package:mobile_app/features/auth/presentation/login_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';
import 'package:mobile_app/features/shell/desktop_shell.dart';
import 'package:lucide_icons/lucide_icons.dart';

import 'package:mobile_app/core/database/sync_service.dart';
import 'package:mobile_app/features/inventory/data/repositories/product_repository.dart';

// Providers
final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(() => db.close());
  return db;
});

final syncServiceProvider = Provider<SyncService>((ref) {
  return SyncService(ref.watch(databaseProvider));
});

final productRepositoryProvider = Provider<ProductRepository>((ref) {
  return ProductRepository(
    db: ref.watch(databaseProvider),
    syncService: ref.watch(syncServiceProvider),
  );
});

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Timeout Supabase init — paused/slow project must not block runApp.
  // App shows splash immediately; auth state resolves once network comes up.
  try {
    await SupabaseConfig.initialize()
        .timeout(const Duration(seconds: 6));
  } catch (_) {
    // Init timed out or failed — proceed anyway. SessionProvider will
    // yield null session and show the LoginScreen.
  }

  final container = ProviderContainer();
  // Fire-and-forget background sync — do NOT await here.
  unawaited(container.read(syncServiceProvider).sync());
  unawaited(container.read(syncServiceProvider).pullSync());

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const LedgrApp(),
    ),
  );
}

class LedgrApp extends ConsumerStatefulWidget {
  const LedgrApp({super.key});

  @override
  ConsumerState<LedgrApp> createState() => _LedgrAppState();
}

class _LedgrAppState extends ConsumerState<LedgrApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // When the user resumes the app after backgrounding (especially after
    // an offline trip), kick the sync engine. Cheap if queue is empty.
    if (state == AppLifecycleState.resumed) {
      try {
        ref.read(syncServiceProvider).sync();
        ref.read(syncServiceProvider).pullSync();
      } catch (_) {/* ignore — providers may not be ready before login */}
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ledgr ERP',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: const ColorScheme(
          brightness: Brightness.light,
          primary: AppColors.primary,
          onPrimary: AppColors.onPrimary,
          primaryContainer: AppColors.primaryContainer,
          onPrimaryContainer: AppColors.onPrimaryContainer,
          secondary: AppColors.secondary,
          onSecondary: Colors.white,
          secondaryContainer: AppColors.secondaryContainer,
          onSecondaryContainer: Color(0xFF304d37),
          tertiary: Color(0xFF5b5f5a),
          onTertiary: Colors.white,
          tertiaryContainer: Color(0xFFd0d3cc),
          onTertiaryContainer: Color(0xFF575b56),
          error: AppColors.error,
          onError: Colors.white,
          errorContainer: AppColors.errorContainer,
          onErrorContainer: Color(0xFF93000a),
          surface: AppColors.surface,
          onSurface: AppColors.onSurface,
          onSurfaceVariant: AppColors.onSurfaceVariant,
          outline: AppColors.outline,
          outlineVariant: AppColors.outlineVariant,
          inverseSurface: Color(0xFF313030),
          onInverseSurface: Color(0xFFf3f0ef),
          inversePrimary: Color(0xFF98da27),
          surfaceTint: AppColors.primary,
        ),
        scaffoldBackgroundColor: AppColors.canvas,
        useMaterial3: true,
        textTheme: GoogleFonts.interTextTheme().copyWith(
          displayLarge: GoogleFonts.hankenGrotesk(fontSize: 48, fontWeight: FontWeight.w700, letterSpacing: -0.02 * 48, color: AppColors.onSurface),
          displayMedium: GoogleFonts.hankenGrotesk(fontSize: 32, fontWeight: FontWeight.w600, letterSpacing: -0.01 * 32, color: AppColors.onSurface),
          displaySmall: GoogleFonts.hankenGrotesk(fontSize: 24, fontWeight: FontWeight.w600, color: AppColors.onSurface),
          headlineLarge: GoogleFonts.hankenGrotesk(fontSize: 32, fontWeight: FontWeight.w600, letterSpacing: -0.3, color: AppColors.onSurface),
          headlineMedium: GoogleFonts.hankenGrotesk(fontSize: 24, fontWeight: FontWeight.w600, color: AppColors.onSurface),
          headlineSmall: GoogleFonts.hankenGrotesk(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.onSurface),
          titleLarge: GoogleFonts.hankenGrotesk(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.onSurface),
          titleMedium: GoogleFonts.hankenGrotesk(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.onSurface),
          titleSmall: GoogleFonts.hankenGrotesk(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.onSurface),
          bodyLarge: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w400, color: AppColors.onSurface),
          bodyMedium: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w400, color: AppColors.onSurface),
          bodySmall: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.inkSecondary),
          labelLarge: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.onSurface),
          labelMedium: GoogleFonts.jetBrainsMono(fontSize: 12, fontWeight: FontWeight.w500, letterSpacing: 0.05 * 12, color: AppColors.inkSecondary),
          labelSmall: GoogleFonts.jetBrainsMono(fontSize: 10, fontWeight: FontWeight.w500, letterSpacing: 0.05 * 10, color: AppColors.inkSecondary),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
            shape: const StadiumBorder(),
            textStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 15),
          ),
        ),
        cardTheme: CardThemeData(
          color: AppColors.surface,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          margin: EdgeInsets.zero,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.surfaceContainer,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: AppColors.outlineVariant),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: AppColors.outlineVariant),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: AppColors.primaryContainer, width: 2),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: AppColors.primary,
            textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600),
          ),
        ),
      ),
      home: const AuthGateScreen(),
    );
  }
}

/// Auth gate — decides which screen to show based on session + tenant state.
class AuthGateScreen extends ConsumerWidget {
  const AuthGateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionAsync = ref.watch(sessionProvider);

    return sessionAsync.when(
      data: (session) {
        if (session == null) {
          return const LoginScreen();
        }
        // Session exists — check tenant context
        return const _TenantGate();
      },
      loading: () => const _SplashScreen(),
      error: (_, __) => const LoginScreen(),
    );
  }
}

bool get _isDesktop {
  if (kIsWeb) return false;
  return Platform.isMacOS || Platform.isWindows || Platform.isLinux;
}

class _TenantGate extends ConsumerStatefulWidget {
  const _TenantGate();

  @override
  ConsumerState<_TenantGate> createState() => _TenantGateState();
}

class _TenantGateState extends ConsumerState<_TenantGate> {
  // After this many seconds still loading → show dashboard anyway
  static const _maxWaitSeconds = 6;
  bool _forceShow = false;
  Timer? _timer;
  String? _startedTenantId;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(seconds: _maxWaitSeconds), () {
      if (mounted) setState(() => _forceShow = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Widget get _dashboard =>
      _isDesktop ? const DesktopShell() : const DashboardScreen();

  @override
  Widget build(BuildContext context) {
    final tenantAsync = ref.watch(tenantContextProvider);
    // Watch userId — provider resolves null before session is ready on startup.
    // Only treat null ctx as "no business" when we KNOW userId is confirmed.
    final userId = ref.watch(userIdProvider);

    // Resolved — cancel timer, show appropriate screen
    if (tenantAsync.hasValue) {
      final ctx = tenantAsync.value;
      if (ctx == null && userId == null) {
        // tenantProvider resolved null before session loaded — keep waiting
        if (_forceShow) return _dashboard;
        return const _SplashScreen();
      }
      _timer?.cancel();
      if (ctx == null) return const _ContactAdminScreen();
      if (ctx.isTrialExpired) return const _TrialExpiredScreen();

      // One-time-per-tenant: spin up realtime channel + pull-sync local cache.
      if (_startedTenantId != ctx.tenantId) {
        _startedTenantId = ctx.tenantId;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          ref.read(realtimeSyncProvider).start(ctx.tenantId, ref);
          // ignore: unawaited_futures
          ref.read(syncServiceProvider).pullSync();
          // ignore: unawaited_futures
          ref.read(syncServiceProvider).sync();
        });
      }

      return _dashboard;
    }

    if (tenantAsync.hasError) {
      _timer?.cancel();
      return const _ContactAdminScreen();
    }

    // Still loading — show dashboard after timeout, splash before
    if (_forceShow) return _dashboard;
    return const _SplashScreen();
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.canvas,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'LEDGR',
              style: TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.w900,
                letterSpacing: -2,
                color: AppColors.inkPrimary,
              ),
            ),
            SizedBox(height: 24),
            CircularProgressIndicator(color: AppColors.accentSignature, strokeWidth: 2),
          ],
        ),
      ),
    );
  }
}

class _ContactAdminScreen extends StatelessWidget {
  const _ContactAdminScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.info.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(LucideIcons.alertCircle, color: AppColors.info, size: 40),
              ),
              const SizedBox(height: 20),
              const Text(
                'No Business Account',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5),
              ),
              const SizedBox(height: 8),
              const Text(
                'Your account is not linked to a business. Please contact your admin or sign up on the web.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.inkSecondary, fontSize: 14),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () async {
                  await supabase.auth.signOut();
                },
                child: const Text('Sign Out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TrialExpiredScreen extends StatelessWidget {
  const _TrialExpiredScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.warning.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(LucideIcons.clock, color: AppColors.warning, size: 40),
              ),
              const SizedBox(height: 20),
              const Text(
                'Trial Expired',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5),
              ),
              const SizedBox(height: 8),
              const Text(
                'Your free trial has ended. Please upgrade your plan to continue using LedgrPro.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.inkSecondary, fontSize: 14),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () {},
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accentSignature,
                  foregroundColor: Colors.black,
                ),
                child: const Text('Upgrade Now'),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () async {
                  await supabase.auth.signOut();
                },
                child: const Text('Sign Out', style: TextStyle(color: AppColors.inkSecondary)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
