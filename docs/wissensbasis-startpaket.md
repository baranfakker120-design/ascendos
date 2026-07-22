# Wissensbasis-Startpaket (Sprint 4.5)

18 Dokumente, priorisiert. Die Kategorien sind verbindlich — sie steuern,
welcher Spezialist welches Wissen durchsucht (agents.retrieval_categories):
`prozess` · `recruiting` · `einwaende` · `produkte` · `verkauf` ·
`duftparty` · `verguetung` · `schulung` · `faq`

Dateiname fürs Ingestion-Skript: `<kategorie>__<Titel-mit-Bindestrichen>.md`
Schreibstil: kurz, konkret, in eurer Sprache — der Coach übernimmt euren Ton.
Compliance beim Schreiben: keine Einkommens-/Heilversprechen — was hier
steht, sagt der Coach weiter.

## Priorität 1 — ohne diese startet die Beta nicht (Woche 1)

1. `prozess__Unser-Weg-vom-Lead-zum-Partner.md` — die 5 Phasen, was in
   jeder passiert, wer was tut, typische Dauer
2. `prozess__Follow-up-Rhythmus.md` — wann nachfassen (nach Präsentation,
   nach Fit Check, bei Funkstille), wie oft, wann loslassen
3. `einwaende__Top-10-Einwaende-mit-Antworten.md` — je Einwand: was
   dahintersteckt + eure erprobte Antwort (Keine Zeit, Kein Geld,
   Pyramide?, Muss überlegen, Partner dagegen, …)
4. `recruiting__Der-Business-Fit-Check.md` — Zweck, Ablauf, wie das
   Ergebnis besprochen wird, was danach kommt
5. `recruiting__Der-3-Way-Call.md` — Zweck, Rollen (Berater/Upline),
   Vorbereitung, Ablauf, häufige Fehler
6. `prozess__WayToMoon-und-Praesentation-richtig-einsetzen.md` — wann
   welches Tool, mit welcher Nachricht, was danach

## Priorität 2 — Verkauf & Produkte (Woche 1–2)

7. `duftparty__Duftparty-Ablauf-von-Einladung-bis-Nachfassen.md`
8. `duftparty__Gastgeber-gewinnen-und-briefen.md`
9. `produkte__Produktlinien-im-Ueberblick.md` — Linien, Zielgruppen,
   Preislogik (keine Wirkversprechen!)
10. `produkte__Bestseller-und-Empfehlungslogik.md` — was ihr wem zuerst zeigt
11. `verkauf__Vom-Interessenten-zum-Stammkunden.md` — Nachkauf-Rhythmus,
    Empfehlungen erfragen
12. `verkauf__Erstgespraech-Leitfaden.md` — Einstieg, Fragen, Abschluss

## Priorität 3 — Struktur & Häufige Fragen (Woche 2)

13. `verguetung__Verguetungsplan-einfach-erklaert.md` — Stufen, wie
    Provision entsteht (Fakten, keine Prognosen)
14. `verguetung__Erste-Schritte-zur-ersten-Provision.md`
15. `faq__Haeufige-Fragen-neuer-Partner.md` — Bestellung, Registrierung,
    Starterpaket, erste Woche
16. `faq__Haeufige-Fragen-von-Interessenten.md` — Kosten, Aufwand,
    Kündigung, „Muss ich verkaufen?"
17. `schulung__Social-Media-Grundlagen-Team-Seyda.md` — eure Regeln:
    was posten, was nie (Compliance!)
18. `schulung__Erste-90-Tage-System.md` — Grundlage der späteren
    Onboarding-Journey (Sprint 5): Woche für Woche

## Danach: nachfragegetrieben

Ab Beta-Start wöchentlich `knowledge_gaps` sichten (Studio):

```sql
select question, count(*) as haeufigkeit, max(created_at) as zuletzt
from knowledge_gaps
group by question order by haeufigkeit desc, zuletzt desc limit 25;
```

Die häufigsten Lücken werden die Dokumente 19, 20, 21 … —
die Nutzer sagen euch, was fehlt.
