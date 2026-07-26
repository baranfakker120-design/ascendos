# AscendOS — Setup komplett vom iPhone (ohne PC, ohne Terminal)

Dieses Setup machst DU genau EINMAL. Danach braucht nie wieder jemand
ein Setup: Seyda und jeder Berater öffnen nur den App-Link und geben
ihren Einladungscode ein. Alles hier läuft im Safari/Chrome-Browser
deines iPhones im Supabase- bzw. Netlify-Dashboard.

Dauer: ca. 20–30 Minuten. Halte bereit: dein Supabase-Projekt
„AscendOS" und einen Gemini-API-Key (aistudio.google.com).

────────────────────────────────────

## Schritt 1 — Project URL & Anon Key notieren

Supabase → Projekt „AscendOS" → ⚙️ Settings → API.
Kopiere **Project URL** und **anon public** key in deine Notizen-App.
(Der anon key darf öffentlich sein — die Daten schützt Row Level
Security. Den **service_role** key NIEMALS irgendwo eintragen.)

## Schritt 2 — Datenbank in einem Rutsch einrichten

Supabase → **SQL Editor** → „New query".
Öffne aus dem Setup-Kit die Datei **`setup/setup-complete.sql`**,
markiere ALLES, kopieren, im SQL Editor einfügen → **Run**.

Das erledigt automatisch: alle Tabellen, alle Sicherheits-Policies,
alle Funktionen, Chogan, Team Seyda, WayToMoon/Präsentation/Fit-Check
als Tools, die 3 Ascent-Agenten, die 7-Tage-Journey, alle 9
Achievements — und erzeugt **zwei Gründer-Codes**.

➡ Ganz unten im Ergebnis stehen **GRUENDER_CODE** (2 Stück).
**Beide sofort in die Notizen-App kopieren** — einer für dich, einer
für Seyda. (Schutz eingebaut: Läuft das Skript versehentlich doppelt,
bricht es ab, statt etwas zu zerstören.)

## Schritt 3 — Die drei Ascent-Functions anlegen

Supabase → **Edge Functions** → „Deploy a new function" →
„Via Editor". Dreimal wiederholen, Name muss EXAKT stimmen:

| Function-Name | Datei aus dem Kit |
|---|---|
| `validate-invite` | `setup/functions/validate-invite.ts` |
| `coach-chat` | `setup/functions/coach-chat.ts` |
| `ingest-knowledge` | `setup/functions/ingest-knowledge.ts` |

Jeweils: kompletten Dateiinhalt in den Editor einfügen → **Deploy**.
Wichtig bei jeder Function: In den Function-Details **„Verify JWT"
für `validate-invite` AUSschalten** (sie muss vor dem Login erreichbar
sein); bei den anderen beiden eingeschaltet lassen.

## Schritt 4 — KI-Schlüssel als Secrets hinterlegen

Supabase → Edge Functions → **Secrets** (Manage secrets):
- `GEMINI_API_KEY` = dein Key von aistudio.google.com
  (der EINZIGE KI-Schlüssel: Ascent-Antworten und Wissenssuche)

Optional, nur falls du ein anderes Modell willst:
- `GEMINI_MODEL` — Coach-Modell (Standard: `gemini-3.5-flash`)
- `GEMINI_FAST_MODEL` — Router/Anonymisierung (Standard: `gemini-3.1-flash-lite`)

Beide Modelle und die Einbettungen sind im kostenlosen Kontingent von
Google enthalten. Ein zweites Konto mit Guthaben brauchst du nicht.

Ohne diese läuft die App trotzdem — nur Ascent meldet sich als
„gerade nicht erreichbar".

## Schritt 5 — Anmeldung konfigurieren

Supabase → **Authentication**:
- Sign In / Providers → **Email** aktiviert lassen
- Settings → **Minimum password length: 8**
- Für den allerersten Test: „Confirm email" AUS — **vor der
  Team-Beta wieder EIN**
- URL Configuration → Site URL + Redirect URL = deine Netlify-Adresse
  (kommt aus Schritt 6; danach hier eintragen)

## Schritt 6 — App online bringen (der EINE ehrliche Sonderfall)

Klartext, warum hier nicht alles per Copy-Paste geht: Der App-Code
muss einmal von Quellcode zu einer Website GEBAUT werden. Das kann
kein Dashboard-Formular — aber es gibt einen Weg, bei dem NETLIFY das
Bauen für immer übernimmt und du nie ein Terminal brauchst:

1. Der Code muss einmalig in ein **GitHub-Repository**. Vom iPhone aus
   geht das über **GitHub Codespaces** (läuft komplett im Browser):
   github.com → neues Repository „ascendos" (privat) → grüner Button
   „Code" → „Create codespace". Dort das Projekt-Zip hochladen
   (Dateien-Symbol → Upload) und im unteren Bereich diese eine
   Copy-Paste-Zeile ausführen:
   `unzip -o ascendos-production.zip && cp -r ascendos/. . && rm -rf ascendos ascendos-production.zip && git add -A && git commit -m "AscendOS" && git push`
   — Ja, das ist technisch eine Terminal-Zeile. Sie ist der einzige
   unvermeidbare Rest, einmalig, und läuft im iPhone-Browser.
   Alternative ohne jede Eingabe: 10 Minuten an irgendeinem PC
   (Freund/Familie) — Zip entpacken, auf github.com per
   „Upload files" hochladen.
2. **netlify.com** (iPhone-Browser) → „Add new site" → „Import an
   existing project" → GitHub → Repo „ascendos" wählen. Build-Befehl
   und Ordner erkennt Netlify automatisch aus dem Projekt.
3. Vor dem ersten Deploy: **Site settings → Environment variables** →
   die zwei Werte aus Schritt 1 eintragen:
   `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` → Deploy.
4. Die fertige Netlify-URL zurück in Schritt 5 (URL Configuration)
   eintragen.

Ab jetzt gilt für immer: Code-Updates erscheinen automatisch —
nie wieder bauen, nie wieder hochladen.

## Schritt 7 — Gründer registrieren & Setup-Check

1. `deine-app.netlify.app/registrieren` öffnen → einen GRUENDER_CODE
   eingeben → es muss erscheinen: „Du wurdest eingeladen zu
   Team Seyda · Chogan" → Konto erstellen.
2. Du landest auf **Tag 1 von 7 deiner Journey**. ✅
3. Unter **Mehr** → Einladungslink erstellen → an Seyda schicken
   (oder ihr den zweiten Gründer-Code geben).
4. Ascent testen: „Wie läuft eine Duftparty ab?" → er sagt ehrlich,
   dass ihm noch Teamdokumente fehlen. Genau richtig — die
   Wissensbasis (docs/wissensbasis-startpaket.md) ist euer nächster
   Inhalts-Schritt; einspielen geht später ebenfalls per Dashboard.

────────────────────────────────────

## Warum kein „Anon-Key-eingeben-und-fertig"-Wizard existiert

Der anon key kann absichtlich KEINE Tabellen anlegen — sonst könnte
jeder Besucher eurer Website eure Datenbank verändern. Vollautomatik
bräuchte einen Supabase-Management-Token (Generalschlüssel über alle
eure Projekte) in einer Webseite — ein Sicherheitsrisiko, das wir
nicht eingehen. Deshalb: Ein einmaliges, geführtes Dashboard-Setup
für den Gründer — und für alle anderen Menschen im Team exakt das,
was du wolltest: Link öffnen, Code eingeben, fertig.
