/**
 * Error codes with support codes (web). No UI yet: this is the parity seed.
 * ==========================================================================
 *
 * The same 25 codes, titles and outcomes as the phone
 * (mobile_app/lib/core/errors/error_codes.dart). errorCodes.test.js reads the
 * Dart file and fails if the two lists drift.
 *
 * The headline a screen shows is the OUTCOME, and it must be true:
 *   NOT_SENT        the request provably never left (on web: navigator.onLine
 *                   was false BEFORE sending, or the sign-in refresh failed)
 *   MAY_HAVE_SAVED  it left and no answer came back -- writeOutcome.js's
 *                   UNCONFIRMED -- or part of the action already landed
 *   NOT_SAVED       the server answered and refused (writeOutcome's REJECTED)
 * When unsure: MAY_HAVE_SAVED.
 */

import { isTransportFailure } from './writeOutcome';

export const OUTCOME = Object.freeze({
  NOT_SENT: 'NOT_SENT',
  MAY_HAVE_SAVED: 'MAY_HAVE_SAVED',
  NOT_SAVED: 'NOT_SAVED',
  NO_CHANGE: 'NO_CHANGE',
});

export const OUTCOME_LABEL = Object.freeze({
  NOT_SENT: 'Not sent',
  MAY_HAVE_SAVED: 'May have saved',
  NOT_SAVED: 'Not saved',
  NO_CHANGE: 'No change to the books',
});

const S = OUTCOME.NOT_SENT;
const M = OUTCOME.MAY_HAVE_SAVED;
const N = OUTCOME.NOT_SAVED;

/** [code, title, outcome, advice] in catalogue order. */
export const ERROR_CATALOGUE = Object.freeze([
  ['NET-01', 'No internet', S, 'Turn off airplane mode or connect to Wi-Fi, then tap Try again.'],
  ['NET-02', 'Connection dropped', M, 'Check before trying again. It may already be saved.'],
  ['NET-03', 'Took too long', M, 'Check before trying again. It may already be saved.'],
  ['NET-04', 'Secure connection failed', S, "Check the phone's date and time are correct. On shop Wi-Fi, try mobile data."],
  ['AUTH-01', 'Signed out', S, 'Sign in again. What you typed is kept.'],
  ['AUTH-02', 'Session expired', N, 'Sign in again, then try again.'],
  ['AUTH-03', 'Could not refresh sign-in', S, 'Wait a moment and tap Try again.'],
  ['SRV-01', 'Server did not answer properly', M, 'Check before trying again. It may already be saved.'],
  ['SRV-02', 'Server busy', N, 'Wait a minute and tap Try again.'],
  ['SRV-03', 'App needs an update', N, 'Update the app from the Update screen, then try again.'],
  ['DB-01', 'Already saved', N, 'It is already in the books. Check the list, do not add it again.'],
  ['DB-02', 'Not allowed', N, 'Ask the shop owner to give your account access to this.'],
  ['DB-03', 'Not enough stock', N, 'Record the purchase or correct the stock, then try again.'],
  ['DB-04', 'Credit limit reached', N, "Collect a payment or raise the client's credit limit."],
  ['DB-05', 'Record was removed', N, 'It was deleted on another device. Go back and refresh.'],
  ['DB-06', 'Shop rule stopped it', N, 'Read the reason shown. Fix it and try again.'],
  ['VAL-01', 'Check what you typed', S, 'Fix the highlighted field.'],
  ['VAL-02', 'Server could not read a value', N, 'Re-enter the value (date, amount) and try again.'],
  ['SYNC-01', 'Saved on this phone', S, 'Nothing to do. It will send when the phone is online.'],
  ['SYNC-02', 'May already be recorded', M, 'Open the list and look for it. If there, Discard. If not, Retry.'],
  ['SYNC-03', 'Refused when sent', N, 'Read the reason. Fix it, then Retry or Discard.'],
  ['SYNC-04', 'Waiting for sign-in', S, 'Sign in again. Queued items will send after.'],
  ['APP-01', 'Something went wrong on the phone', S, 'Tap Try again. If it repeats, send the details to support.'],
  ['APP-02', 'Something went wrong while saving', M, 'Check before trying again. It may already be saved.'],
  ['APP-03', 'Could not print or share', OUTCOME.NO_CHANGE, 'Check the printer or the app you shared to, then try again.'],
].map(([code, title, outcome, advice]) => Object.freeze({ code, title, outcome, advice })));

