import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// Provides the current Supabase session
// Yields currentSession immediately so app never hangs in loading state
final sessionProvider = StreamProvider<Session?>((ref) async* {
  yield supabase.auth.currentSession;
  yield* supabase.auth.onAuthStateChange.map((event) => event.session);
});

// Provides the current user
final userProvider = Provider<User?>((ref) {
  return ref.watch(sessionProvider).value?.user;
});

// A simple auth service provider for login/logout actions
final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService();
});

class AuthService {
  Future<AuthResponse> signIn(String email, String password) async {
    return await supabase.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }

  Future<void> signOut() async {
    await supabase.auth.signOut();
  }
}
