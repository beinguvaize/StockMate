// drive-backup: nightly Google Drive backup of a shop, and restore-from-Drive.
//
// Deploy with --no-verify-jwt: /callback is a browser redirect from Google and
// the cron call carries x-cron-secret, neither has a Supabase JWT. Every other
// action verifies the caller itself, through drive_backup_status() with the
// caller's own JWT, which also proves the caller is the OWNER of the shop and
// tells us which shop. The service role is used only for the link table and the
// service-only export functions (see 20261120_drive_backup.sql).
//
// Scope is drive.file: bookledger can see only files it created, never the rest
// of the owner's Drive. Secrets: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET,
// DRIVE_TOKEN_KEY (base64 32 bytes), DRIVE_STATE_KEY, APP_URL. Cron key: vault drive_cron_secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.1";
import { buildBackup, backupFileName } from "./backupFile.ts";
import { decryptToken, encryptToken, filesToDelete, isDue, signState, verifyState } from "./lib.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const PAGE = 1000;
const MULTIPART_MAX = 5 * 1024 * 1024;
const FOLDER_NAME = "bookledger backups";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (code: string, message: string, status = 400) => json({ ok: false, error: code, message }, status);

class DriveError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const redirectUri = () => `${env("SUPABASE_URL")}/functions/v1/drive-backup/callback`;
const configured = () =>
  !!(env("GOOGLE_DRIVE_CLIENT_ID") && env("GOOGLE_DRIVE_CLIENT_SECRET") && env("DRIVE_TOKEN_KEY") &&
    env("DRIVE_STATE_KEY") && env("APP_URL"));

const service = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** The caller's tenant, only if the caller is that shop's owner. */
async function ownerOf(req: Request): Promise<{ tenant: string; user: string } | Response> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return fail("unauthorized", "Sign in first.", 401);
  const userDb = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = await userDb.auth.getUser();
  const { data, error } = await userDb.rpc("drive_backup_status");
  if (error || !data?.tenant_id || !u?.user) {
    return fail("forbidden", "Only the owner of this shop can use Google Drive backup.", 403);
  }
  return { tenant: data.tenant_id, user: u.user.id };
}

// ── Google ────────────────────────────────────────────────────────────────

async function tokenCall(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_DRIVE_CLIENT_ID"), client_secret: env("GOOGLE_DRIVE_CLIENT_SECRET"), ...params,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body.error === "invalid_grant" ? "drive_revoked" : "drive_token_failed";
    throw new DriveError(
      code,
      code === "drive_revoked"
        ? "Google no longer allows access. Disconnect and connect Google Drive again."
        : `Google refused the sign-in: ${body.error_description || body.error || res.status}`,
    );
  }
  return body;
}

async function accessToken(link: { refresh_token_enc: string }): Promise<string> {
  const refresh = await decryptToken(env("DRIVE_TOKEN_KEY"), link.refresh_token_enc);
  return (await tokenCall({ grant_type: "refresh_token", refresh_token: refresh })).access_token;
}

