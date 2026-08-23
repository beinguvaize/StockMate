import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:mobile_app/core/supabase/client.dart';

/// Phone (WhatsApp OTP) sign-in.
///
/// Mirrors `src/lib/phoneAuth.js` on the web deliberately: both talk to the
/// same auth server, and a number normalised one way here and another way
/// there would become two accounts for one person.
///
/// The account rule that shapes this file: `public.users.id` IS
/// `auth.users.id`, and the app resolves tenant, role and permissions from
/// that id alone. An auth user with no `users` row signs in and then belongs
/// to no business. A phone OTP mints a new uid for an unknown number, so
/// login always passes `shouldCreateUser: false` — an unrecognised number is
/// refused rather than turned into an orphan account. A number is added from
/// Settings while already signed in, which attaches it to the existing uid.
///
/// WhatsApp is the channel because Indian SMS needs TRAI DLT registration.
/// Supabase supports `channel: whatsapp` only on Twilio and Twilio Verify.
const String kDefaultCountryCode = '91';

/// Normalise anything a person might type into E.164 (`+919876543210`).
/// Returns null when the input cannot be a real mobile — guessing here would
/// send someone's login code to a stranger.
String? toE164(String? input, {String countryCode = kDefaultCountryCode}) {
  if (input == null) return null;
  final raw = input.trim();
  if (raw.isEmpty) return null;

  final hadPlus = raw.startsWith('+');
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return null;

  if (hadPlus) {
    return (digits.length >= 8 && digits.length <= 15) ? '+$digits' : null;
  }

  if (digits.startsWith('00')) {
    final rest = digits.substring(2);
    return (rest.length >= 8 && rest.length <= 15) ? '+$rest' : null;
  }

  final local = digits.replaceFirst(RegExp(r'^0+'), '');
  if (local.isEmpty) return null;

  if (local.length == 12 && local.startsWith(countryCode)) return '+$local';

  // Indian mobiles start 6-9. Anything else on 10 digits is a landline or a
  // typo, and neither can receive a WhatsApp message.
  if (local.length == 10) {
    return RegExp(r'^[6-9]').hasMatch(local) ? '+$countryCode$local' : null;
  }

  return null;
}

/// Display only — never used for lookups.
String formatPhone(String? e164) {
  if (e164 == null || !e164.startsWith('+$kDefaultCountryCode')) return e164 ?? '';
  final local = e164.substring(1 + kDefaultCountryCode.length);
  if (local.length != 10) return e164;
  return '+$kDefaultCountryCode ${local.substring(0, 5)} ${local.substring(5)}';
}

/// A failure a shop owner can act on, with the original kept for the log.
class PhoneAuthFailure {
  final String code;
  final String message;
  final Object? cause;
  const PhoneAuthFailure(this.code, this.message, [this.cause]);
}

/// Map a Supabase auth error onto something readable. Never swallows the
/// original — a message the user can read must not cost the reason a
/// developer needs.
PhoneAuthFailure describeOtpError(Object error) {
  final msg = error is AuthException
      ? error.message.toLowerCase()
      : error.toString().toLowerCase();
  final status = error is AuthException ? int.tryParse(error.statusCode ?? '') : null;

  if (msg.contains('signups not allowed') || msg.contains('user not found') || status == 422) {
    return PhoneAuthFailure('NOT_REGISTERED',
        'This number is not on any account yet. Ask your admin to add it in Settings.', error);
  }
  if (msg.contains('expired')) {
    return PhoneAuthFailure('EXPIRED', 'That code has expired. Send a new one.', error);
  }
  if (msg.contains('invalid') || status == 401 || status == 403) {
    return PhoneAuthFailure('BAD_CODE', 'That code is not right. Check WhatsApp and try again.', error);
  }
  if (status == 429 || msg.contains('rate limit') || msg.contains('too many')) {
    return PhoneAuthFailure('RATE_LIMITED', 'Too many attempts. Wait a minute before trying again.', error);
  }
  if (msg.contains('already') && msg.contains('registered')) {
    return PhoneAuthFailure('TAKEN', 'That number is already on another account.', error);
  }
  return PhoneAuthFailure('UNKNOWN',
      error is AuthException ? error.message : 'Could not send the code. Try again.', error);
}

class PhoneAuthService {
  /// Send a login code over WhatsApp. Never creates an account.
  Future<PhoneAuthFailure?> sendLoginOtp(String input) async {
    final phone = toE164(input);
    if (phone == null) {
      return const PhoneAuthFailure('BAD_NUMBER', 'Enter a 10-digit mobile number.');
    }
    try {
      await supabase.auth.signInWithOtp(
        phone: phone,
        channel: OtpChannel.whatsapp,
        shouldCreateUser: false,
      );
      return null;
    } catch (e) {
      return describeOtpError(e);
    }
  }

  /// Verify a login code. `OtpType.sms` is correct for WhatsApp too — the
  /// channel changes delivery, not the OTP type Supabase records.
  Future<PhoneAuthFailure?> verifyLoginOtp(String phone, String token) async {
    final e164 = toE164(phone);
    if (e164 == null) {
      return const PhoneAuthFailure('BAD_NUMBER', 'Enter a 10-digit mobile number.');
    }
    if (!RegExp(r'^\d{4,8}$').hasMatch(token.trim())) {
      return const PhoneAuthFailure('BAD_CODE', 'Enter the code from WhatsApp.');
    }
    try {
      await supabase.auth.verifyOTP(
        phone: e164,
        token: token.trim(),
        type: OtpType.sms,
      );
      return null;
    } catch (e) {
      return describeOtpError(e);
    }
  }
}
