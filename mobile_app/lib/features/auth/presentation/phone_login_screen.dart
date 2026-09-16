import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_app/core/auth/phone_auth.dart';
import 'package:mobile_app/core/theme/colors.dart';

/// Sign in with a WhatsApp one-time code.
///
/// A separate screen rather than another mode inside the 500-line login screen:
/// this flow has its own two steps and its own back-out, and folding it in
/// would leave both harder to follow.
///
/// Nothing here creates an account — see [PhoneAuthService.sendLoginOtp]. A
/// number that is not already on an account is refused, and the message points
/// the user at the admin who can add it.
class PhoneLoginScreen extends StatefulWidget {
  const PhoneLoginScreen({super.key});

  @override
  State<PhoneLoginScreen> createState() => _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends State<PhoneLoginScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  final _service = PhoneAuthService();

  bool _codeSent = false;
  bool _busy = false;
  String? _error;
  String? _info;
  String _sentTo = '';

  // Supabase rate-limits OTP sends. Counting down is kinder than letting
  // someone press Send four times and then be told they are locked out.
  int _resendIn = 0;
  Timer? _resendTimer;

  @override
  void dispose() {
    _resendTimer?.cancel();
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  void _startResendCountdown() {
    _resendTimer?.cancel();
    setState(() => _resendIn = 60);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() => _resendIn -= 1);
      if (_resendIn <= 0) t.cancel();
    });
  }

  Future<void> _send() async {
    if (_busy || _resendIn > 0) return;
    setState(() { _busy = true; _error = null; _info = null; });

    final failure = await _service.sendLoginOtp(_phoneController.text);
    if (!mounted) return;

    if (failure != null) {
      // The readable message goes on screen; the real reason goes to the log.
      debugPrint('[phone-login] send failed: ${failure.code} ${failure.cause}');
      setState(() { _busy = false; _error = failure.message; });
      return;
    }

    final phone = toE164(_phoneController.text)!;
    setState(() {
      _busy = false;
      _codeSent = true;
      _sentTo = phone;
      _info = 'Code sent on WhatsApp to ${formatPhone(phone)}';
    });
    _startResendCountdown();
  }

  Future<void> _verify() async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });

    final failure = await _service.verifyLoginOtp(
      _sentTo.isNotEmpty ? _sentTo : _phoneController.text,
      _codeController.text,
    );
    if (!mounted) return;

    if (failure != null) {
      debugPrint('[phone-login] verify failed: ${failure.code} ${failure.cause}');
      setState(() { _busy = false; _error = failure.message; });
      return;
    }

    // The session is on the client now; sessionProvider streams the change and
    // the app's root routes on it. Just get out of the way.
    setState(() => _busy = false);
    if (mounted) Navigator.of(context).pop();
  }

  bool get _canSend => toE164(_phoneController.text) != null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        backgroundColor: AppColors.canvas,
        elevation: 0,
        foregroundColor: AppColors.inkPrimary,
        title: Text('Sign in with WhatsApp',
            style: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 17)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _codeSent
                    ? 'Enter the code sent to ${formatPhone(_sentTo)}'
                    : 'We will send a one-time code to your WhatsApp.',
                style: GoogleFonts.manrope(fontSize: 14, color: AppColors.inkSecondary),
              ),
              const SizedBox(height: 24),

              if (!_codeSent) ...[
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  autofocus: true,
                  inputFormatters: [LengthLimitingTextInputFormatter(15)],
                  onChanged: (_) => setState(() {}),
                  style: GoogleFonts.manrope(fontSize: 15, color: AppColors.inkPrimary),
                  decoration: InputDecoration(
                    // The country code is shown, not typed — every user is in
                    // India and a free-text +91 is one more thing to mistype.
                    prefixText: '+91  ',
                    prefixStyle: GoogleFonts.manrope(fontSize: 15, color: AppColors.inkSecondary),
                    hintText: '98765 43210',
                    labelText: 'Mobile number',
                    border: const OutlineInputBorder(),
                  ),
                ),
              ] else ...[
                TextField(
                  controller: _codeController,
                  keyboardType: TextInputType.number,
                  autofocus: true,
                  textAlign: TextAlign.center,
                  maxLength: 8,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (_) => setState(() {}),
                  style: GoogleFonts.manrope(
                      fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.w700,
                      color: AppColors.inkPrimary),
                  decoration: const InputDecoration(
                    hintText: '000000',
                    counterText: '',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                                _codeSent = false;
                                _codeController.clear();
                                _error = null;
                                _info = null;
                              }),
                      child: const Text('Change number'),
                    ),
                    TextButton(
                      onPressed: (_resendIn > 0 || _busy) ? null : _send,
                      child: Text(_resendIn > 0 ? 'Resend in ${_resendIn}s' : 'Resend code'),
                    ),
                  ],
                ),
              ],

              if (_info != null && _error == null) ...[
                const SizedBox(height: 8),
                Text(_info!, style: GoogleFonts.manrope(fontSize: 13, color: AppColors.inkSecondary)),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(_error!,
                      style: GoogleFonts.manrope(fontSize: 13, color: AppColors.danger)),
                ),
              ],

              const SizedBox(height: 24),
              SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: _busy || (!_codeSent && !_canSend) ? null : (_codeSent ? _verify : _send),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryContainer,
                    foregroundColor: AppColors.inkPrimary,
                    elevation: 0,
                    shape: const StadiumBorder(),
                  ),
                  child: _busy
                      ? const SizedBox(
                          height: 20, width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.inkPrimary))
                      : Text(_codeSent ? 'Verify & sign in' : 'Send code',
                          style: GoogleFonts.manrope(fontWeight: FontWeight.w700, fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
