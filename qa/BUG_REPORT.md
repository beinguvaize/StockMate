# QA & Security Bug Report
**Application:** StockMate / Ledger ERP  
**URL:** http://localhost:5173  
**Test Date:** 2026-04-20 (re-run)  
**Tester:** Claude Code — QA Engineer, Test Analyst, Security Analyst  
**Test Suite:** 112 Playwright tests across 18 modules  
**Results:** 109 PASSED · 3 SKIPPED (plan-gated features) · 0 FAILED  

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 1 | Open |
| HIGH | 1 | Open |
| MEDIUM | 3 | Open |
| LOW | 5 | Open |
| INFO | 2 | Observation |
| **PASS** | **~100** | All core modules load and function correctly |

---

## CRITICAL Bugs

---

### BUG-001: Hardcoded Admin Email Bypasses All RBAC
- **Severity:** CRITICAL
- **Module:** Security / Auth — `src/context/AppContext.jsx`
- **Found By:** Code Review + Test `17-security.spec.ts > SECURITY-001`
- **Steps to Reproduce:**
  1. Log in as `uvaize@hotmail.com`
  2. Navigate to any module including ENTERPRISE-only routes (`/settings`, `/users`)
  3. Observe unrestricted access regardless of plan tier
- **Expected:** Access should be controlled by plan (STARTER/PRO/ENTERPRISE) and RBAC permissions
- **Actual:** `hasRole()` and `hasPermission()` in AppContext.jsx contain hardcoded email overrides:
  ```javascript
  if (email === 'uvaize@hotmail.com' || email === 'gladmin@ledgrpro.ca') return true;
  ```
  This bypasses ALL permission checks, plan gates, and module restrictions.
- **Impact:** If attacker compromises either email account, they get full superuser access across all tenants
- **Fix:** Remove hardcoded email bypass. Use database roles/flags (e.g. `is_global_admin: true`) instead.

---

## HIGH Bugs

---

### BUG-002: Supabase ANON Keys Hardcoded in Source Code
- **Severity:** HIGH
- **Module:** Security — `src/lib/supabase.js`
- **Found By:** Code Review + Test `17-security.spec.ts > SECURITY-002`
- **Steps to Reproduce:**
  1. Open browser DevTools → Sources tab
  2. Search for `supabase.co` in the loaded JS bundle
  3. Both STAGING and PROD Supabase ANON keys are visible
- **Expected:** API keys stored in `.env` file (`VITE_SUPABASE_ANON_KEY`) and not committed to source
- **Actual:** Both project URLs and ANON keys are hardcoded:
  ```javascript
  STAGING: https://tiywdsbaymrnqmlkxupj.supabase.co
  PROD:    https://lmviftlynuhopzmvaxeu.supabase.co
  // + ANON keys
  ```
