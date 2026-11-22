// Pure helpers for drive-backup (no Deno APIs, so vitest can run them).
// Uses only WebCrypto, which Deno and Node both provide.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (s: string): Uint8Array => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
};

// ── OAuth state: HMAC-SHA256 signed, 10 minutes ────────────────────────────

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const STATE_TTL_MS = 10 * 60 * 1000;

export async function signState(secret: string, tenant: string, user: string, now = Date.now()): Promise<string> {
  const nonce = b64u(crypto.getRandomValues(new Uint8Array(12)));
  const body = b64u(enc.encode(JSON.stringify({ tenant, user, exp: now + STATE_TTL_MS, nonce })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

/** Returns { tenant, user } or null for a bad signature, malformed or expired state. */
export async function verifyState(secret: string, state: string, now = Date.now()) {
  try {
    const [body, sig] = String(state).split(".");
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64u(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(unb64u(body)));
    if (!p.tenant || !p.user || typeof p.exp !== "number" || p.exp < now) return null;
    return { tenant: p.tenant as string, user: p.user as string };
  } catch {
    return null;
  }
}

// ── refresh-token encryption: AES-256-GCM ──────────────────────────────────
// DRIVE_TOKEN_KEY is base64 of 32 random bytes (openssl rand -base64 32).

const aesKey = (keyB64: string) => {
  const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("DRIVE_TOKEN_KEY must be 32 bytes, base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
};

export async function encryptToken(keyB64: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyB64), enc.encode(plain));
  return `v1.${b64u(iv)}.${b64u(ct)}`;
}

export async function decryptToken(keyB64: string, stored: string): Promise<string> {
  const [v, iv, ct] = String(stored).split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("unrecognised token format");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await aesKey(keyB64), unb64u(ct));
  return dec.decode(pt);
}

// ── retention ──────────────────────────────────────────────────────────────

export const KEEP_NEWEST = 30;

/** Ids to delete: everything beyond the newest `keep`, by createdTime. */
export function filesToDelete(
  files: { id: string; createdTime: string }[],
  keep = KEEP_NEWEST,
): string[] {
  return [...files]
    .sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime))
    .slice(keep)
    .map((f) => f.id);
}

/** Cron: only shops not backed up in the last 20h. */
export const DUE_AFTER_MS = 20 * 60 * 60 * 1000;
export const isDue = (lastBackupAt: string | null, now = Date.now()): boolean =>
  !lastBackupAt || now - Date.parse(lastBackupAt) >= DUE_AFTER_MS;
