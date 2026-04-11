import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  static const String url = 'https://tiywdsbaymrnqmlkxupj.supabase.co';
  static const String anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeXdkc2JheW1ybnFtbGt4dXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0Mjk1NDAsImV4cCI6MjA4OTAwNTU0MH0.1VvvVoGG44YUHZ3_evzIgaOEpHP0baFH3YyPA4MrjyY';
  
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

