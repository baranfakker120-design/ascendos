/**
 * Intent-Router: erkennt PRO NACHRICHT, welche Wissenskategorie
 * durchsucht werden soll. Sprint 3.1, 30. Juli 2026.
 *
 * ABGRENZUNG zum bestehenden Router (prompts.ts, ROUTER_PROMPT):
 * Jener laeuft EINMAL pro Konversation und waehlt einen von drei
 * Spezialisten (recruiting/sales/knowledge) fuer die TONALITAET der
 * ganzen Unterhaltung. Dieser Router hier laeuft bei JEDER Nachricht
 * neu und bestimmt nur, WELCHE Kategorien fuer DIESEN einen Turn
 * durchsucht werden. Eine Unterhaltung kann mit einer
 * Recruiting-Frage beginnen und mitten drin nach einer Duftnummer
 * fragen -- der alte Router wuerde das nicht bemerken, weil er nur
 * beim ersten Turn entscheidet. Beide Mechanismen bestehen
 * nebeneinander, keiner ersetzt den anderen.
 *
 * BEWUSST REGELBASIERT, kein weiterer KI-Aufruf: Der Auftrag verlangt
 * "keine Vermutungen, keine Halluzinationen". Ein deterministischer
 * Klassifikator kann per Konstruktion nicht halluzinieren, kostet
 * keine zusaetzliche Anbieteranfrage (kein weiterer Punkt, an dem
 * Groq/OpenRouter/Cerebras ausfallen koennten) und ist mit
 * gewoehnlichen Tests beweisbar, nicht nur behauptbar.
 */

export type IntentId =
  | 'duft_nummer'
  | 'duft_name'
  | 'produkte'
  | 'business'
  | 'recruiting'
  | 'duftparty'
  | 'kontakte'
  | 'aufgaben';

export interface IntentMatch {
  /** null, falls dieser Intent nicht zutrifft. */
  confidence: number;
}

export interface IntentDefinition {
  id: IntentId;
  /** Kurze Bezeichnung fuers Log, nicht fuer den Nutzer bestimmt. */
  label: string;
  /**
   * Prueft die Nachricht. Gibt eine Konfidenz zwischen 0 und 1 zurueck,
   * oder null, wenn der Intent nicht zutrifft. Rein, ohne Seiteneffekt
   * -- deshalb ohne Weiteres einzeln testbar.
   */
  test(message: string): number | null;
  /**
   * Wissenskategorien fuer match_knowledge. Leeres Array bedeutet:
   * dieser Intent hat KEINE Wissenskategorie (siehe skipRag).
   * Namen decken sich bewusst mit den bereits vorhandenen Werten in
   * agents.retrieval_categories, keine neue Kategorie erfunden.
   */
  categories: string[];
  /**
   * true bei Intents, die keine Wissensfrage sind, sondern
   * strukturierte Nutzerdaten betreffen (Kontakte, Aufgaben). Diese
   * Daten liegen NICHT in knowledge_docs, sondern in eigenen Tabellen.
   * match_knowledge dafuer aufzurufen wuerde in der falschen Quelle
   * suchen und koennte eine falsche Antwort erzeugen. Stattdessen wird
   * RAG uebersprungen und dem Modell ein kurzer Hinweis mitgegeben,
   * ehrlich zu sagen, dass es diese Daten nicht direkt einsehen kann.
   */
  skipRag?: boolean;
  /**
   * Optionale Umschreibung der Suchanfrage vor dem Einbetten. Ein
   * bloßes "129" liefert als Einbettung kaum brauchbare Naehe zu
   * einem Dokument, das "Duftnummer 129: ..." sagt. Mit Kontext
   * angereichert trifft die Vektorsuche deutlich zuverlaessiger.
   */
  rewriteQuery?: (message: string) => string;
}

export interface IntentResult {
  intent: IntentId | 'unbekannt';
  confidence: number;
  categories: string[];
  skipRag: boolean;
  searchQuery: string;
  /** true, wenn kein Intent mit ausreichender Konfidenz traf und auf
   *  die bestehende, agentengebundene Kategorie zurueckgefallen wurde. */
  fallbackToAgent: boolean;
}
