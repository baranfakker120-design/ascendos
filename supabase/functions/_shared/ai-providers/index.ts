/**
 * Oeffentliche Schnittstelle der Chat-Provider-Abstraktion.
 *
 * coach-chat kennt ausschliesslich diese Datei. Ein neuer Anbieter
 * (Gemini Tier 1, OpenAI, Anthropic, Cloudflare) braucht:
 *   1. eine neue Datei nach dem Muster von groq.ts,
 *   2. einen Eintrag in CHAT_PROVIDER_CHAIN unten.
 * Kein Eingriff im Router, kein Eingriff in coach-chat.
 */

import { cerebrasProvider } from './cerebras.ts';
import { groqProvider } from './groq.ts';
import { openrouterProvider } from './openrouter.ts';
import { chatWithFallback } from './router.ts';
import type { ChatInput, ChatProvider, ChatResult } from './types.ts';

export type { ChatInput, ChatMessage, ChatResult, ProviderErrorCode } from './types.ts';
export { AllProvidersFailedError, ProviderError } from './types.ts';

/**
 * Reihenfolge verbindlich aus dem Auftrag vom 30. Juli 2026:
 * Groq vor OpenRouter vor Cerebras.
 */
export const CHAT_PROVIDER_CHAIN: readonly ChatProvider[] = [
  groqProvider,
  openrouterProvider,
  cerebrasProvider,
];

export async function chat(input: ChatInput): Promise<ChatResult> {
  return chatWithFallback(input, CHAT_PROVIDER_CHAIN);
}
