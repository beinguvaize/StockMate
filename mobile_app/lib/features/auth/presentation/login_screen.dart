import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/auth/biometric_service.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/features/auth/data/auth_provider.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:mobile_app/features/auth/presentation/phone_login_screen.dart';

// Keystore-backed credential storage for the "Remember me" + biometric
// unlock features. Both rely on the device hardware-backed keystore so the
// stored password never leaves the secure enclave in plaintext.
const _secureStore = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);
const _kRememberEmail   = 'ledgr.remember.email';
const _kRememberPass    = 'ledgr.remember.password';
const _kBiometricUnlock = 'ledgr.biometric.enabled';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  // Android has fingerprint; Face ID is Apple's name.
  static String get _bioName => Platform.isAndroid ? 'fingerprint' : 'Face ID';

  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _biometric = BiometricService();
  bool _isLoading = false;
  bool _showPassword = false;
  bool _isGoogleLoading = false;
  bool _rememberMe = false;
  bool _biometricEnabled = false;       // user opted-in for biometric unlock
  bool _biometricAvailable = false;     // device + enrolment supports it
  bool _biometricPromptShown = false;   // only auto-prompt once per screen mount

  @override
  void initState() {
    super.initState();
    _restoreRemembered();
    _initBiometric();
  }

  Future<void> _initBiometric() async {
    final available = await _biometric.isAvailable();
    if (!mounted) return;
    setState(() => _biometricAvailable = available);
    // Auto-prompt only if: device supports biometrics, user previously
    // enabled the feature, creds are stored, and we haven't prompted yet.
    if (!_biometricPromptShown &&
        available &&
        _biometricEnabled &&
        _emailController.text.isNotEmpty &&
        _passwordController.text.isNotEmpty) {
      _biometricPromptShown = true;
      // Defer one frame so the UI is visible behind the prompt.
      WidgetsBinding.instance.addPostFrameCallback((_) => _tryBiometricUnlock());
    }
  }

  Future<void> _tryBiometricUnlock() async {
    if (!_biometricAvailable) return;
    final ok = await _biometric.authenticate(
      reason: 'Unlock bookledger with biometrics',
    );
    if (!mounted || !ok) return;
    await _handleLogin();
  }

  Future<void> _restoreRemembered() async {
    try {
      final email = await _secureStore.read(key: _kRememberEmail);
      final pass  = await _secureStore.read(key: _kRememberPass);
      final bio   = await _secureStore.read(key: _kBiometricUnlock);
      if (!mounted) return;
      if (email != null && email.isNotEmpty) {
        _emailController.text = email;
        if (pass != null && pass.isNotEmpty) {
          _passwordController.text = pass;
          setState(() {
            _rememberMe = true;
            _biometricEnabled = bio == '1';
          });
        }
      }
    } catch (_) {/* ignore — first install or platform refuses */}
  }

  Future<void> _persistRemembered(String email, String password) async {
    try {
      if (_rememberMe) {
        await _secureStore.write(key: _kRememberEmail, value: email);
        await _secureStore.write(key: _kRememberPass,  value: password);
      } else {
        await _secureStore.delete(key: _kRememberEmail);
        await _secureStore.delete(key: _kRememberPass);
      }
      // Biometric unlock only makes sense when Remember me is on (we need
      // saved creds to auto-call signInWithPassword after the prompt).
      if (_rememberMe && _biometricEnabled) {
        await _secureStore.write(key: _kBiometricUnlock, value: '1');
      } else {
        await _secureStore.delete(key: _kBiometricUnlock);
      }
    } catch (_) {/* ignore */}
  }

  Future<void> _handleLogin() async {
    setState(() => _isLoading = true);
    final email = _emailController.text.trim();
    final pass  = _passwordController.text.trim();
    try {
      // Timeout guard: on a weak connection the auth request can stall
      // forever, leaving the button spinning with no feedback. Fail fast
      // with a clear retry message instead.
      // A dropped connection (network switch, weak signal) surfaces as a
      // retryable failure. Sign-in is safe to repeat, so try once more
      // before bothering the user.
      final response = await retryOnce(
        () => supabase.auth
            .signInWithPassword(email: email, password: pass)
            .timeout(const Duration(seconds: 20)),
        retryIf: (e) => e is AuthRetryableFetchException,
      );

      if (response.session != null) {
        await _persistRemembered(email, pass);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Login Successful')),
          );
          // AuthGateScreen (via sessionProvider stream) will handle navigation automatically
        }
      }
    } on TimeoutException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Slow or no internet. Please check your connection and try again.'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } on AuthException catch (e) {
      debugPrint('[login] failed: $e');
      if (mounted) {
        final msg = loginErrorMessage(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppColors.danger),
        );
      }
    } catch (e) {
      debugPrint('[login] failed: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not sign in. Check your internet and try again.'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleGoogleLogin() async {
    setState(() => _isGoogleLoading = true);
    try {
      await supabase.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: 'com.ledgrpro.app://login-callback',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Google sign-in error: ${e.toString()}'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isGoogleLoading = false);
    }
  }

  void _toggleRemember() => setState(() {
        _rememberMe = !_rememberMe;
        if (!_rememberMe) _biometricEnabled = false;
      });

  bool get _canUnlockNow =>
      _biometricEnabled &&
      _emailController.text.isNotEmpty &&
      _passwordController.text.isNotEmpty;

  /// "Unlock with fingerprint". With saved sign-in details it unlocks now;
  /// without them it switches the option on for the next sign-in.
  void _onBiometricLink() {
    if (_canUnlockNow) {
      _tryBiometricUnlock();
      return;
    }
    setState(() {
      _rememberMe = true;
      _biometricEnabled = true;
    });
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(
          'Sign in once with your password. After that you can unlock with $_bioName.'),
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final busy = _isLoading || _isGoogleLoading;
    return Scaffold(
      backgroundColor: Bl.dark,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Stack(
          children: [
            // Photo runs under the status bar and fades into the dark ground.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 250 + mq.viewPadding.top,
              child: const Image(
                image: AssetImage('assets/images/login_photo.jpg'),
                fit: BoxFit.cover,
                semanticLabel:
                    'A shopkeeper ringing up a sale on a tablet at the counter',
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 251 + mq.viewPadding.top,
              child: const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: [0, 0.45, 1],
                    colors: [Color(0x400C0C0D), Color(0x1A0C0C0D), Bl.dark],
                  ),
                ),
              ),
            ),
            SafeArea(
              child: LayoutBuilder(
                builder: (context, box) => SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: box.maxHeight - 12),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 120),
                        const Align(
                          alignment: Alignment.centerLeft,
                          child: Image(
                            image: AssetImage(
                                'assets/images/logo_linear_white.png'),
                            width: 150,
                            semanticLabel: 'bookledger',
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text('Sign in',
                            style: Bl.tight(28,
                                w: FontWeight.w800, c: Bl.white, ls: -0.035)),
                        const SizedBox(height: 2),
                        Text('Welcome back to bookledger',
                            style: Bl.inter(13.5, c: Bl.faint)),
                        const SizedBox(height: 14),
                        _darkField(
                          controller: _emailController,
                          hint: 'Email address',
                          keyboardType: TextInputType.emailAddress,
                          autofill: const [AutofillHints.email],
                        ),
                        const SizedBox(height: 8),
                        _darkField(
                          controller: _passwordController,
                          hint: 'Password',
                          obscure: !_showPassword,
                          autofill: const [AutofillHints.password],
                          onSubmitted: busy ? null : (_) => _handleLogin(),
                          suffix: BlTap(
                            label:
                                _showPassword ? 'Hide password' : 'Show password',
                            onTap: () =>
                                setState(() => _showPassword = !_showPassword),
                            child: SizedBox(
                              width: 44,
                              height: 44,
                              child: Center(
                                child: BlIcon(
                                    _showPassword
                                        ? BlIcons.eyeOff
                                        : BlIcons.eye,
                                    size: 16,
                                    color: const Color(0xFFD5D8DC)),
                              ),
                            ),
                          ),
                        ),
                        Semantics(
                          checked: _rememberMe,
                          label: 'Remember me on this device',
                          excludeSemantics: true,
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: _toggleRemember,
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(2, 12, 2, 12),
                              child: Row(
                                children: [
                                  Container(
                                    width: 20,
                                    height: 20,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: _rememberMe
                                          ? Bl.amber
                                          : Colors.transparent,
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(
                                          width: 1.5,
                                          color: _rememberMe
                                              ? Bl.amber
                                              : const Color(0xFFC4C8CC)),
                                    ),
                                    child: _rememberMe
                                        ? const BlIcon(BlIcons.check,
                                            size: 13, color: Bl.white, stroke: 3)
                                        : null,
                                  ),
                                  const SizedBox(width: 10),
                                  Text('Remember me on this device',
                                      style: Bl.inter(13,
                                          w: FontWeight.w500, c: Bl.white)),
                                ],
                              ),
                            ),
                          ),
                        ),
                        BlButton('Sign in',
                            loading: _isLoading,
                            onTap: busy ? null : _handleLogin),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(4, 10, 4, 10),
                          child: Row(
                            children: [
                              const Expanded(
                                  child: ColoredBox(
                                      color: Color(0x2EFFFFFF),
                                      child: SizedBox(height: 1))),
                              Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 12),
                                child: Text('or continue with',
                                    style: Bl.inter(12,
                                        c: const Color(0xFF9AA0A6))),
                              ),
                              const Expanded(
                                  child: ColoredBox(
                                      color: Color(0x2EFFFFFF),
                                      child: SizedBox(height: 1))),
                            ],
                          ),
                        ),
                        Row(
                          children: [
                            Expanded(
                              child: BlButton('Google',
                                  kind: BlButtonKind.white,
                                  height: 44,
                                  fontSize: 14,
                                  loading: _isGoogleLoading,
                                  leading: const BlMark(BlIcons.googleColor,
                                      label: ''),
                                  onTap: busy ? null : _handleGoogleLogin),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: BlButton('WhatsApp',
                                  kind: BlButtonKind.white,
                                  height: 44,
                                  fontSize: 14,
                                  leading: const BlMark(BlIcons.whatsappColor,
                                      label: ''),
                                  onTap: busy
                                      ? null
                                      : () => Navigator.of(context).push(
                                            MaterialPageRoute(
                                                builder: (_) =>
                                                    const PhoneLoginScreen()),
                                          )),
                            ),
                          ],
                        ),
                        if (_biometricAvailable)
                          BlTap(
                            label: 'Unlock with $_bioName',
                            onTap: busy ? null : _onBiometricLink,
                            child: SizedBox(
                              height: 44,
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const BlIcon(BlIcons.fingerprint,
                                      size: 16, color: Color(0xFFF6B964)),
                                  const SizedBox(width: 8),
                                  Text('Unlock with $_bioName',
                                      style: Bl.tight(13,
                                          w: FontWeight.w600,
                                          c: const Color(0xFFF6B964))),
                                ],
                              ),
                            ),
                          )
                        else
                          const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _darkField({
    required TextEditingController controller,
    required String hint,
    bool obscure = false,
    TextInputType? keyboardType,
    Widget? suffix,
    List<String>? autofill,
    ValueChanged<String>? onSubmitted,
  }) {
    return Container(
      height: 46,
      padding: EdgeInsets.only(left: 14, right: suffix == null ? 14 : 0),
      decoration: BoxDecoration(
        color: const Color(0x1AFFFFFF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0x33FFFFFF)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              obscureText: obscure,
              keyboardType: keyboardType,
              autofillHints: autofill,
              autocorrect: false,
              enableSuggestions: false,
              onSubmitted: onSubmitted,
              cursorColor: Bl.brand,
              style: Bl.inter(14, w: FontWeight.w500, c: Bl.white),
              decoration: InputDecoration(
                isCollapsed: true,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                hintText: hint,
                hintStyle: Bl.inter(14,
                    w: FontWeight.w500, c: const Color(0xFFD5D8DC)),
              ),
            ),
          ),
          ?suffix,
        ],
      ),
    );
  }
}
