import type { IntentDefinition } from './types.ts';

/**
 * Ein Eintrag je Intent. Ein neuer Intent bedeutet: ein neues Objekt
 * an dieses Array anhaengen. Kein Eingriff in index.ts oder in andere
 * Intents noetig -- das ist die geforderte Erweiterbarkeit.
 *
 * Kategorienamen sind bewusst identisch mit den bereits vorhandenen
 * Werten in agents.retrieval_categories (produkte, verguetung,
 * recruiting, einwaende, duftparty, prozess, schulung, faq, verkauf).
 * Es wird keine neue Kategorie erfunden, keine Migration noetig.
 */

const wordBoundary = (words: string[]) =>
  new RegExp(`\\b(${words.join('|')})\\b`, 'i');

// ------------------------------------------------------------
// 1. Duftnummer -- reiner Zahlenmuster-Treffer, hoechste Praezision.
// ------------------------------------------------------------
const NUR_ZAHL = /^\s*#?\s*(\d{1,4})\s*[.?!]?\s*$/;
const ZAHL_MIT_KONTEXT = /\b(duft|parfum|nummer|nr\.?)\b[^\d]{0,20}(\d{1,4})\b|\b(\d{1,4})\b[^\d]{0,20}\b(duft|parfum|nummer)\b/i;

export const duftNummer: IntentDefinition = {
  id: 'duft_nummer',
  label: 'Duftnummer',
  categories: ['produkte'],
  test(message) {
    if (NUR_ZAHL.test(message)) return 0.95;
    if (ZAHL_MIT_KONTEXT.test(message)) return 0.9;
    return null;
  },
  rewriteQuery(message) {
    const num = message.match(/\d{1,4}/)?.[0] ?? message;
    return `Chogan Parfum Duftnummer ${num}`;
  },
};

// ------------------------------------------------------------
// 2. Duftname -- bekannte Referenzduefte aus dem Auftrag.
//
//    WICHTIG, ehrlich benannt: Diese Liste ist eine Startliste aus
//    den vier vom Betreiber genannten Beispielen, KEINE vollstaendige
//    Duftdatenbank. Sie waechst durch Ergaenzen der Liste unten, ohne
//    Codeaenderung an der Logik.
//
//    KEINE Kurznachrichten-Heuristik ("kurze Nachricht = wahrscheinlich
//    ein Duftname"): eine erste Fassung hatte das versucht und dabei
//    per Testlauf nachgewiesen bekommen, dass sie einen blossen
//    Vornamen wie "Sarah" faelschlich als Duftname einordnete --
//    genau die Art Vermutung, die der Auftrag ausdruecklich
//    ausschliesst ("keine Vermutungen"). Ohne verlaessliches Merkmal,
//    das einen Duftnamen von jedem anderen kurzen Wort unterscheidet,
//    ist der einzige tragfaehige Weg die explizite Liste.
// ------------------------------------------------------------
const BEKANNTE_DUEFTE = ['hypnose', 'libre', 'erba pura', 'alien'];
const DUFT_KEYWORD = wordBoundary(BEKANNTE_DUEFTE.map((d) => d.replace(' ', '\\s+')));

export const duftName: IntentDefinition = {
  id: 'duft_name',
  label: 'Duftname',
  categories: ['produkte'],
  test(message) {
    return DUFT_KEYWORD.test(message) ? 0.85 : null;
  },
  rewriteQuery(message) {
    return `Chogan Parfum Duft ${message.trim()}`;
  },
};

// ------------------------------------------------------------
// 3. Produkte -- konkrete Produktlinien-Namen aus dem Auftrag.
// ------------------------------------------------------------
const PRODUKTLINIEN = ['aurodhea', 'peptilux', 'brilhome', 'lolüm', 'lolum', 'kleyes'];
const PRODUKT_KEYWORD = wordBoundary(PRODUKTLINIEN);

export const produkte: IntentDefinition = {
  id: 'produkte',
  label: 'Produkte',
  categories: ['produkte'],
  test(message) {
    return PRODUKT_KEYWORD.test(message) ? 0.9 : null;
  },
};

// ------------------------------------------------------------
// 4. Business -- Verguetungsplan und Kennzahlen.
// ------------------------------------------------------------
const BUSINESS_KEYWORD = wordBoundary([
  'vergütungsplan', 'verguetungsplan', 'ap', 'icp', 'provision', 'aktivpunkte', 'aktivpunkt',
]);

