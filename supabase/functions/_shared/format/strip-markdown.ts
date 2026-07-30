/**
 * Entfernt Markdown und normalisiert die Ausgabe auf das im Auftrag
 * erlaubte Zeichenrepertoire. Sprint 3.1, 30. Juli 2026.
 *
 * WARUM MECHANISCH statt nur eine Promptanweisung: Sprachmodelle folgen
 * Formatierungsanweisungen zuverlaessig, aber nicht garantiert -- und
 * die eingebetteten Wissensausschnitte (aus echten Dokumenten) koennen
 * selbst Markdown enthalten, das wortwoertlich in die Antwort
 * uebernommen wird. Eine Anweisung allein wuerde das nicht sicher
 * verhindern. Diese Funktion laeuft NACH der Antwortgenerierung, auf
 * dem tatsaechlichen Text, unabhaengig davon, ob das Modell sich an die
 * Anweisung gehalten hat.
 *
 * Erlaubt bleiben, wie im Auftrag festgelegt: . , : ; ? ! ( ) " ' sowie
 * nummerierte Listen (1. 2. 3.) und Aufzaehlungspunkte (• Punkt).
 */
export function stripMarkdown(text: string): string {
  let s = text;

  // Codebloecke zuerst, bevor einzelne Backticks behandelt werden.
  s = s.replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '').trim());
  // Einzelne Inline-Backticks: Zeichen entfernen, Inhalt behalten.
  s = s.replace(/`([^`]+)`/g, '$1');

  // Ueberschriften: fuehrende Rauten entfernen, Text behalten.
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');

  // Fett/kursiv: **text**, __text__, *text*, _text_ -> text.
  // Reihenfolge wichtig: doppelte Marker vor einfachen behandeln, sonst
  // bleiben einzelne Sternchen uebrig.
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  s = s.replace(/___([^_]+)___/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
  s = s.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');

  // Markdown-Links: [Text](url) -> Text. Bilder: ![Alt](url) -> Alt.
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Zitatzeichen am Zeilenanfang.
  s = s.replace(/^\s{0,3}>\s?/gm, '');

  // Horizontale Trenner: eine Zeile aus nur -, * oder _ (mind. 3).
  s = s.replace(/^\s*([-*_])\1{2,}\s*$/gm, '');

  // Tabellen-Pipes: durch ein Leerzeichen ersetzen, kein Zeichen aus
  // der Verbotsliste beibehalten.
  s = s.replace(/\|/g, ' ');

  // Aufzaehlungszeichen -, * am Zeilenanfang auf den erlaubten
  // Aufzaehlungspunkt "•" vereinheitlichen. Numerierte Listen ("1. ")
  // bleiben unveraendert, sie sind bereits im erlaubten Format.
  s = s.replace(/^\s*[-*]\s+/gm, '• ');

  // Rohes HTML entfernen.
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Ueberzaehlige Leerzeichen und Leerzeilen, die durch das Entfernen
  // entstanden sind, wieder einsammeln.
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split('\n').map((line) => line.trimEnd()).join('\n');

  return s.trim();
}
