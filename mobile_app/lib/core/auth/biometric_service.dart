import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth_android/local_auth_android.dart';
import 'package:local_auth_darwin/local_auth_darwin.dart';

class BiometricService {
  final LocalAuthentication auth = LocalAuthentication();

  Future<bool> isAvailable() async {
    final bool canAuthenticateWithBiometrics = await auth.canCheckBiometrics;
    final bool canAuthenticate = canAuthenticateWithBiometrics || await auth.isDeviceSupported();
    return canAuthenticate;
  }

  Future<bool> authenticate({String reason = 'Please authenticate to access sensitive data'}) async {
    try {
      final bool didAuthenticate = await auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false, // Allows PIN fallback if biometrics fail
        ),
        authMessages: const <AuthMessages>[
          AndroidAuthMessages(
            signInTitle: 'Ledgr Security',
            fingerprintHint: 'Verify your identity',
          ),
          IOSAuthMessages(
            lockOut: 'Please re-enable Touch ID / Face ID',
          ),
        ],
      );
      return didAuthenticate;
    } on PlatformException catch (e) {
      print('Biometric error: $e');
      return false;
    }
  }
}
