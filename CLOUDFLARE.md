# Cloudflare Pages deployment

Both the **app** and the **landing** run on Cloudflare Pages alongside the
existing Vercel deployments (parallel, not a cutover). Each is a separate
Pages project connected to its own GitHub repo. Deploy via the Cloudflare
dashboard → **Workers & Pages → Create → Pages → Connect to Git**.

---

## 1. App — `beinguvaize/StockMate` (Vite SPA)

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None (or "Vite") |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node version | `20` (pinned via `.node-version`) |

SPA routing is handled by `public/_redirects` (`/* /index.html 200`) — copied
into `dist` at build, Cloudflare reads it natively. No extra config.

The public invoice page `/i/` (where a client opens a shared invoice, no sign-in) is its own built page, `dist/i/index.html`; `_redirects` sends `/i/` to it above the catch-all, and `public/_headers` gives it no-store, noindex, no-referrer and a strict CSP.

The build runs the crash-guard first (`prebuild` → `lint:crash`), so a Cloudflare
build fails fast on undefined refs/components.

### Environment variables (Settings → Environment variables)

Set for **Production** and **Preview**. Copy the values from Vercel.

| Variable | Required | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | prod: `https://lmviftlynuhopzmvaxeu.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | yes | prod Supabase anon (publishable) key |
| `VITE_BOOTSTRAP_ADMIN_EMAILS` | no | optional; not set on Vercel. Only stamps admin role on a brand-new user's first login. Skip — admins already exist in DB. |
| `VITE_PUBLIC_APP_URL` | yes (for invoice share links) | The public address put in shared invoice links (`<this>/i/#<token>`). prod: `https://app.bookledger.in`. Without it the web app uses its own address; the desktop app (file://) cannot make links at all. |

> Use the **dev** Supabase project (`tiywdsbaymrnqmlkxupj`) values on the
> Preview environment if you want preview builds to hit dev.

---

## 2. Landing — `beinguvaize/ledgrpro-landing` (static HTML)

No build step — plain HTML/assets at repo root.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | *(leave empty)* |
| Build output directory | `/` |
| Root directory | `/` |

No environment variables.

---

## After connecting

- Each push to `main` auto-deploys.
- Pull requests get a preview URL.
- Custom domains: add under **Custom domains** once verified (keep Vercel on the
  live domain until you choose to cut over — this is the parallel phase).
- To later cut over: point DNS (CNAME) for the domain from Vercel to the
  Cloudflare Pages project, then retire the Vercel project.
