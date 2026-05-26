import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:mobile_app/core/supabase/client.dart';
import 'package:mobile_app/core/theme/colors.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// Keystore-backed credential storage for the "Remember me" feature.
const _secureStore = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);
const _kRememberEmail = 'ledgr.remember.email';
const _kRememberPass  = 'ledgr.remember.password';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _showPassword = false;
  bool _isGoogleLoading = false;
  bool _rememberMe = false;

  @override
  void initState() {
    super.initState();
    _restoreRemembered();
  }

  Future<void> _restoreRemembered() async {
    try {
      final email = await _secureStore.read(key: _kRememberEmail);
      final pass  = await _secureStore.read(key: _kRememberPass);
      if (!mounted) return;
      if (email != null && email.isNotEmpty) {
        _emailController.text = email;
        if (pass != null && pass.isNotEmpty) {
          _passwordController.text = pass;
          setState(() => _rememberMe = true);
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
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // ── Brand mark ─────────────────────────────────────
                Text(
                  'LedgrPro',
                  style: GoogleFonts.hankenGrotesk(
                    fontSize: 40,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary,
                    letterSpacing: -1,
                  ),
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
                        style: GoogleFonts.hankenGrotesk(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: AppColors.inkPrimary,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Sign in to continue',
                        style: GoogleFonts.inter(
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
                            onChanged: (v) => setState(() => _rememberMe = v ?? false),
                            visualDensity: VisualDensity.compact,
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            activeColor: AppColors.primaryContainer,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() => _rememberMe = !_rememberMe),
                              child: Text(
                                'Remember me on this device',
                                style: GoogleFonts.inter(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.inkSecondary,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

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
                                  style: GoogleFonts.inter(
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
                                      style: GoogleFonts.inter(
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
      style: GoogleFonts.inter(fontSize: 14, color: AppColors.inkPrimary),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: GoogleFonts.inter(fontSize: 14, color: AppColors.inkTertiary),
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