const BY_CODE = new Map(ERROR_CATALOGUE.map((c) => [c.code, c]));

export function errorCodeInfo(code) {
  return BY_CODE.get(code) || BY_CODE.get('APP-02');
}

const SIGNED_OUT = new Set([
  'refresh_token_not_found', 'refresh_token_already_used', 'invalid_grant',
  'session_not_found', 'session_expired', 'user_not_found', 'bad_jwt',
]);
const BUSY = new Set(['53300', '53400', '40001', '40P01', '57014',
  'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003']);
const OUT_OF_STEP = new Set(['PGRST202', 'PGRST203', 'PGRST204', '42883', '42703', '42P01']);
const BAD_VALUE = new Set(['22P02', '22003', '22007', '22008', '22001']);

/** The code for a PostgREST / Postgres error the server answered with. */
export function codeFromPostgrest(code, text) {
  const c = String(code || '').toUpperCase();
  const t = String(text || '');
  const lower = t.toLowerCase();
  if (c === 'PGRST301' || c === 'PGRST302' || c === '401' || lower.includes('jwt expired')) return 'AUTH-02';
  // Only a three-digit code is an HTTP status (23514 is a SQLSTATE).
  if (/^\d{3}$/.test(c)) {
    const s = Number(c);
    if (s === 408) return 'NET-03';
    if (s === 429) return 'SRV-02';
    if (s === 403) return 'DB-02';
    return 'SRV-01'; // 5xx or any other bare status: not provable either way
  }
  if (c.startsWith('08')) return 'SRV-01';
  if (BUSY.has(c)) return 'SRV-02';
  if (OUT_OF_STEP.has(c)) return 'SRV-03';
  if (t.includes('NEGATIVE_STOCK_BLOCKED') || (c === '23514' && lower.includes('stock'))) return 'DB-03';
  if (t.includes('CREDIT_LIMIT_EXCEEDED')) return 'DB-04';
  if (c === '23505' || lower.includes('already processed')) return 'DB-01';
  if (c === '42501' || lower.includes('row-level security') || lower.includes('access denied')
      || lower.includes('permission denied')) return 'DB-02';
  if (c === '23503' || c === 'PGRST116') return 'DB-05';
  if (BAD_VALUE.has(c)) return 'VAL-02';
  return 'DB-06';
}

function pick(err, { sent, offlineBeforeSend, printOrShare }) {
  if (offlineBeforeSend) return 'NET-01';
  if (err?.name === 'ValidationFailure' || err?.validation === true) return 'VAL-01';
  const name = String(err?.name || '');
  const msg = String(err?.message || err || '');

  // The sign-in refresh runs before the write; its failure means the write
  // was never sent.
  if (name === 'AuthRetryableFetchError') return 'AUTH-03';
  if (name === 'AuthSessionMissingError') return 'AUTH-01';
  if (name.startsWith('Auth') || err?.__isAuthError) {
    if (SIGNED_OUT.has(String(err?.code || '').toLowerCase())) return 'AUTH-01';
    const st = Number(err?.status);
    if (st >= 400 && st < 500) return 'AUTH-01';
    return 'AUTH-03';
  }

  if (/certificate|ssl|tls handshake/i.test(msg)) return 'NET-04';

  // Edge functions: FunctionsHttpError carries the response.
  if (name === 'FunctionsHttpError') {
    const st = Number(err?.context?.status);
    if (st >= 500) return 'SRV-01';
    if (st === 401) return 'AUTH-02';
    if (st === 403) return 'DB-02';
    if (st === 408) return 'NET-03';
    if (st === 429) return 'SRV-02';
    if (st >= 400) return 'DB-06';
    return 'SRV-01';
  }

  // writeOutcome's UNCONFIRMED: the request did not complete a round trip.
  if (isTransportFailure(err)) {
    return /timed out|timeout|abort/i.test(msg) ? 'NET-03' : 'NET-02';
  }

  if (printOrShare) return 'APP-03';

  // writeOutcome's REJECTED with a server code: the server answered.
  if (err && typeof err === 'object' && err.code != null && err.code !== '') {
    return codeFromPostgrest(err.code, `${msg} ${err.details || ''}`);
  }
  return sent ? 'APP-02' : 'APP-01';
}

