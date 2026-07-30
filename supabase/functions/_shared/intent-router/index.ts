import { INTENTS } from './intents.ts';
import type { IntentResult } from './types.ts';

/**
 * Ab dieser Konfidenz wird die agentengebundene Kategorie
 * (agent.retrieval_categories) fuer DIESEN Turn ueberschrieben. Darunter
 * bleibt das bestehende Verhalten unangetastet (fallbackToAgent=true) --
 * das ist die Absicherung gegen Regression: ein unsicherer Treffer
 * darf niemals schlechter sein als der bisherige, ungeaenderte Weg.
 */
const MIN_CONFIDENCE = 0.5;

export function classifyIntent(message: string): IntentResult {
  const trimmed = message.trim();
  let best: { id: (typeof INTENTS)[number]['id']; confidence: number; def: (typeof INTENTS)[number] } | null = null;

  for (const def of INTENTS) {
    const confidence = def.test(trimmed);
    if (confidence === null) continue;
    if (!best || confidence > best.confidence) {
      best = { id: def.id, confidence, def };
    }
  }

  if (!best || best.confidence < MIN_CONFIDENCE) {
    return {
      intent: 'unbekannt',
      confidence: best?.confidence ?? 0,
      categories: [],
      skipRag: false,
      searchQuery: trimmed,
      fallbackToAgent: true,
    };
  }

  return {
    intent: best.id,
    confidence: best.confidence,
    categories: best.def.categories,
    skipRag: best.def.skipRag ?? false,
    searchQuery: best.def.rewriteQuery ? best.def.rewriteQuery(trimmed) : trimmed,
    fallbackToAgent: false,
  };
}
