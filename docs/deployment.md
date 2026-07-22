# AscendOS — Netlify-Deployment (Schritt für Schritt)

## Warum du „Page not found" gesehen hast

Der Screenshot zeigt ein Drag-&-Drop-Deploy, bei dem KEINE gebaute App
hochgeladen wurde. Netlify baut bei Drag & Drop nichts — es serviert
exakt die hochgeladenen Dateien. Der Quellcode-Ordner enthält keine
fertige index.html-App → 404. Deploybar ist ausschließlich:
(a) der gebaute `dist`-Ordner, oder (b) das Git-Repo, das Netlify
selbst baut (empfohlen).

## Weg A — Empfohlen: Git-Deploy (Netlify baut selbst)

1. Repo zu GitHub pushen.
2. Netlify → „Add new site" → „Import an existing project" → Repo wählen.
   Build-Command und Publish-Ordner kommen automatisch aus `netlify.toml`
   (`npm run build` → `dist`), Node 20 ist dort fixiert.
3. **Environment variables setzen (ohne sie zeigt die App den
   Konfigurations-Hinweis):**
   - `VITE_SUPABASE_URL` = URL deines Staging-/Production-Supabase-Projekts
   - `VITE_SUPABASE_ANON_KEY` = zugehöriger anon key
   (Site settings → Environment variables; für Deploy Previews Staging-Werte,
   für Production Production-Werte — Kontexte trennen, ADR-018.)
4. Deploy auslösen. Jeder Push auf `main` deployt Production, jeder PR
   bekommt eine Preview-URL.

## Weg B — Manuell: lokal bauen, dist hochladen

```bash
npm install
npm run build        # erzeugt dist/ (tsc + vite build)
```

Dann in Netlify „Deploys" → den **dist-Ordner** (nicht das Projekt!)
per Drag & Drop hochladen. Wichtig: `dist` enthält jetzt automatisch
eine `_redirects`-Datei (aus `public/`), damit das SPA-Routing auch bei
manuellen Deploys funktioniert — `netlify.toml` greift dort nämlich nicht.
Env-Vars müssen VOR dem Build in einer lokalen `.env` stehen (Vite backt
sie zur Build-Zeit ein).

## Was in diesem Zuge gefixt wurde (Build-Review)

1. `@types/node` fehlte → `vite.config.ts` (node:url-Import) hätte den
   Typecheck gebrochen. Ergänzt; `engines.node >= 20` fixiert.
2. `__dirname` existiert in ESM-Configs nicht → wäre beim ersten
   `npm run dev/build` gecrasht. Ersetzt durch `fileURLToPath(import.meta.url)`.
3. Fehlende Env-Vars warfen beim Modul-Import → weißer Bildschirm im
   Deploy. Jetzt: lesbarer Konfigurations-Hinweis mit Anleitung.
4. `public/_redirects` ergänzt (SPA-Fallback für manuelle Deploys).

## Verifikation nach dem Deploy

☐ Startseite lädt (Login sichtbar, Wortmarke „ASCENDOS")
☐ Direktaufruf einer Unterroute (z. B. `/registrieren`) lädt — kein 404
   (beweist SPA-Fallback)
☐ Ohne Env-Vars: Konfigurations-Hinweis statt weißer Seite
☐ Mit Env-Vars: Registrierung per Invite funktioniert
   (erfordert deployte Edge Functions: `supabase functions deploy
   validate-invite coach-chat ingest-knowledge` + Secrets per
   `supabase secrets set`)
☐ Lighthouse: PWA installierbar (Manifest + Icons vorhanden)

## Ehrliche Einschränkung

In meiner Arbeitsumgebung gibt es kein Netzwerk — `npm install`/`npm run
build` konnte ich nicht selbst ausführen. Der Stand ist statisch
vollständig geprüft (Imports, Typen, ESM-Fallen, ungenutzte Variablen
bei strikter Config). Sollte der Build trotzdem an einer Stelle
stolpern, ist es mit hoher Wahrscheinlichkeit eine Paketversions-
Kleinigkeit: Fehlermeldung schicken, Fix kommt in Minuten.
