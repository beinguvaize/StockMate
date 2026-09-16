import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/auth/phone_auth.dart';

// These cases are deliberately the same set as src/lib/phoneAuth.test.js on
// the web. Both apps sign in to the same auth server, so a number normalised
// one way here and another way there becomes two accounts for one person —
// and only one of them has a users row. If either side changes, both must.
void main() {
  const canon = '+919876543210';

  group('toE164', () {
    test('maps every plausible spelling of one number onto one string', () {
      const inputs = [
        '9876543210',
        '09876543210',
        '919876543210',
        '+919876543210',
        '+91 98765 43210',
        '+91-98765-43210',
        '(+91) 98765 43210',
        '  9876543210  ',
        '98765 43210',
        '0091 9876543210',
      ];
      expect(inputs.map(toE164).toSet(), {canon});
    });

    test('refuses what cannot be a mobile rather than guessing', () {
      expect(toE164('98765'), isNull);
      expect(toE164('98765432101234'), isNull);
      expect(toE164(''), isNull);
      expect(toE164('   '), isNull);
      expect(toE164(null), isNull);
      expect(toE164('abcdefghij'), isNull);
      expect(toE164('+'), isNull);
    });

    test('rejects Indian landlines and typos', () {
      expect(toE164('1234567890'), isNull);
      expect(toE164('5876543210'), isNull);
      expect(toE164('6876543210'), '+916876543210');
    });

    test('keeps an explicit foreign country code', () {
      expect(toE164('+14155552671'), '+14155552671');
      expect(toE164('+442071838750'), '+442071838750');
      expect(toE164('+971501234567'), '+971501234567');
    });

    test('does not read a 12-digit number as Indian unless it starts with 91', () {
      expect(toE164('449876543210'), isNull);
    });
  });

  group('formatPhone', () {
    test('formats for reading and leaves the rest untouched', () {
      expect(formatPhone(canon), '+91 98765 43210');
      expect(formatPhone('+14155552671'), '+14155552671');
      expect(formatPhone(''), '');
      expect(formatPhone(null), '');
    });
  });

  group('describeOtpError', () {
    test('names the unknown-number case and keeps the cause', () {
      final original = Exception('Signups not allowed for otp');
      final f = describeOtpError(original);
      expect(f.code, 'NOT_REGISTERED');
      expect(f.message, contains('admin'));
      expect(f.cause, same(original));
    });

    test('separates an expired code from a wrong one', () {
      expect(describeOtpError(Exception('Token has expired')).code, 'EXPIRED');
      expect(describeOtpError(Exception('Invalid token')).code, 'BAD_CODE');
    });

    test('flags rate limiting', () {
      expect(describeOtpError(Exception('too many requests')).code, 'RATE_LIMITED');
    });
  });
}
