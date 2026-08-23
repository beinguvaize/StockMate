import { supabase } from './supabase';

/**
 * Phone (WhatsApp OTP) sign-in.
 *
 * The account model is the reason most of this file exists. `public.users.id`
 * IS `auth.users.id` — the app finds a signed-in person's tenant, role and
 * permissions by that id and nothing else. So an auth user with no `users` row
 * is not a partial account, it is a locked-out one: it signs in fine and then
 * has no business to belong to. There is one of those in production already.
 *
 * A phone OTP mints a NEW auth uid when the number is unknown, which would
 * manufacture that state on every signup. Two rules prevent it:
 *
 *   1. LOGIN NEVER CREATES. `shouldCreateUser: false` on every login send, so
 *      an unrecognised number is refused instead of silently becoming an
 *      orphan account.
 *   2. A NUMBER IS ADDED WHILE SIGNED IN. `linkPhone` attaches the phone to the
 *      EXISTING uid via updateUser + a `phone_change` verify, so the person
 *      keeps their row, tenant and history and simply gains a second way in.
 *
 * WhatsApp is the channel because Indian SMS needs TRAI DLT registration.
 * Supabase only supports `channel: 'whatsapp'` on the Twilio and Twilio Verify
 * providers — it is silently ignored elsewhere, which would send a plain SMS
 * (and fail, undelivered, with no error) on any other provider.
 */

/** Default country. India — every current user is here. */
export const DEFAULT_COUNTRY_CODE = '91';

/**
 * Normalise anything a person might type into E.164 (`+919876543210`).
 *
 * Supabase matches the stored number as an exact string, so `9876543210` and
 * `+91 98765 43210` must not become two different accounts. Returns null when
 * the input cannot be a real number rather than guessing — a wrong guess sends
 * someone else's OTP to a stranger.
 */
export const toE164 = (input, countryCode = DEFAULT_COUNTRY_CODE) => {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Keep a leading + as the "already international" signal, then strip
  // everything that is not a digit: spaces, dashes, brackets, dots.
  const hadPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (hadPlus) {
    // Trust an explicit country code, but a plausible number is still 8-15
    // digits (E.164's own limit).
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // 00 is the other international prefix, common on printed cards.
  if (digits.startsWith('00')) {
    const rest = digits.slice(2);
    return rest.length >= 8 && rest.length <= 15 ? `+${rest}` : null;
  }

  // A local Indian number, possibly with the STD trunk 0 in front.
  const local = digits.replace(/^0+/, '');
  if (!local) return null;

  // Already carries the country code: 919876543210.
  if (local.length === 12 && local.startsWith(countryCode)) return `+${local}`;

  // Bare 10-digit mobile. Indian mobiles start 6-9; a number starting 0-5 is a
  // landline or a typo, and neither can receive a WhatsApp OTP.
  if (local.length === 10) {
    return /^[6-9]/.test(local) ? `+${countryCode}${local}` : null;
  }

  return null;
};

/** Format for display: +91 98765 43210. Never used for lookups. */
export const formatPhone = (e164) => {
  if (!e164?.startsWith(`+${DEFAULT_COUNTRY_CODE}`)) return e164 || '';
  const local = e164.slice(1 + DEFAULT_COUNTRY_CODE.length);
  if (local.length !== 10) return e164;
  return `+${DEFAULT_COUNTRY_CODE} ${local.slice(0, 5)} ${local.slice(5)}`;
};

/** Mask for confirmation screens: +91 98765 •••10 */
export const maskPhone = (e164) => {
  if (!e164) return '';
  const d = e164.replace(/\D/g, '');
  if (d.length < 4) return e164;
  return `${e164.slice(0, e164.length - 5)}•••${e164.slice(-2)}`;
};

/**
 * Send a login OTP over WhatsApp.
 *
 * Never creates an account. An unknown number comes back as NOT_REGISTERED so
 * the screen can say "ask your admin to add this number" instead of dumping a
 * raw Supabase string at a shop owner.
 */
export const sendLoginOtp = async (input) => {
  const phone = toE164(input);
  if (!phone) return { error: { code: 'BAD_NUMBER', message: 'Enter a 10-digit mobile number.' } };

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { channel: 'whatsapp', shouldCreateUser: false },
  });

  if (error) return { error: describeOtpError(error), phone };
  return { phone };
};

/** Verify a login OTP. On success the session is the user's existing uid. */
export const verifyLoginOtp = async (phone, token) => {
  const e164 = toE164(phone);
  if (!e164) return { error: { code: 'BAD_NUMBER', message: 'Enter a 10-digit mobile number.' } };
  if (!/^\d{4,8}$/.test(String(token || '').trim())) {
    return { error: { code: 'BAD_CODE', message: 'Enter the code from WhatsApp.' } };
  }

  // `type: 'sms'` is correct for WhatsApp too — the channel changes delivery,
  // not the OTP type Supabase records.
  const { data, error } = await supabase.auth.verifyOtp({
    phone: e164,
    token: String(token).trim(),
    type: 'sms',
  });

  if (error) return { error: describeOtpError(error) };
  return { session: data?.session ?? null, user: data?.user ?? null };
};

/**
 * Step 1 of adding a number to the account you are already signed in to.
 * Sends a confirmation code to the NEW number.
 */
export const linkPhone = async (input) => {
  const phone = toE164(input);
  if (!phone) return { error: { code: 'BAD_NUMBER', message: 'Enter a 10-digit mobile number.' } };

  const { error } = await supabase.auth.updateUser({ phone }, { channel: 'whatsapp' });
  if (error) return { error: describeOtpError(error), phone };
  return { phone };
};

/**
 * Step 2 of linking. `phone_change` is what keeps the existing uid — verifying
 * with type 'sms' here would try to sign in as a different account instead.
 */
export const confirmPhoneLink = async (phone, token) => {
  const e164 = toE164(phone);
  if (!e164) return { error: { code: 'BAD_NUMBER', message: 'Enter a 10-digit mobile number.' } };

  const { data, error } = await supabase.auth.verifyOtp({
    phone: e164,
    token: String(token || '').trim(),
    type: 'phone_change',
  });

  if (error) return { error: describeOtpError(error) };
  return { user: data?.user ?? null, phone: e164 };
};

/**
 * Turn a Supabase auth error into something a shop owner can act on.
 * Keeps the original on `cause` so a real failure is still debuggable —
 * swallowing the reason is how a days-long outage stayed invisible once.
 */
export const describeOtpError = (error) => {
  const msg = (error?.message || '').toLowerCase();
  const status = error?.status;

  if (msg.includes('signups not allowed') || msg.includes('user not found') || status === 422) {
    return {
      code: 'NOT_REGISTERED',
      message: 'This number is not on any account yet. Ask your admin to add it in Settings.',
      cause: error,
    };
  }
  if (msg.includes('expired')) {
    return { code: 'EXPIRED', message: 'That code has expired. Send a new one.', cause: error };
  }
  if (msg.includes('invalid') || status === 401 || status === 403) {
    return { code: 'BAD_CODE', message: 'That code is not right. Check WhatsApp and try again.', cause: error };
  }
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return { code: 'RATE_LIMITED', message: 'Too many attempts. Wait a minute before trying again.', cause: error };
  }
  if (msg.includes('already') && msg.includes('registered')) {
    return { code: 'TAKEN', message: 'That number is already on another account.', cause: error };
  }
  return {
    code: 'UNKNOWN',
    message: error?.message || 'Could not send the code. Try again.',
    cause: error,
  };
};
