import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Auth events as sessions, with a stream ERROR answered by re-reading the
/// session that is actually held.
///
/// gotrue reports a failed token refresh by adding an error to
/// `onAuthStateChange`. That includes the retryable case — no network at the
/// moment the token came due — where it KEEPS the session and tries again ten
/// seconds later. Passing that error through put the provider into an error
/// state, and the auth gate read any error as "signed out": a till that lost
/// signal for longer than a token lives showed the login screen while still
/// signed in, and kept showing it for as long as the signal was gone.
///
/// An error is therefore not an answer to "is there a session". The library's
/// own state is: when a refresh fails for good it removes the session and
/// emits `signedOut`, which arrives here as ordinary data.
Stream<Session?> sessionsFrom(
  Stream<AuthState> changes,
  Session? Function() currentSession,
) {
  return changes.transform(
    StreamTransformer<AuthState, Session?>.fromHandlers(
      handleData: (event, sink) => sink.add(event.session),
      handleError: (error, stack, sink) {
        final held = currentSession();
        debugPrint('[auth] refresh reported an error; '
            'session ${held == null ? 'gone' : 'kept'}: $error');
        sink.add(held);
      },
    ),
  );
}

// Provides the current Supabase session
// Yields currentSession immediately so app never hangs in loading state
final sessionProvider = StreamProvider<Session?>((ref) async* {
  yield supabase.auth.currentSession;
  yield* sessionsFrom(
    supabase.auth.onAuthStateChange,
    () => supabase.auth.currentSession,
  );
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

/// What the Login screen shows for a failed sign-in. A connection failure
/// reaches us as an [AuthRetryableFetchException] whose message is the raw
/// transport error (socket text plus the server URL); never show that.
String loginErrorMessage(AuthException e) {
  if (e is AuthRetryableFetchException) {
    return 'Could not sign in. Check your internet and try again.';
  }
  if (e.message.toLowerCase().contains('invalid login credentials')) {
    return 'Wrong email or password. Please try again.';
  }
  return e.message;
}

/// Runs [action]; if it fails with an error [retryIf] accepts, waits [delay]
/// and runs it once more. The second failure is thrown as is.
Future<T> retryOnce<T>(
  Future<T> Function() action, {
  required bool Function(Object error) retryIf,
  Duration delay = const Duration(seconds: 1),
}) async {
  try {
    return await action();
  } catch (e) {
    if (!retryIf(e)) rethrow;
    await Future<void>.delayed(delay);
    return action();
  }
}
