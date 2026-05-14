import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// Provides the current Supabase session
// Yields currentSession immediately so app never hangs in loading state
final sessionProvider = StreamProvider<Session?>((ref) async* {
  yield supabase.auth.currentSession;
  yield* supabase.auth.onAuthStateChange.map((event) => event.session);
});

// Stable user ID provider — only changes when user signs in/out.
// Using a separate provider avoids recomputing tenant data on every
// token-refresh event that creates a new Session/User object.
final userIdProvider = Provider<String?>((ref) {
  return ref.watch(sessionProvider).value?.user.id;
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
