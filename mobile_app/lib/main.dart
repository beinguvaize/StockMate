import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/database/database.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:mobile_app/features/auth/presentation/login_screen.dart';
import 'package:mobile_app/features/dashboard/presentation/dashboard_screen.dart';

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
      home: const InitializationScreen(),
    );
  }
}

class InitializationScreen extends ConsumerWidget {
  const InitializationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = supabase.auth.currentSession;
    
    if (session == null) {
      return const LoginScreen();
    }
    
    return const DashboardScreen();
  }
}