/**
 * Pick the code for `err`.
 *
 *   sent                   any request of this action may have left (APP-01/02)
 *   earlierWriteSucceeded  an earlier write of the same action landed: the
 *                          whole action is MAY_HAVE_SAVED (multi-request rule)
 *   offlineBeforeSend      navigator.onLine was false when checked BEFORE
 *                          sending (the only web proof of NET-01)
 *   printOrShare           print / PDF / share (APP-03)
 */
export function classifyError(err, {
  sent = true, earlierWriteSucceeded = false, offlineBeforeSend = false, printOrShare = false,
} = {}) {
  const info = errorCodeInfo(pick(err, { sent, offlineBeforeSend, printOrShare }));
  let outcome = info.outcome;
  let partial = false;
  if (earlierWriteSucceeded && outcome !== OUTCOME.MAY_HAVE_SAVED) {
    outcome = OUTCOME.MAY_HAVE_SAVED;
    partial = true;
  }
  return { code: info.code, title: info.title, advice: info.advice, outcome, partial };
}

// ── reference and scrubbing (same rules as the phone) ────────────────────

export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const REFERENCE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;

/** 8 characters, no 0/O/1/I, made in the browser at the moment of failure. */
export function newReference(rand) {
  const n = REFERENCE_ALPHABET.length;
  const bytes = new Uint8Array(8);
  if (!rand && globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor((rand || Math.random)() * 256);
  // 256 is a multiple of 32, so the modulo is unbiased.
  return Array.from(bytes, (b) => REFERENCE_ALPHABET[b % n]).join('');
}

/** Strip tokens and personal values before a raw error is shown, copied or stored. */
export function scrubRaw(raw, maxLength = 4000) {
  let s = String(raw ?? '');
  s = s.replace(/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, '<jwt>');
  s = s.replace(/(authorization)(["']?\s*[:=]\s*["']?)(bearer\s+)?[^\s,"')}]+/gi, '$1$2<redacted>');
  s = s.replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>');
  s = s.replace(/(apikey|api_key|x-api-key|access_token|refresh_token|token|password|secret)(["']?\s*[:=]\s*["']?)[^\s&,"')}]+/gi, '$1$2<redacted>');
  s = s.replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, '<key>');
  s = s.replace(/Key \(([^)]*)\)=\([^)]*\)/g, 'Key ($1)=(<value>)');
  s = s.replace(/(₹|Rs\.?|INR)\s?[\d,]+(\.\d+)?/gi, '<amount>');
  s = s.replace(/\+\d{1,3}[\s-]?\d{4,5}[\s-]?\d{5}/g, '<number>');
  s = s.replace(/(?<![\w-])\d{10,13}(?![\w-])/g, '<number>');
  if (s.length > maxLength) s = `${s.slice(0, maxLength)}…`;
  return s;
}

/**
 * The platform_error_logs row, the same columns the phone writes
 * (supabase/migrations/20261127_platform_error_logs_support_codes.sql).
 */
export function buildErrorRow({
  result, reference, screen, action, tenantId, userId = null, raw,
  appVersion = null, occurredAt = new Date(),
}) {
  return {
    tenant_id: tenantId ?? null,
    user_id: userId,
    module: screen,
    action,
    error_code: result.code,
    error_message: scrubRaw(raw),
    severity: result.outcome === OUTCOME.MAY_HAVE_SAVED ? 'High' : 'Medium',
    reference_id: reference,
    outcome: result.outcome,
    platform: 'web',
    app_version: appVersion,
    occurred_at: new Date(occurredAt).toISOString(),
  };
}
