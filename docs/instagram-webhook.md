# Instagram Webhook (Phase 5A)

Öffentlicher Meta-/Instagram-Webhook-Endpoint für AscendOS.  
**Scope:** Verifizierung + Empfang/Validierung. Keine Veröffentlichung, keine Side-Effects.

## Webhook-URL (bei Meta eintragen)

```
https://shaydtihwicnocjjlnjm.supabase.co/functions/v1/instagram-webhook
```

Ort in Meta: App Dashboard → Instagram → Webhooks → Callback URL  
Verify Token: derselbe Wert wie Edge-Secret `WEBHOOK_VERIFY_TOKEN`

## Secrets

| Secret                 | Pflicht | Verwendung                               |
| ---------------------- | ------- | ---------------------------------------- |
| `WEBHOOK_VERIFY_TOKEN` | ja      | GET `hub.verify_token`                   |
| `META_APP_SECRET`      | ja      | POST `X-Hub-Signature-256` (HMAC-SHA256) |

Keine Secrets in Responses oder Logs.

## Deploy

```bash
supabase functions deploy instagram-webhook --no-verify-jwt --use-api --project-ref shaydtihwicnocjjlnjm
```

`verify_jwt` muss **aus** sein — Meta sendet keinen AscendOS-JWT.

## Verhalten

| Methode   | Zweck                                                                 |
| --------- | --------------------------------------------------------------------- |
| `GET`     | Subscription-Verify: `hub.mode=subscribe` + Token → Body = challenge  |
| `POST`    | Event-Notification: Signatur prüfen, strukturiert loggen, `{ok:true}` |
| `OPTIONS` | CORS-Preflight                                                        |

Falscher Verify-Token oder ungültige Signatur → HTTP `403`.

## Testen

### GET-Verifizierung (lokal/curl)

```bash
curl -sS -D - \
  "https://shaydtihwicnocjjlnjm.supabase.co/functions/v1/instagram-webhook?hub.mode=subscribe&hub.verify_token=DEIN_TOKEN&hub.challenge=1158201444"
# erwartet: HTTP 200, Body exakt 1158201444
```

Falsches Token:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  "https://shaydtihwicnocjjlnjm.supabase.co/functions/v1/instagram-webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1"
# erwartet: 403
```

### POST mit Signatur

```bash
BODY='{"object":"instagram","entry":[{"id":"0","time":1}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" | awk '{print $2}')
curl -sS -D - -X POST \
  "https://shaydtihwicnocjjlnjm.supabase.co/functions/v1/instagram-webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  --data "$BODY"
# erwartet: HTTP 200 {"ok":true}
```

## Meta-Einstellungen (Punkt 3)

1. Callback URL = die URL oben
2. Verify Token = Wert von `WEBHOOK_VERIFY_TOKEN`
3. Verifizieren und speichern (Meta sendet GET)
4. Object/Fields abonnieren, die für eure Phase relevant sind (z. B. Instagram-Felder laut Dashboard)
5. **Nicht** ändern: OAuth Redirect URI, Data Deletion URL, akzeptierte Permissions

## Architektur

| Datei                                             | Rolle            |
| ------------------------------------------------- | ---------------- |
| `supabase/functions/instagram-webhook/index.ts`   | Endpoint         |
| `supabase/functions/_shared/meta/hubSignature.ts` | HMAC-Prüfung     |
| `setup/functions/instagram-webhook.ts`            | Dashboard-Bundle |

Unverändert: `instagram-oauth`, `meta-data-deletion`, Content-Functions.
