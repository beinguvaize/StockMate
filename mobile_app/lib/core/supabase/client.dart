import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  // PROD — LedgeproProd
  static const String url = 'https://lmviftlynuhopzmvaxeu.supabase.co';
  static const String anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtdmlmdGx5bnVob3B6bXZheGV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDUxMzEsImV4cCI6MjA4ODg4MTEzMX0.DX0HpM6jEYZrRx8Nl8mZxvTjvvMIY2AneJgnkS-e1xA';
  
  static Future<void> initialize() async {
    await Supabase.initialize(
      url: url,
      anonKey: anonKey,
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
      ),
    );
  }
}

final supabase = Supabase.instance.client;

