// A failed token refresh must not read as "signed out".
//
// gotrue reports a refresh failure by adding an ERROR to onAuthStateChange.
// For a retryable failure (no network when the token came due) it keeps the
// session and retries. The auth gate used to show the login screen on any
// error, so a till offline for longer than a token lives was locked out while
// still signed in. sessionsFrom answers an error with the session actually
// held, which is the only thing that says whether the user is signed in.

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/auth/data/auth_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Session _session(String userId) => Session(
      accessToken: 'token-$userId',
      tokenType: 'bearer',
      user: User(
        id: userId,
        appMetadata: const {},
        userMetadata: const {},
        aud: 'authenticated',
        createdAt: '2026-11-23T00:00:00Z',
      ),
    );

void main() {
  test('a refresh error with the session still held keeps the user signed in',
      () async {
    final held = _session('u1');
    final changes = StreamController<AuthState>();
    final seen = <Session?>[];
    Object? leaked;
    final sub = sessionsFrom(changes.stream, () => held)
        .listen(seen.add, onError: (Object e) => leaked = e);

    changes.add(AuthState(AuthChangeEvent.signedIn, held));
    changes.addError(AuthRetryableFetchException());
    changes.addError(AuthRetryableFetchException());
    await pumpEventQueue();

    expect(leaked, isNull, reason: 'the error must not reach the provider');
    expect(seen, [held, held, held]);
    expect(seen.every((s) => s != null), isTrue);

    await sub.cancel();
    await changes.close();
  });

  test('an error after the library dropped the session signs the user out',
      () async {
    Session? held = _session('u1');
    final changes = StreamController<AuthState>();
    final seen = <Session?>[];
    final sub = sessionsFrom(changes.stream, () => held).listen(seen.add);

    changes.add(AuthState(AuthChangeEvent.signedIn, held));
    await pumpEventQueue();
    held = null; // gotrue removed it: the refresh token was rejected
    changes.addError(const AuthException('Session expired.'));
    await pumpEventQueue();

    expect(seen.last, isNull);

    await sub.cancel();
    await changes.close();
  });

  test('ordinary events still pass their session through', () async {
    final a = _session('u1');
    final changes = StreamController<AuthState>();
    final seen = <Session?>[];
    final sub = sessionsFrom(changes.stream, () => a).listen(seen.add);

    changes.add(AuthState(AuthChangeEvent.signedIn, a));
    changes.add(AuthState(AuthChangeEvent.tokenRefreshed, a));
    changes.add(const AuthState(AuthChangeEvent.signedOut, null));
    await pumpEventQueue();

    expect(seen, [a, a, null]);

    await sub.cancel();
    await changes.close();
  });
}
