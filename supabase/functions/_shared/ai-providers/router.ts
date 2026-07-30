import type { AttemptLog, ChatInput, ChatProvider, ChatResult } from './types.ts';
import { AllProvidersFailedError, ProviderError } from './types.ts';

/**
 * Durchlaeuft die Anbieterkette in Reihenfolge und gibt das erste
 * erfolgreiche Ergebnis zurueck. Wirft AllProvidersFailedError, wenn
 * jeder Anbieter gescheitert ist.
 *
 * WARUM DAS DIE VORGABE "SQL-, Auth- und RLS-Fehler loesen NIE einen
 * Wechsel aus" bereits strukturell erfuellt: providers[i].chat() ruft
 * ausschliesslich fetch() gegen einen externen Anbieter auf. Es gibt in
 * diesem Pfad keinen Zugriff auf Supabase, keine Authentifizierung,
 * keine RLS. Ein Fehler, der hier ankommt, KANN also nur ein
 * Anbieterfehler sein. Es braucht deshalb keine Fallunterscheidung "ist
 * das ein Fehler, bei dem gewechselt werden darf" — jeder Fehler, den
 * diese Funktion sieht, ist per Konstruktion einer.
 *
 * Der vollstaendige Gespraechskontext (system, messages) wird bei jedem
 * Versuch UNVERAENDERT an den naechsten Anbieter weitergereicht. Aus
 * Sicht des Beraters ist ein Wechsel dadurch nicht bemerkbar, ausser an
 * der Antwortzeit.
 */
export async function chatWithFallback(
  input: ChatInput,
  providers: readonly ChatProvider[],
): Promise<ChatResult> {
  const attempts: AttemptLog[] = [];

  for (const provider of providers) {
    const attemptStart = Date.now();
    try {
      const result = await provider.chat(input);
      attempts.push({
        provider: provider.name,
        ok: true,
        model: result.model,
        latencyMs: Date.now() - attemptStart,
      });
      logAttempts(attempts, provider.name);
      return result;
    } catch (err) {
      const providerError =
        err instanceof ProviderError
          ? err
          : new ProviderError('upstream', provider.name, err instanceof Error ? err.message : String(err));

      attempts.push({
        provider: provider.name,
        ok: false,
        code: providerError.code,
        message: providerError.message,
        latencyMs: Date.now() - attemptStart,
      });

      const naechster = providers[providers.indexOf(provider) + 1]?.name;
      console.error(
        `ASCENDOS Providerwechsel: ${provider.name} fehlgeschlagen [${providerError.code}] ` +
          `${providerError.message}${naechster ? ` -> naechster Versuch: ${naechster}` : ' -> keine weiteren Anbieter'}`,
      );
      // kein return, kein throw: die Schleife faehrt mit dem naechsten
      // Anbieter fort. Das IST der Fallback.
    }
  }

  logAttempts(attempts, null);
  throw new AllProvidersFailedError(attempts);
}

function logAttempts(attempts: AttemptLog[], erfolgreich: string | null): void {
  // Strukturiert statt Fliesstext, damit es maschinell auswertbar
  // bleibt, wie ADR-019 es fuer Coach-Metriken bereits vorschreibt.
  // Enthaelt bewusst keine Gespraechsinhalte, nur Betriebsdaten.
  console.log(
    JSON.stringify({
      metric: 'ai_provider_chain',
      attempts,
      successfulProvider: erfolgreich,
      totalLatencyMs: attempts.reduce((sum, a) => sum + a.latencyMs, 0),
    }),
  );
}
