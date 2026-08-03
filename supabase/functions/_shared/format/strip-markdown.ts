/**
 * Normalisiert Coach-Antworten für die Premium-Markdown-UI.
 *
 * Früher: stripMarkdown entfernte ** und # mechanisch (Sprint 3.1),
 * weil die App Plaintext erwartete. Jetzt rendert die UI Markdown —
 * wir erhalten Struktur und entfernen nur XSS-/Rauschquellen.
 *
 * Behält: **fett**, Überschriften, Listen, Zitate, Links.
 * Entfernt: Roh-HTML, überzählige Leerzeilen.
 */
export function sanitizeCoachReply(text: string): string {
  let s = text;

  // Roh-HTML entfernen (XSS / Modell-Leak aus Dokumenten).
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Halb kaputte HTML-Entities, die Modelle manchmal aus Docs übernehmen.
  s = s.replace(/&nbsp;/gi, ' ');
  s = s.replace(/&amp;/gi, '&');
  s = s.replace(/&lt;/gi, '<');
  s = s.replace(/&gt;/gi, '>');

  // Überzählige Leerzeichen / Leerzeilen einsammeln.
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  return s.trim();
}

/** @deprecated Alias — bestehende Imports / Tests. */
export function stripMarkdown(text: string): string {
  return sanitizeCoachReply(text);
}
