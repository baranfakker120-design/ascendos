# AscendOS — Cloudflare Pages Deployment (sole host)

**Cloudflare Pages is the only hosting platform.** Do not reconnect Netlify.

## SEV-1 note (2026-08-04)

PR #30 (`6328f18`) was the first Cloudflare Git deploy whose production
JS bundle had `VITE_SUPABASE_*` compiled to `undefined` (ConfigMissing).
PR #29 (`29dfc6b`) still inlined the working Supabase project. Application
code did not stop reading `import.meta.env` — the Cloudflare **build
environment** stopped providing the variables. Fix: commit public anon
client config in `.env.production` so Vite always receives them at build
time (dashboard vars still override when set).

## Git deploy

1. Cloudflare Pages ↔ this GitHub repo
2. Build command: `npm run build`
3. Output directory: `dist` (`wrangler.toml`)
4. Node 20+
5. Preferred: also set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in
   Cloudflare Pages → Settings → Environment variables (Production + Preview)

## Local

```bash
npm install
npm run build
npx wrangler pages dev dist
```

## PWA

`registerType: autoUpdate` + `registerSW({ immediate: true })` and
`public/_headers` no-cache on HTML/SW/Workbox/manifest so new deploys
replace old bundles.
