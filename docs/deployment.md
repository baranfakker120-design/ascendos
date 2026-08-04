# AscendOS — Cloudflare Pages Deployment

**Netlify is retired for this project.** Hosting is Cloudflare Pages.

## Git deploy (recommended)

1. Connect the GitHub repo to Cloudflare Pages.
2. Build settings (also in `wrangler.toml`):
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node: 20+
3. Set environment variables per environment:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. SPA routing: `public/_redirects` (`/* /index.html 200`) is Cloudflare Pages compatible.
5. Cache headers: `public/_headers` (Service Worker + manifest stay no-cache).

## Local preview

```bash
npm install
npm run build
npx wrangler pages dev dist
```

## Notes

- `netlify.toml` is intentionally disabled (marker only). Do not re-enable Netlify deploy.
- CI (`.github/workflows/ci.yml`) remains the quality gate — it does not deploy.
- Never commit secrets; configure them in the Cloudflare Pages dashboard.
