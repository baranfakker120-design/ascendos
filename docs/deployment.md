# AscendOS — Cloudflare Pages Deployment

**Cloudflare Pages is the only hosting platform for AscendOS.**  
Do not connect this repository to Netlify (or any other static host).

## Production (Git deploy)

1. Cloudflare Dashboard → Workers & Pages → Create → Connect to Git → this repo.
2. Build settings (also reflected in `wrangler.toml`):
   - Framework preset: none / Vite
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
   - Node.js version: `20` (or newer)
3. Environment variables — set for **Production** and **Preview** (if preview deploys are enabled):

   | Variable                 | When Vite reads it | Notes                                      |
   | ------------------------ | ------------------ | ------------------------------------------ |
   | `VITE_SUPABASE_URL`      | **Build time**     | Staging project for Preview; prod for Production |
   | `VITE_SUPABASE_ANON_KEY` | **Build time**     | Matching anon key for that Supabase project      |

   Vite inlines `VITE_*` into the JS bundle during `vite build`. Runtime injection does nothing. After changing variables, **trigger a new deploy**.

4. Custom domain (optional): Pages → Custom domains → add your domain; Cloudflare manages DNS/TLS.
5. Default `*.pages.dev` URL is always available for the project.
6. SPA routing: `public/_redirects` (`/* /index.html 200`) — Cloudflare Pages compatible.
7. Cache: `public/_headers` keeps Service Worker, Workbox, manifest, and HTML no-cache so new deploys replace old PWA bundles.

## Disconnect Netlify (one-time, dashboard)

If a Netlify site (e.g. `ascendseyda`) is still linked to this GitHub repo:

1. Netlify → Site configuration → General → **Delete site** (or unlink the Git repo).
2. GitHub → Settings → Applications → revoke **Netlify** if unused.
3. Point Supabase Auth **Site URL** / **Redirect URLs** at the Cloudflare Pages URL (custom domain or `*.pages.dev`), not any `*.netlify.app` AscendOS host.

## Local preview

```bash
npm install
cp .env.example .env   # fill VITE_SUPABASE_*
npm run build          # fails fast if VITE_* are missing
npx wrangler pages dev dist
```

## Service Worker / PWA after redeploy

- `registerType: 'autoUpdate'` + `registerSW({ immediate: true })` activates the new worker without waiting for a second visit.
- `_headers` sets `Cache-Control: no-cache` on `/`, `/index.html`, `/sw.js`, Workbox scripts, and the web manifest.
- After a bad (env-less) build was installed as a PWA: open the new deploy URL once online, or clear site data / reinstall the Home Screen icon so the empty bundle cannot stick.

## Notes

- CI (`.github/workflows/ci.yml`) is the quality gate only — it does **not** deploy. It supplies placeholder `VITE_*` values so `npm run build` can compile.
- Never commit secrets. Configure them only in the Cloudflare Pages dashboard (and local `.env`, which is gitignored).
- External Chogan/Team-Şeyda tools may still live on third-party `*.netlify.app` URLs in product content. Those are **not** AscendOS hosting.
