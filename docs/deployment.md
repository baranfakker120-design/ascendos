# AscendOS — Cloudflare Pages Deployment (sole host)

**Cloudflare Pages is the only hosting platform.** Do not reconnect Netlify.

## SEV-1 root cause (proven)

| Deploy       | Commit             | `wrangler.toml`                         | Bundle                 |
| ------------ | ------------------ | --------------------------------------- | ---------------------- |
| Last good    | PR #29 / `29dfc6b` | **absent**                              | `VITE_*` inlined       |
| First broken | PR #30 / `6328f18` | added `pages_build_output_dir = "dist"` | `VITE_*` → `undefined` |

Adding `pages_build_output_dir` makes Wrangler the Pages **source of truth**.
Dashboard plain environment variables are then no longer injected into the
Git **build** environment. Vite needs those vars at `npm run build` time.
`[vars]` in wrangler.toml are **runtime** Function bindings — they do **not**
feed `import.meta.env` for a static Vite SPA.

Official note: keep wrangler.toml for local use **without**
`pages_build_output_dir` so the dashboard remains source of truth for Git builds.

## Required dashboard configuration (permanent)

On **each** Git Pages project (`ascendseyda` and `ascendos`):

1. Settings → Environment variables (Production **and** Preview)
2. `VITE_SUPABASE_URL`
3. `VITE_SUPABASE_ANON_KEY`
4. Retry deployment after changing vars

Build settings: `npm run build` → output `dist` → Node 20+

## Local

```bash
npm install
cp .env.example .env   # fill VITE_*
npm run build
npx wrangler pages dev dist
```

## PWA

`registerType: autoUpdate` + `registerSW({ immediate: true })`.
`public/_headers` keeps SW/manifest no-cache.
