import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:mobile_app/features/auth/data/auth_provider.dart';

void main() {
  test('a dropped connection never shows the raw transport error', () {
    final msg = loginErrorMessage(AuthRetryableFetchException(
      message:
          'ClientException: Software caused connection abort, uri=https://x.supabase.co/auth/v1/token?grant_type=password',
    ));
    expect(msg, 'Could not sign in. Check your internet and try again.');
    expect(msg.contains('supabase'), isFalse);
  });

  test('wrong password keeps its own message', () {
    expect(
      loginErrorMessage(const AuthException('Invalid login credentials')),
      'Wrong email or password. Please try again.',
    );
  });

  test('other server answers are shown as given', () {
    expect(loginErrorMessage(const AuthException('Email not confirmed')),
        'Email not confirmed');
  });

  test('retryOnce repeats a retryable failure once and succeeds', () async {
    var calls = 0;
    final out = await retryOnce<int>(() async {
      calls++;
      if (calls == 1) throw AuthRetryableFetchException(message: 'abort');
      return 7;
    }, retryIf: (e) => e is AuthRetryableFetchException, delay: Duration.zero);
    expect(out, 7);
    expect(calls, 2);
  });

  test('retryOnce does not repeat a wrong password', () async {
    var calls = 0;
    await expectLater(
      retryOnce<int>(() async {
        calls++;
        throw const AuthException('Invalid login credentials');
      }, retryIf: (e) => e is AuthRetryableFetchException, delay: Duration.zero),
      throwsA(isA<AuthException>()),
    );
    expect(calls, 1);
  });

  test('retryOnce gives up after the second failure', () async {
    var calls = 0;
    await expectLater(
      retryOnce<int>(() async {
        calls++;
        throw AuthRetryableFetchException(message: 'abort');
      }, retryIf: (e) => e is AuthRetryableFetchException, delay: Duration.zero),
      throwsA(isA<AuthRetryableFetchException>()),
    );
    expect(calls, 2);
  });
}
