import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/auth/tenant_provider.dart';
import 'package:mobile_app/core/database/database.dart';
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

  await SupabaseConfig.initialize();

  final container = ProviderContainer();
  // Trigger initial background sync
  container.read(syncServiceProvider).sync();
  container.read(syncServiceProvider).pullSync();

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const LedgrApp(),
    ),
  );
}

class LedgrApp extends StatelessWidget {
  const LedgrApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ledgr ERP',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.accentSignature,
          primary: AppColors.inkPrimary,
          surface: AppColors.surface,
          background: AppColors.canvas,
        ),
        useMaterial3: true,
        textTheme: GoogleFonts.interTextTheme(
          Theme.of(context).textTheme,
        ).copyWith(
          displayLarge: GoogleFonts.sora(textStyle: Theme.of(context).textTheme.displayLarge),
          displayMedium: GoogleFonts.sora(textStyle: Theme.of(context).textTheme.displayMedium),
          displaySmall: GoogleFonts.sora(textStyle: Theme.of(context).textTheme.displaySmall),
          headlineLarge: GoogleFonts.sora(textStyle: Theme.of(context).textTheme.headlineLarge),
          headlineMedium: GoogleFonts.sora(textStyle: Theme.of(context).textTheme.headlineMedium),
          headlineSmall: GoogleFonts.sora(textStyle: Theme.of(context).textTheme.headlineSmall),
          titleLarge: GoogleFonts.sora(textStyle: Theme.of(context).textTheme.titleLarge),
          titleMedium: GoogleFonts.sora(textStyle: Theme.of(context).textTheme.titleMedium),
          titleSmall: GoogleFonts.sora(textStyle: Theme.of(context).textTheme.titleSmall),
        ).apply(
          bodyColor: AppColors.inkPrimary,
          displayColor: AppColors.inkPrimary,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.accentSignature,
            foregroundColor: AppColors.inkPrimary,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
            textStyle: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: -0.5),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: AppColors.inkPrimary,
            textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600),
          ),
        ),
        scaffoldBackgroundColor: AppColors.canvas,
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

class _TenantGate extends ConsumerWidget {
  const _TenantGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantAsync = ref.watch(tenantContextProvider);

    return tenantAsync.when(
      data: (ctx) {
        if (ctx == null) {
          return const _ContactAdminScreen();
        }
        if (ctx.isTrialExpired) {
          return const _TrialExpiredScreen();
        }
        // Use desktop shell on macOS/Windows/Linux, mobile bottom-nav otherwise
        if (_isDesktop) {
          return const DesktopShell();
        }
        return const DashboardScreen();
      },
      loading: () => const _SplashScreen(),
      error: (_, __) => const _ContactAdminScreen(),
    );
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
