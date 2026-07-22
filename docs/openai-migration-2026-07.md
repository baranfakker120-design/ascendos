# OpenAI-Only: Audit & Umbau (Juli 2026)

Ergebnis eines vollständigen Durchlaufs über Edge Functions, Shared Files,
Migrationen, Setup-Kit und Frontend. Entscheidungen stehen in ADR-025.

## Provider-Status

| Prüfung | Ergebnis |
|---|---|
| `ANTHROPIC_API_KEY` im Code | 0 Treffer |
| Anthropic-SDK / -Endpunkte | keine |
| Chat-Pfad | ausschließlich OpenAI Responses API (`/v1/responses`) |
| Embeddings | ausschließlich `text-embedding-3-small` (1536 Dim.) |
| `chat/completions` | nicht vorhanden |
| Schlüssel | ausschließlich `OPENAI_API_KEY`, nur in `_shared/llm.ts` |

Verbliebene Nennungen von „Claude" sind Absicht: die Mapping-Funktion muss
den Namen erkennen können, und ADR-024 dokumentiert die Entscheidung, dass
der Schlüssel entfällt.

## Behobene Fehler

| # | Fund | Wirkung ohne Fix |
|---|---|---|
| 1 | Router lief mit `maxTokens: 8` | Reasoning-Token verbrauchen dasselbe Budget → leere Antwort ohne Fehlermeldung |
| 2 | `coach-chat/index.ts` impliziter `any` | `deno check` schlägt fehl, Deploy blockiert |
| 3 | `setup/` nicht in ESLint-/Prettier-Ausnahmen | `npm run lint` und `format:check` scheitern an Deno-Code → CI rot |
| 4 | `validate-invite` enthielt toten LLM-Code | 199 → 74 Zeilen; suggerierte fälschlich einen Bedarf an `OPENAI_API_KEY` |
| 5 | `setup/functions/*` und `setup-complete.sql` handgepflegt | Migration 11 wäre im Dashboard-Setup gefehlt → abweichendes Schema in Produktion |
| 6 | Ingestion: ein API-Call pro Chunk | Laufzeitgrenze bei großen Dokumenten |
| 7 | Ingestion ohne Rollback | halb eingebettetes Dokument, vom Coach als vollständig behandelt |
| 8 | Kein Timeout / kein Retry | hängende Function, Ausfall bei jedem 429 |
| 9 | Fehlender Key → 401 aus dem Upstream | Ursache im Log nicht erkennbar |
| 10 | `PHASE_LABELS[...]` ohne Fallback | „Pipeline-Phase: undefined" im Coach-Kontext |
| 11 | Leere Antwort wurde persistiert | vergiftet den Verlauf bei jedem Folge-Turn |
| 12 | Claude-Mapping nur via `startsWith` | `anthropic/claude-…` fiel durch → 400 von OpenAI |
| 13 | Modell-Baseline `gpt-4.1` | Vorgänger-Generation; `gpt-4.1-nano` bereits mit Abschaltdatum gelistet |

## Verifikation

Ausgeführt: Strict-Typecheck (`strict`, `noUnusedLocals`, `noUnusedParameters`)
für modulare Edge Functions **und** generierte Bundles — fehlerfrei.
Syntaxprüfung 57 Dateien, Import-Auflösung, Alias-Konsistenz vite ↔ tsconfig,
Feature-Grenzen (ADR-012), `$$`-Balance aller Migrationen, Mapping-Tabelle
gegen 10 Eingaben.

Nicht ausführbar in der Prüfumgebung (kein Netzwerkzugang zur npm-Registry):
`npm ci`, `npm run lint`, `npm run test`, `npm run build`. Diese drei laufen
in der CI. Der Typecheck der Edge Functions wurde mit einem Deno-Shim
vollständig nachgestellt.

## Nach dem Deploy zwingend

1. `docs/coach-eval-set.md` einmal komplett durchspielen — Ton und Guardrails
   sind modellabhängig, der Modellwechsel ist kein reiner Infrastruktur-Schritt.
2. Function-Logs auf `Modell "…" nicht verfügbar — Fallback` prüfen. Erscheint
   die Zeile, hat das OpenAI-Konto `gpt-5.6` nicht freigeschaltet; dann
   entweder freischalten oder `OPENAI_MODEL=gpt-4.1` bewusst setzen.