export const business: IntentDefinition = {
  id: 'business',
  label: 'Business',
  categories: ['verguetung', 'faq'],
  test(message) {
    return BUSINESS_KEYWORD.test(message) ? 0.85 : null;
  },
};

// ------------------------------------------------------------
// 5. Recruiting -- deckt sich mit den Kategorien des bestehenden
//    recruiting-Agenten (agents.retrieval_categories).
// ------------------------------------------------------------
const RECRUITING_KEYWORD = wordBoundary([
  'einwand', 'einwände', 'einwaende', 'preis', 'nachfassen', 'einladung', 'kein interesse',
]);

export const recruiting: IntentDefinition = {
  id: 'recruiting',
  label: 'Recruiting',
  categories: ['recruiting', 'einwaende', 'prozess'],
  test(message) {
    return RECRUITING_KEYWORD.test(message) ? 0.85 : null;
  },
};

// ------------------------------------------------------------
// 6. Duftparty.
// ------------------------------------------------------------
const DUFTPARTY_KEYWORD = wordBoundary([
  'duftparty', 'gastgeber', 'gastgeberin', 'bestellformular', 'vorbereitung',
]);

export const duftparty: IntentDefinition = {
  id: 'duftparty',
  label: 'Duftparty',
  categories: ['duftparty'],
  test(message) {
    return DUFTPARTY_KEYWORD.test(message) ? 0.85 : null;
  },
};

// ------------------------------------------------------------
// 7. Kontakte -- KEINE Wissenskategorie. Kontaktdaten liegen in
//    public.contacts, nicht in knowledge_docs. Erkennung beschraenkt
//    sich auf die vom Auftrag genannten CRM-Begriffe; beliebige
//    Vornamen (Beispiel "Sarah") lassen sich ohne Namensdatenbank oder
//    einen weiteren KI-Aufruf nicht zuverlaessig erkennen und werden
//    hier bewusst NICHT geraten. Ist ein Kontakt bereits ueber
//    contactId ausgewaehlt, liefert der bestehende Mechanismus
//    (KONTAKT-KONTEXT) ohnehin unabhaengig von diesem Intent die
//    Kontaktdaten.
// ------------------------------------------------------------
const KONTAKTE_KEYWORD = wordBoundary(['whatsapp', 'kunde', 'kundin', 'follow-up', 'followup']);

export const kontakte: IntentDefinition = {
  id: 'kontakte',
  label: 'Kontakte',
  categories: [],
  skipRag: true,
  test(message) {
    return KONTAKTE_KEYWORD.test(message) ? 0.7 : null;
  },
};

// ------------------------------------------------------------
// 8. Aufgaben -- KEINE Wissenskategorie. Der Tagesplan liegt in
//    daily_plan_items, nicht in knowledge_docs. Diese Tabelle wird
//    hier bewusst NICHT gelesen (Auftrag: "Heute" nicht aendern).
//    Stattdessen RAG ueberspringen und das Modell ehrlich sagen
//    lassen, dass es den Tagesplan nicht direkt einsehen kann, statt
//    einen zu erfinden.
// ------------------------------------------------------------
const AUFGABEN_KEYWORD = wordBoundary([
  'heute', 'meine aufgaben', 'was soll ich heute', 'was soll ich tun', 'tagesplan',
]);

export const aufgaben: IntentDefinition = {
  id: 'aufgaben',
  label: 'Aufgaben',
  categories: [],
  skipRag: true,
  test(message) {
    return AUFGABEN_KEYWORD.test(message) ? 0.75 : null;
  },
};

/**
 * Reihenfolge hier ist nur die Fallback-Reihenfolge bei exakten
 * Konfidenz-Gleichstaenden. Die eigentliche Auswahl in classify()
 * nimmt immer den hoechsten Konfidenzwert ueber ALLE Definitionen,
 * nicht die erste Übereinstimmung -- ein neuer Intent unten anhaengen
 * aendert daher nie das Verhalten bestehender Intents.
 */
export const INTENTS: IntentDefinition[] = [
  duftNummer,
  produkte,
  business,
  recruiting,
  duftparty,
  kontakte,
  aufgaben,
  duftName, // zuletzt: enthaelt die unspezifischste Fallback-Heuristik
];
