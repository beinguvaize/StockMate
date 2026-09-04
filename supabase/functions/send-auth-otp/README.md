# send-auth-otp — WhatsApp OTP delivery via Meta Cloud API

Supabase **Send SMS Hook**. Supabase Auth generates the code and calls this
function instead of its own sender; this function posts it to Meta.

Why not Supabase's built-in WhatsApp: that path works **only through Twilio**,
which resells Meta's API at a markup. This goes to Meta directly. Indian SMS is
not an option at all without TRAI DLT registration.

## Order of setup

Each step fails visibly if the one before it was skipped.

1. **Meta app + WhatsApp product.** Note the **Phone number ID** and an
   **access token**. The test number Meta gives you sends free, but only to
   recipients you add to its allowed list — enough to prove the flow, useless
   for customers.

2. **Create an authentication template** and wait for approval. It can be made
   from the console or in one call:

   ```
   curl -X POST "https://graph.facebook.com/v23.0/<WABA_ID>/message_templates" \
     -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
     -d '{
       "name": "login_code",
       "language": "en_US",
       "category": "authentication",
       "components": [
         { "type": "body",   "add_security_recommendation": true },
         { "type": "footer", "code_expiration_minutes": 10 },
         { "type": "buttons",
           "buttons": [ { "type": "otp", "otp_type": "copy_code" } ] }
       ]
     }'
   ```

   **Use `copy_code`, not one-tap or zero-tap.** Those two are Android-only and
   need your package name and app signing hash; copy-code works on iPhone as
   well, and half your users will be on one.

   Note the language is `en_US`, not `en` — Meta treats them as different
   templates and a mismatch comes back as "template does not exist". Whatever
   you create here is what `WHATSAPP_OTP_LANG` must be set to.

   The wording is fixed by Meta: "<code> is your verification code", plus the
   optional security line and expiry warning above. You cannot write your own.

3. **Enable phone auth** in Auth → Providers. The hook replaces the provider's
   sender, so no Twilio credentials are needed. *If the dashboard still insists
   on provider credentials, that is the one thing here worth re-checking.*

4. **Deploy without JWT verification.** The caller is Supabase Auth, not a
   signed-in user; it authenticates with the webhook signature instead.

   ```
   supabase functions deploy send-auth-otp --no-verify-jwt
   ```

5. **Create the hook**: Auth → Hooks → *Send SMS hook* → HTTPS → this
   function's URL → Generate Secret.

6. **Set the secrets:**

   ```
   supabase secrets set \
     SEND_SMS_HOOK_SECRET="v1,whsec_..." \
     WHATSAPP_PHONE_NUMBER_ID="..." \
     WHATSAPP_ACCESS_TOKEN="..." \
     WHATSAPP_OTP_TEMPLATE="login_code" \
     WHATSAPP_OTP_LANG="en_US"
   ```

7. **Link a number before testing.** Login refuses numbers it does not
   recognise (`shouldCreateUser: false`, so an unknown number can never become
   an auth user with no `public.users` row). Sign in by email first, then
   Settings → Account → WhatsApp sign-in. Use **Demo Kirana Store**, not
   FUTURE DISPO.

## Reading failures

The function never reports success for a code that did not leave. Check the
function logs — Meta puts the actionable part in `error.error_data.details`:

| what the log says | what it means |
|---|---|
| `template name does not exist` | name or language does not match step 2 |
| `recipient phone number not in allowed list` | test number, add the recipient |
| `template is paused` | Meta paused it for quality |
| template exists but never arrives | Authentication messages reach only the user's PRIMARY WhatsApp device — a linked desktop shows a prompt to check the phone. Not a fault. |
| `missing secrets: ...` | step 6 incomplete; names the missing ones |
| `Invalid webhook signature` | `SEND_SMS_HOOK_SECRET` does not match the hook |

**Before this is configured**, every send fails at Supabase with
`422 otp_disabled`, which the app shows as *"This number is not on any account
yet."* That string is right once phone auth is on and only the number is
unknown — until then it is misleading, and the console carries the truth.
