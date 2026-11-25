import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_app/core/design/bl_widgets.dart';
import 'package:mobile_app/core/auth/phone_auth.dart';

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
    _codeFocus.dispose();
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

  void _changeNumber() => setState(() {
        _codeSent = false;
        _codeController.clear();
        _error = null;
        _info = null;
      });

  @override
  Widget build(BuildContext context) {
    final canGo = _codeSent
        ? _codeController.text.length >= _codeLength
        : (_canSend && _resendIn <= 0);
    return Scaffold(
      backgroundColor: Bl.white,
      body: SafeArea(
        child: Column(
          children: [
            BlBackHeader(
              onBack: _codeSent && !_busy
                  ? _changeNumber
                  : () => Navigator.of(context).maybePop(),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(22, 6, 22, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: BlEntrance.all([
                    Container(
                      width: 52,
                      height: 52,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                          color: const Color(0xFFE7F8EE),
                          borderRadius: BorderRadius.circular(16)),
                      child: const BlIcon(BlIcons.whatsappLine,
                          size: 24, color: Color(0xFF128C4A)),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(
                          _codeSent ? 'Enter the code' : 'Your WhatsApp number',
                          style: Bl.tight(26,
                              w: FontWeight.w700, ls: -0.03, h: 1.15)),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: _codeSent
                          ? Text.rich(
                              TextSpan(
                                style: Bl.inter(14, h: 1.5),
                                children: [
                                  const TextSpan(text: 'Sent on WhatsApp to '),
                                  TextSpan(
                                      text: formatPhone(_sentTo),
                                      style: Bl.inter(14,
                                          w: FontWeight.w600, c: Bl.ink, h: 1.5)),
                                  const TextSpan(text: ' '),
                                  WidgetSpan(
                                    alignment: PlaceholderAlignment.baseline,
                                    baseline: TextBaseline.alphabetic,
                                    child: BlTap(
                                      label: 'Change number',
                                      onTap: _busy ? null : _changeNumber,
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                            vertical: 6),
                                        child: Text('Change',
                                            style: Bl.inter(14,
                                                w: FontWeight.w600,
                                                c: const Color(0xFFB86A0A),
                                                h: 1.5)),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : Text(
                              'We will send a one-time code to your WhatsApp.',
                              style: Bl.inter(14, h: 1.5)),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 22),
                      child: _codeSent ? _codeBoxes() : _numberField(),
                    ),
                    if (_codeSent)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: BlTap(
                          onTap: (_resendIn > 0 || _busy) ? null : _send,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Text(
                              _resendIn > 0
                                  ? 'Resend code in ${_resendIn}s'
                                  : 'Resend code',
                              style: Bl.inter(13,
                                  w: FontWeight.w500,
                                  c: _resendIn > 0
                                      ? Bl.mute
                                      : const Color(0xFFB86A0A)),
                            ),
                          ),
                        ),
                      ),
                    if (_error != null)
                      _note(_error!, bg: Bl.redSoft, fg: Bl.redDeep)
                    else if (_codeSent)
                      _note(
                          'No code? Check that this number has WhatsApp, then tap Change to fix it.')
                    else if (_info != null)
                      _note(_info!),
                  ]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
              child: BlButton(
                _codeSent ? 'Verify and sign in' : 'Send code',
                loading: _busy,
                onTap: (_busy || !canGo) ? null : (_codeSent ? _verify : _send),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static const _codeLength = 6;
  final _codeFocus = FocusNode();

  Widget _note(String text,
          {Color bg = const Color(0xFFF7F7F6), Color fg = Bl.body}) =>
      Container(
        width: double.infinity,
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
        child: Text(text, style: Bl.inter(12.5, c: fg, h: 1.4)),
      );

  Widget _numberField() => Container(
        height: 58,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: Bl.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Bl.ink, width: 1.5),
        ),
        child: Row(
          children: [
            Text('+91', style: Bl.tight(20, w: FontWeight.w700, c: Bl.mute)),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                autofocus: true,
                inputFormatters: [LengthLimitingTextInputFormatter(15)],
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _send(),
                cursorColor: Bl.brand,
                style: Bl.tight(20, w: FontWeight.w700),
                decoration: InputDecoration(
                  isCollapsed: true,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  filled: false,
                  hintText: '98765 43210',
                  hintStyle: Bl.tight(20, w: FontWeight.w700, c: Bl.faint),
                ),
              ),
            ),
          ],
        ),
      );

  /// Six boxes drawn over one real text field, so paste and the keyboard's
  /// code suggestion both work.
  Widget _codeBoxes() {
    final code = _codeController.text;
    return Semantics(
      textField: true,
      label: 'Code',
      value: code,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => _codeFocus.requestFocus(),
        child: Stack(
          children: [
            Row(
              children: [
                for (var i = 0; i < _codeLength; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child: Container(
                      height: 58,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: i == code.length ? Bl.white : Bl.wellSoft,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                            width: 1.5,
                            color:
                                i == code.length ? Bl.ink : Colors.transparent),
                      ),
                      child: i < code.length
                          ? Text(code[i],
                              style: Bl.tight(24, w: FontWeight.w700, ls: 0))
                          : i == code.length
                              ? Container(
                                  width: 2,
                                  height: 24,
                                  decoration: BoxDecoration(
                                      color: Bl.brand,
                                      borderRadius: BorderRadius.circular(1)),
                                )
                              : null,
                    ),
                  ),
                ],
              ],
            ),
            Positioned.fill(
              child: Opacity(
                opacity: 0,
                child: TextField(
                  controller: _codeController,
                  focusNode: _codeFocus,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  enableInteractiveSelection: false,
                  showCursor: false,
                  maxLength: _codeLength,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _verify(),
                  decoration: const InputDecoration(
                      counterText: '', border: InputBorder.none),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
