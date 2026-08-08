# Meta / Instagram — Data Deletion Request URL

Technische Dokumentation für die AscendOS-Implementierung der Meta **Data Deletion Request Callback**.

## Endpoint (bei Meta eintragen)

```
https://shaydtihwicnocjjlnjm.supabase.co/functions/v1/meta-data-deletion
```

Feld in der Meta App: **URL für Anfrage zur Datenlöschung** / **Data Deletion Request URL**  
(App Dashboard → Einstellungen / Settings → Basis / Basic)

> Dies ist die produktive Supabase Edge Function des AscendOS-Projekts `shaydtihwicnocjjlnjm`.  
> Es gibt keinen zusätzlichen SPA-`/api/...`-Proxy — Meta ruft die Edge Function direkt auf.

## HTTP-Methode

| Methode   | Zweck                                                                |
| --------- | -------------------------------------------------------------------- |
| `POST`    | Meta Data-Deletion-Callback (`signed_request`)                       |
| `GET`     | Statusseite für Nutzer: `?code=<confirmation_code>` (menschenlesbar) |
| `OPTIONS` | CORS-Preflight                                                       |

## Request (Meta → AscendOS)

- **Content-Type:** typischerweise `application/x-www-form-urlencoded`
- **Body-Feld:** `signed_request=<sig>.<payload>`
- **Auth:** kein AscendOS-Login, kein User-JWT
- Die Signatur wird mit `META_APP_SECRET` (HMAC-SHA256) geprüft
- Manipulierte / unvollständige Requests → `400` / `403`

Beispiel-Payload nach Verifikation:

```json
{
  "algorithm": "HMAC-SHA256",
  "expires": 1291840400,
  "issued_at": 1291836800,
  "user_id": "218471"
}
```

`user_id` entspricht der Meta-/Instagram-Benutzer-ID und wird mit `content_instagram_connections.ig_user_id` abgeglichen.

## Response (AscendOS → Meta)

Bei gültiger Signatur HTTP `200` mit JSON:

```json
{
  "url": "https://shaydtihwicnocjjlnjm.supabase.co/functions/v1/meta-data-deletion?code=ABC123…",
  "confirmation_code": "ABC123…"
}
```

- `confirmation_code`: alphanumerisch
- `url`: öffentlich erreichbare Statusseite zur Anfrage

## Was bei erfolgreicher Zuordnung gelöscht / invalidiert wird

Nur Meta-/Instagram-Integrationsdaten des **eindeutig** gefundenen `ig_user_id`:

| Aktion                 | Ziel                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| Token invalidieren     | `content_instagram_connections.token_ref` → `null`                   |
| IG-Identität entfernen | `ig_user_id`, `ig_username` → `null`; `scopes` → `[]`                |
| Status                 | `disconnected`, `disconnected_at` gesetzt                            |
| Publish-Stubs          | zugehörige `content_publish_attempts` (über `connection_id`) löschen |
| Audit                  | Zeile in `meta_data_deletion_requests` (Bestätigungscode + Status)   |

**Nicht** betroffen: Profile, Memberships, Kontakte, Content-Assets/Drafts anderer oder desselben AscendOS-Users außerhalb der Instagram-Verbindung, Daten anderer Benutzer.

Wenn keine Zeile mit passender `ig_user_id` existiert: trotzdem gültige Meta-Antwort (`status: not_found` intern); keine anderen Daten werden geändert.

## Deploy / Secrets

```bash
# Migration (Tracking-Tabelle + Index)
supabase db push --project-ref shaydtihwicnocjjlnjm

# Function öffentlich (ohne JWT-Gate; Signaturprüfung im Code)
supabase functions deploy meta-data-deletion --no-verify-jwt --project-ref shaydtihwicnocjjlnjm
```

Benötigte Edge-Secrets (bereits für Instagram OAuth vorgesehen):

| Secret                                       | Verwendung                                        |
| -------------------------------------------- | ------------------------------------------------- |
| `META_APP_SECRET`                            | Signaturprüfung von `signed_request`              |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | DB-Zugriff (service role)                         |
| `APP_ORIGIN` (optional)                      | Link zur Datenschutzerklärung auf der Statusseite |

**Nicht** ändern für dieses Feature: `META_REDIRECT_URI`, OAuth-Scopes, `instagram-oauth`-Logik.

## Architektur-Hinweis

- Neuer Endpoint: Edge Function `meta-data-deletion` (kein zweiter OAuth-Callback)
- Bestehende Function `instagram-oauth` bleibt unverändert
- Frontend enthält keine Secrets und keinen Token-Zugriff
- Dashboard-Bundle: `setup/functions/meta-data-deletion.ts` (über `npm run bundle:functions`)

## Quellcode

| Datei                                                                | Rolle            |
| -------------------------------------------------------------------- | ---------------- |
| `supabase/functions/meta-data-deletion/index.ts`                     | Endpoint         |
| `supabase/functions/_shared/meta/signedRequest.ts`                   | Signaturprüfung  |
| `supabase/migrations/20260821000034_meta_data_deletion_requests.sql` | Tracking-Tabelle |
| `docs/meta-data-deletion.md`                                         | diese Doku       |