async function drive(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DriveError("drive_api_failed", `Google Drive said ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

async function createFolder(token: string): Promise<string> {
  const res = await drive(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  return (await res.json()).id;
}

async function listFiles(token: string, folder: string) {
  const files: { id: string; name: string; size?: string; createdTime: string }[] = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
    const res = await drive(
      token,
      `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=100` +
        `&fields=nextPageToken,files(id,name,size,createdTime)${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    const b = await res.json();
    files.push(...(b.files || []));
    pageToken = b.nextPageToken || "";
  } while (pageToken);
  return files;
}

async function upload(token: string, folder: string, name: string, content: string) {
  const bytes = new TextEncoder().encode(content);
  const meta = { name, parents: [folder], mimeType: "application/json" };
  if (bytes.length < MULTIPART_MAX) {
    const boundary = "bl" + crypto.randomUUID().replace(/-/g, "");
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ]);
    const res = await drive(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size", {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return await res.json();
  }
  const init = await drive(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  const session = init.headers.get("Location");
  if (!session) throw new DriveError("drive_api_failed", "Google Drive did not open an upload session.");
  const res = await drive(token, session, { method: "PUT", headers: { "Content-Type": "application/json" }, body: bytes });
  return await res.json();
}

// ── the backup itself ─────────────────────────────────────────────────────

async function backupTenant(sb: ReturnType<typeof service>, tenantId: string) {
  const { data: link } = await sb.from("drive_backup_links").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (!link) throw new DriveError("not_connected", "Google Drive is not connected.");
  try {
    const token = await accessToken(link);

    const { data: manifest, error: mErr } = await sb.rpc("drive_export_manifest", { p_tenant_id: tenantId });
    if (mErr) throw new Error(`manifest: ${mErr.message}`);
    const tables: Record<string, any[]> = {};
    for (const m of manifest) {
      const rows: any[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await sb.rpc("drive_export_table", {
          p_tenant_id: tenantId, p_table: m.table, p_offset: offset, p_limit: PAGE,
        });
        if (error) throw new Error(`${m.table}: ${error.message}`);
        rows.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      tables[m.table] = rows;
    }
    const { data: t } = await sb.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const payload = buildBackup({ tenantId, tenantName: t?.name || "shop", tables, manifest, appVersion: "drive-backup" });
    const content = JSON.stringify(payload);

    const file = await upload(token, link.folder_id, backupFileName(t?.name, new Date()), content);

    // Retention: only ever files inside our own folder.
    let pruneNote = "";
    try {
      const all = await listFiles(token, link.folder_id);
      for (const id of filesToDelete(all)) await drive(token, `https://www.googleapis.com/drive/v3/files/${id}`, { method: "DELETE" });
    } catch (e) {
      // The new backup is safe; say that pruning failed rather than hide it.
      pruneNote = ` (old backups could not be cleaned up: ${(e as Error).message})`;
      console.error("[drive-backup] retention failed", tenantId, e);
    }

    await sb.from("drive_backup_links").update({
      last_backup_at: new Date().toISOString(), last_status: "ok", last_error: pruneNote || null,
      last_file_id: file.id, last_size_bytes: Number(file.size ?? content.length), updated_at: new Date().toISOString(),
    }).eq("tenant_id", tenantId);
    return { fileId: file.id, bytes: Number(file.size ?? content.length) };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("[drive-backup] failed", tenantId, e);
    await sb.from("drive_backup_links").update({
      last_status: "error", last_error: msg.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq("tenant_id", tenantId);
    throw e;
  }
}

async function runCron() {
  const sb = service();
  const { data: links } = await sb.from("drive_backup_links").select("tenant_id,last_backup_at").eq("enabled", true);
  let ok = 0, failed = 0;
  for (const l of links || []) {
    if (!isDue(l.last_backup_at)) continue;
    try { await backupTenant(sb, l.tenant_id); ok += 1; } catch { failed += 1; } // already recorded on the row
  }
  console.log(`[drive-backup] cron done ok=${ok} failed=${failed}`);
}

// ── handler ───────────────────────────────────────────────────────────────

async function callback(url: URL) {
  const app = env("APP_URL").replace(/\/$/, "");
  const back = (q: string) => Response.redirect(`${app}/backup?${q}`, 302);
  const err = (reason: string) => back(`drive=error&reason=${encodeURIComponent(reason)}`);
  if (!configured()) return err("drive_not_configured");
  if (url.searchParams.get("error")) return err(url.searchParams.get("error")!);
  const st = await verifyState(env("DRIVE_STATE_KEY"), url.searchParams.get("state") || "");
  if (!st) return err("This connection link expired. Please try again.");
  const code = url.searchParams.get("code");
  if (!code) return err("Google did not send a code.");
  try {
    const tok = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
    if (!tok.refresh_token) return err("Google did not grant offline access. Remove bookledger at myaccount.google.com/permissions and try again.");
    const info = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })).json().catch(() => ({}));
    const folder = await createFolder(tok.access_token);
    const sb = service();
    const { error } = await sb.from("drive_backup_links").upsert({
      tenant_id: st.tenant, google_email: info.email ?? null,
      refresh_token_enc: await encryptToken(env("DRIVE_TOKEN_KEY"), tok.refresh_token),
      folder_id: folder, enabled: true, last_status: null, last_error: null,
      connected_by: st.user, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return back("drive=connected");
  } catch (e) {
    console.error("[drive-backup] callback failed", e);
    return err((e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname.endsWith("/callback")) return await callback(url);
    if (req.method !== "POST") return fail("bad_request", "POST only.", 405);

    const { action, fileId } = await req.json().catch(() => ({}));

    if (action === "cron") {
      // The nightly job's key lives only in the database vault (created there,
      // never copied out); the database itself says whether the header matches.
      const given = req.headers.get("x-cron-secret") || "";
      const { data: okKey, error: keyErr } = given
        ? await service().rpc("drive_cron_secret_ok", { p_secret: given })
        : { data: false, error: null };
      if (keyErr) console.error("[drive-backup] cron key check failed:", keyErr.message);
      if (okKey !== true) return fail("unauthorized", "Bad cron secret.", 401);
      // Answer at once (pg_net waits only a few seconds); the work continues.
      // @ts-ignore EdgeRuntime is provided by the Supabase runtime
      EdgeRuntime.waitUntil(runCron().catch((e) => console.error("[drive-backup] cron crashed", e)));
      return json({ ok: true, started: true }, 202);
    }

    if (!configured()) return fail("drive_not_configured", "Google Drive backup is not set up on the server yet.", 503);
    const who = await ownerOf(req);
    if (who instanceof Response) return who;
    const sb = service();

    if (action === "start") {
      const state = await signState(env("DRIVE_STATE_KEY"), who.tenant, who.user);
      const q = new URLSearchParams({
        client_id: env("GOOGLE_DRIVE_CLIENT_ID"), redirect_uri: redirectUri(), response_type: "code",
        scope: "https://www.googleapis.com/auth/drive.file openid email",
        access_type: "offline", prompt: "consent", state,
      });
      return json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
    }

    if (action === "run") {
      const r = await backupTenant(sb, who.tenant);
      return json({ ok: true, ...r });
    }

    const { data: link } = await sb.from("drive_backup_links").select("*").eq("tenant_id", who.tenant).maybeSingle();
    if (!link) return fail("not_connected", "Google Drive is not connected.", 404);

    if (action === "list") {
      const files = await listFiles(await accessToken(link), link.folder_id);
      return json({ ok: true, files: files.map((f) => ({ id: f.id, name: f.name, size: Number(f.size || 0), createdTime: f.createdTime })) });
    }

    if (action === "download") {
      if (!fileId || typeof fileId !== "string") return fail("bad_request", "fileId is required.");
      const token = await accessToken(link);
      const meta = await (await drive(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=parents,trashed`)).json();
      if (meta.trashed || !(meta.parents || []).includes(link.folder_id)) {
        return fail("forbidden", "That file is not one of this shop's backups.", 403);
      }
      const file = await drive(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
      return new Response(file.body, { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (action === "disconnect") {
      // Revoke first; if Google is unreachable the row stays so the owner can retry.
      const refresh = await decryptToken(env("DRIVE_TOKEN_KEY"), link.refresh_token_enc);
      const rv = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" });
      if (!rv.ok && rv.status !== 400) { // 400 = already revoked
        return fail("drive_revoke_failed", `Google would not revoke the connection (${rv.status}). Try again.`, 502);
      }
      const { error } = await sb.from("drive_backup_links").delete().eq("tenant_id", who.tenant);
      if (error) return fail("db_failed", error.message, 500);
      return json({ ok: true });
    }

    return fail("bad_request", "Unknown action.");
  } catch (e) {
    console.error("[drive-backup]", e);
    const code = e instanceof DriveError ? e.code : "failed";
    return fail(code, (e as Error).message || String(e), 500);
  }
});
