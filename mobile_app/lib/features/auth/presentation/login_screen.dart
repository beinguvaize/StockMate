import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/auth/biometric_service.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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
      reason: 'Unlock LedgrPro with biometrics',
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
      final response = await supabase.auth.signInWithPassword(
        email: email,
        password: pass,
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
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: ${e.toString()}'), backgroundColor: AppColors.danger),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              children: [
                // ── Brand mark (centered, top) ─────────────────────
                Image.asset(
                  'assets/images/logo.png',
                  height: 56,
                  fit: BoxFit.contain,
                ),
                const SizedBox(height: 6),
                Text(
                  'Business Management Suite',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 11,
                    color: AppColors.inkTertiary,
                    letterSpacing: 0.08,
                  ),
                ),
                const SizedBox(height: 40),

                // ── Login card ─────────────────────────────────────
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [AppColors.cardShadow],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Welcome back',
                        style: GoogleFonts.manrope(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Sign in to continue',
                        style: GoogleFonts.manrope(
                          fontSize: 14,
                          color: AppColors.inkTertiary,
                        ),
                      ),
                      const SizedBox(height: 32),

                      // Email field
                      _buildTextField(
                        controller: _emailController,
                        hint: 'Email address',
                        icon: LucideIcons.mail,
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 16),

                      // Password field — with show/hide toggle
                      _buildTextField(
                        controller: _passwordController,
                        hint: 'Password',
                        icon: LucideIcons.lock,
                        obscureText: !_showPassword,
                        suffix: IconButton(
                          icon: Icon(
                            _showPassword ? LucideIcons.eyeOff : LucideIcons.eye,
                            size: 18,
                            color: AppColors.inkTertiary,
                          ),
                          tooltip: _showPassword ? 'Hide password' : 'Show password',
                          onPressed: () => setState(() => _showPassword = !_showPassword),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Remember me
                      Row(
                        children: [
                          Checkbox(
                            value: _rememberMe,
                            onChanged: (v) => setState(() {
                              _rememberMe = v ?? false;
                              // Biometric requires saved creds.
                              if (!_rememberMe) _biometricEnabled = false;
                            }),
                            visualDensity: VisualDensity.compact,
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            activeColor: AppColors.primaryContainer,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _rememberMe = !_rememberMe;
                                if (!_rememberMe) _biometricEnabled = false;
                              }),
                              child: Text(
                                'Remember me on this device',
                                style: GoogleFonts.manrope(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.inkSecondary,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),

                      // Biometric unlock — only meaningful if device supports
                      // it AND Remember me is on (we need saved creds).
                      if (_biometricAvailable)
                        Row(
                          children: [
                            Checkbox(
                              value: _biometricEnabled,
                              onChanged: _rememberMe
                                  ? (v) => setState(() => _biometricEnabled = v ?? false)
                                  : null,
                              visualDensity: VisualDensity.compact,
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              activeColor: AppColors.primaryContainer,
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                _rememberMe
                                    ? 'Unlock with Face ID / fingerprint'
                                    : 'Unlock with Face ID (enable Remember me first)',
                                style: GoogleFonts.manrope(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: _rememberMe
                                      ? AppColors.inkSecondary
                                      : AppColors.inkTertiary,
                                ),
                              ),
                            ),
                          ],
                        ),

                      const SizedBox(height: 20),

                      // Quick biometric trigger — visible when saved creds
                      // exist + user previously enabled biometric unlock.
                      if (_biometricAvailable &&
                          _biometricEnabled &&
                          _emailController.text.isNotEmpty &&
                          _passwordController.text.isNotEmpty) ...[
                        OutlinedButton.icon(
                          onPressed: _isLoading ? null : _tryBiometricUnlock,
                          icon: const Icon(LucideIcons.fingerprint, size: 18),
                          label: const Text('Unlock with biometrics'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primary,
                            side: const BorderSide(color: AppColors.primaryContainer, width: 1.5),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: const StadiumBorder(),
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],

                      // Sign In button
                      SizedBox(
                        height: 52,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _handleLogin,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primaryContainer,
                            foregroundColor: AppColors.inkPrimary,
                            elevation: 0,
                            shape: const StadiumBorder(),
                          ),
                          child: _isLoading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.inkPrimary),
                                )
                              : Text(
                                  'Sign In',
                                  style: GoogleFonts.manrope(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
                        ),
                      ),

                      const SizedBox(height: 20),

                      // OR divider
                      Row(
                        children: [
                          Expanded(
                            child: Divider(
                              color: AppColors.outlineVariant.withValues(alpha: 0.6),
                              thickness: 1,
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text(
                              'or continue with',
                              style: GoogleFonts.jetBrainsMono(
                                fontSize: 11,
                                color: AppColors.inkTertiary,
                              ),
                            ),
                          ),
                          Expanded(
                            child: Divider(
                              color: AppColors.outlineVariant.withValues(alpha: 0.6),
                              thickness: 1,
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      // Google OAuth button
                      SizedBox(
                        height: 52,
                        child: OutlinedButton(
                          onPressed: _isGoogleLoading ? null : _handleGoogleLogin,
                          style: OutlinedButton.styleFrom(
                            backgroundColor: Colors.white,
                            side: const BorderSide(color: AppColors.outlineVariant, width: 1.5),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                            foregroundColor: AppColors.inkPrimary,
                          ),
                          child: _isGoogleLoading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.inkSecondary),
                                )
                              : Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Text(
                                      'G',
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w900,
                                        color: Color(0xFF4285F4),
                                        height: 1.2,
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Text(
                                      'Continue with Google',
                                      style: GoogleFonts.manrope(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 15,
                                        color: AppColors.inkPrimary,
                                      ),
                                    ),
                                  ],
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscureText = false,
    TextInputType? keyboardType,
    Widget? suffix,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      style: GoogleFonts.manrope(fontSize: 14, color: AppColors.inkPrimary),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: GoogleFonts.manrope(fontSize: 14, color: AppColors.inkTertiary),
        prefixIcon: Icon(icon, size: 18, color: AppColors.inkTertiary),
        suffixIcon: suffix,
        filled: true,
        fillColor: AppColors.surfaceContainer,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.primaryContainer, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 16),
      ),
    );
  }
}