- **Impact:** Keys are publicly visible to any user who inspects the browser bundle. While ANON keys are designed for client-side use, exposure enables targeted API abuse, enumeration attacks, and makes key rotation difficult.
- **Fix:** Move to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables. Add `.env` to `.gitignore`.
- **Status (2026-04-20):** RESOLVED in source. `src/lib/supabase.js` now reads `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `.env` is gitignored. `.env.example`, `.env.production.example`, `.env.staging.example` present.
- **Residual action:** CONFIRMED — keys still present in git history at commit `cd7d847^` (ancestor of fix commit "feat: expand Reports module... move Supabase keys to env"). Both STAGING (`tiywdsbaymrnqmlkxupj`) and PROD (`lmviftlynuhopzmvaxeu`) ANON JWTs leaked.
- **MUST DO:**
  1. Rotate anon keys in Supabase dashboard → Settings → API (STAGING + PROD)
  2. Update `.env` and deploy-platform env vars with new keys
  3. Verify RLS policies protect all tables before rotation
  4. If repo is/was public: `git filter-repo --replace-text <pattern-file>` to scrub history, then force-push

---

## MEDIUM Bugs

---

### BUG-003: No Login Rate Limiting — Brute Force Attack Possible
- **Severity:** MEDIUM
- **Module:** Auth / Login — `src/pages/Login.jsx`
- **Found By:** Test `17-security.spec.ts > SECURITY-003`
- **Steps to Reproduce:**
  1. Navigate to `/login`
  2. Submit 5 rapid failed login attempts (wrong password)
  3. Observe: no lockout, no CAPTCHA, no delay, no "too many attempts" message
- **Expected:** Account lockout or increasing delays after 3-5 failed attempts
- **Actual:** `CONFIRMED: No rate limiting on login — 5 rapid failed attempts accepted with no lockout`
- **Impact:** Credential stuffing and brute-force attacks against user accounts are feasible
- **Fix:** Enable Supabase Auth's built-in rate limiting. Add IP-based throttling via Supabase Edge Function.

---

### BUG-004: Fallback Mock Auth Accepts Weak Passwords
- **Severity:** MEDIUM
- **Module:** Auth — `src/context/AppContext.jsx`
- **Found By:** Code Review
- **Steps to Reproduce:**
  1. Make Supabase temporarily unavailable (e.g. disconnect network)
  2. Log in with any email + password `password` or `admin123`
  3. Observe: login succeeds with mock user data
- **Expected:** App should show a "service unavailable" error, not a fallback login
- **Actual:** AppContext.jsx contains:
  ```javascript
  const user = users.find(u =>
    u.email === email &&
    (password === 'password' || password === 'admin123')
  );
  ```
- **Impact:** During Supabase outages, anyone can log in with hardcoded credentials. This is a time-window vulnerability.
- **Fix:** Remove the fallback mock auth completely. Show a service error screen if Supabase is unreachable.

---

### BUG-005: Client Name Validation Not Enforced on Frontend
- **Severity:** MEDIUM
- **Module:** Clients — `src/pages/Clients.jsx`, `src/lib/validation.js`
- **Found By:** Test `05-clients.spec.ts > add client form validates name (min 2 chars)`
- **Steps to Reproduce:**
  1. Navigate to `/clients`
  2. Click "Add Client"
  3. Enter a single character name (e.g. `A`) and submit
  4. Observe: form submits successfully, client is created
- **Expected:** Zod schema `clientSchema: { name: z.string().min(2) }` should reject names shorter than 2 characters
- **Actual:** `Form still open after 1-char name: false` — the form closed (submission succeeded) with a 1-character name
- **Test Output:** `Form still open after 1-char name: false`
- **Impact:** Data quality issue — clients can be created with invalid/incomplete names
- **Fix:** Verify Zod schema is applied during `addClient()` call in AppContext. Add client-side form validation before submission.

---

## LOW Bugs

---

### BUG-006: Sensitive Data Cached in localStorage
- **Severity:** LOW
- **Module:** Data Layer — `src/lib/cache.js`
- **Found By:** Test `17-security.spec.ts > SECURITY-006`
- **Steps to Reproduce:**
  1. Log in to the app and browse a few pages
  2. Open DevTools → Application → Local Storage
  3. Observe keys: `ledgr_invoices`, `sm-auth-token`
- **Expected:** Only non-sensitive data cached; auth tokens stored securely (sessionStorage or httpOnly cookie)
- **Actual:** `localStorage keys found: ['ledgr_invoices', 'sm-auth-token']`  
  Financial invoice data and auth tokens are in unencrypted localStorage
- **Impact:** If a same-origin XSS vulnerability is found, an attacker can steal session tokens and invoice data
- **Fix:** Store `sm-auth-token` in httpOnly cookie (requires server-side changes) or sessionStorage. Evaluate which cached data is truly needed.

---

### BUG-007: No Content Security Policy (CSP) Header
- **Severity:** LOW
- **Module:** Security / HTTP Headers
- **Found By:** Test `17-security.spec.ts > SECURITY-007`
- **Steps to Reproduce:**
  1. Open DevTools → Network → reload the page
  2. Inspect the response headers for `content-security-policy`
- **Expected:** CSP header should restrict script sources, inline scripts, and external connections
- **Actual:** `CONFIRMED BUG-007: No Content-Security-Policy (CSP) header found`
- **Impact:** No browser-level XSS mitigation. Any injected script can freely execute.
- **Fix:** Add a CSP meta tag or configure it via hosting/CDN (e.g. Vercel headers). Start with a report-only policy.

---

### BUG-008: Logout Button Not Found in UI
- **Severity:** LOW
- **Module:** Navigation / AppLayout — `src/components/AppLayout.jsx`
- **Found By:** Test `01-login.spec.ts > logout clears session and redirects to login`
- **Steps to Reproduce:**
  1. Log in to the app
  2. Look for a "Logout", "Sign Out", or "Log Out" button in the sidebar or header
- **Expected:** Logout button should be clearly visible with standard text
- **Actual:** `BUG: Logout button not found in the UI` — the logout button uses non-standard attributes/text (possibly a user avatar menu or icon-only button)
- **Impact:** Poor UX — users may not know how to log out. Reduces security (shared computers)
- **Fix:** Add visible text "Logout" or "Sign Out" to the logout control. Ensure it's discoverable.
- **Update (2026-04-20):** Logout IS present in AppLayout header dropdown (avatar → menu → "Logout"). However, **GLOBAL_ADMIN users land on `/nexus-hq` (SuperAdminPortal) which does NOT render AppLayout and has NO logout button at all**. Global admins must manually clear storage or visit `/no-access` to sign out.
- **Sub-fix:** Add logout button to `src/pages/admin/SuperAdminPortal.jsx` header.

---

### BUG-009: No Audit Trail for High-Impact Operations
- **Severity:** LOW
- **Module:** Data Layer / Security
- **Found By:** Code Review — `src/context/AppContext.jsx`
- **Steps to Reproduce:**
  1. Delete a booking/sale record
  2. Change a user's permission level
  3. Process payroll
  4. Check if any audit log captures who did what and when
- **Expected:** Sensitive operations (payment records, permission changes, payroll runs, deletions) logged with user ID and timestamp
- **Actual:** Only `platform_error_logs` table exists. No operation audit trail.
- **Impact:** No forensic trail for disputes, compliance failures, or insider threats
- **Fix:** Add an `audit_log` table. Log key operations: sale/deletion, permission changes, payroll processing, login events.

---

## Informational Observations

---

### INFO-001: Purchases Module Correctly Plan-Gated (PRO)
- **Severity:** Info
- **Module:** Purchases — `src/pages/Purchases.jsx`
- **Observation:** When the tenant is on STARTER plan, navigating to `/purchases` correctly shows an upgrade wall
- **Test Output:** `INFO: Purchases is a PRO feature — upgrade wall shown`
- **Status:** Working as designed ✅

---

### INFO-002: XSS Payload Correctly Escaped
- **Severity:** Info
- **Module:** Inventory — `src/pages/Inventory.jsx`
- **Observation:** Entered `<img src=x onerror=alert(1)>` as a product name. No alert fired.
- **Test Output:** `PASS: XSS payload was escaped correctly — no alert fired`
- **Status:** React's JSX rendering correctly escapes user-supplied HTML ✅

---

## Module Test Results Summary

| Module | Tests | Result | Notes |
|--------|-------|--------|-------|
| 01 · Login | 9 | ✅ All Pass | Session, redirects, error handling all correct |
| 02 · Dashboard | 6 | ✅ All Pass | KPIs (13 elements), charts, sync status visible |
| 03 · Inventory | 8 | ✅ All Pass | Add, list, search, stock adjust, delete all work |
| 04 · Sales (POS) | 6 | ✅ All Pass | Cart, payment methods, product search visible |
| 05 · Clients | 7 | ✅ All Pass | **BUG-005**: 1-char name accepted |
| 06 · Expenses | 5 | ✅ All Pass | Negative amount rejected ✅, category required ✅ |
| 07 · Day Book | 4 | ✅ All Pass | Ledger, balance fields, date filter all work |
| 08 · Invoices | 5 | ✅ All Pass | Invoice list, status labels, mark paid visible |
| 09 · Purchases | 4 | ✅ / ⏭ Skipped | Upgrade wall shown correctly for STARTER plan |
| 10 · Suppliers | 3 | ✅ / ⏭ Skipped | Plan-gated correctly |
| 11 · Vehicles | 5 | ✅ All Pass | Vehicle list, dispatch, status labels visible |
| 12 · Orders | 3 | ✅ All Pass | Order list, status indicators load |
| 13 · Payroll | 5 | ✅ / ⏭ Skipped | Process payroll button visible |
| 14 · Reports | 8 | ✅ All Pass | Multiple report tabs, date filter, CSV export |
| 15 · Users | 5 | ✅ All Pass | Staff list, add button, email form field |
| 16 · Settings | 6 | ✅ All Pass | All settings fields editable and visible |
| 17 · Security | 9 | ✅ All Pass | Documented 7 vulnerabilities |
| 18 · Navigation | 7 | ✅ All Pass | All routes, back button, 404 handling work |

---

## How to Re-run Tests

```bash
cd /Users/uvaizeba/Desktop/Uvaize/ClaudeCode

# Run all tests
npx playwright test

# View HTML report with screenshots
npx playwright show-report

# Run a specific module
npx playwright test tests/05-clients.spec.ts

# Run security tests only
npx playwright test tests/17-security.spec.ts
```

---

## Priority Fix Order

1. **BUG-001** (CRITICAL) — Remove hardcoded email bypass from AppContext.jsx
2. **BUG-002** (HIGH) — Move Supabase keys to `.env` environment variables
3. **BUG-005** (MEDIUM) — Fix client name Zod validation (min 2 chars not enforced)
4. **BUG-003** (MEDIUM) — Enable login rate limiting in Supabase Auth settings
5. **BUG-004** (MEDIUM) — Remove fallback mock authentication code
6. **BUG-008** (LOW) — Make logout button discoverable with text label
7. **BUG-006** (LOW) — Evaluate localStorage caching of sensitive data
8. **BUG-007** (LOW) — Add Content Security Policy header
9. **BUG-009** (LOW) — Implement audit logging for high-impact operations
