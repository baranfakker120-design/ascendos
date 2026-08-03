# Sprint 4 — Gamification-Fundament

Phase 1 (Bestandsanalyse) und Phase 2 (Plan). Erstellt 31. Juli 2026.
**Noch nicht umgesetzt.** Warten auf Freigabe für Phase 4.

---

# PHASE 1 — Bestandsanalyse

## 1.1 Blocker: Migrationen 15–17 sind nicht angewendet

Produktion steht auf Migration **14**. Angewendet: 20260721000001 bis 20260801000014.

```
memberships existiert -> NEIN
```

Damit hat die verbindliche Regel „AP gehören zur Mitgliedschaft" **derzeit kein Fundament**. Sprint 2 wurde geschrieben, aber `supabase db reset` und `supabase test db` sind nie gelaufen — die 136 Prüfungen sind unbestätigt.

**Folge:** Sprint 4 kann das Datenmodell nicht bauen, bevor das geklärt ist. Details in Abschnitt 2.9, Schritt 0.

Zweiter, davon abhängiger Punkt: Ich habe in Migration 15 **kein** AP-Feld in `memberships` angelegt. Auch nach dem Anwenden von 15–17 hätten AP keinen Ort. Das ist kein Fehler von 15, sondern eine bewusst offene Stelle, die Sprint 4 füllt.

## 1.2 Was bereits existiert und wiederverwendet wird

Der Bestand ist deutlich tragfähiger als erwartet. Nichts davon wird neu gebaut.

### Ereignisregister `pipeline_events`

14 per CHECK festgelegte Ereignistypen:

```
contact_created, first_touch, follow_up, presentation_sent,
presentation_viewed, fit_check_sent, fit_check_completed,
waytomoon_sent, three_way_call_done, party_scheduled,
party_done, became_customer, registered, correction
```

**Das ist die AP-Quelle.** AP aus belegten Ereignissen statt aus einem Klick auf „erledigt" ist Missbrauchsschutz per Konstruktion — und das ist keine Feinheit, weil bei 30.000 AP echtes Geld fließt. Der Typ `correction` existiert bereits, AP müssen also korrigierbar sein.

### Regelmaschine `achievements.condition` + `check_achievements()`

Bereits fünf Bedingungstypen im Einsatz:

| Typ                 | Beispiel                    |
| ------------------- | --------------------------- |
| `journey_completed` | Onboarding abgeschlossen    |
| `event_count`       | 100 Follow-ups              |
| `phase_count`       | erster Kunde (min_rank 60)  |
| `firstline_count`   | erster gesponserter Partner |
| `downline_count`    | zwei in der Downline        |

9 Auszeichnungen definiert, 5 freigeschaltet. **Ränge, Titel und Seasons erweitern diese Maschine — sie bekommen keine zweite.**

### Katalog-plus-Besitz-Muster

`achievements` (Katalog: org_id, key, title, icon, condition, sort_order, is_active) plus `user_achievements` (Besitz: user_id, achievement_id, unlocked_at).

Genau die Form, die „sichtbar aber gesperrt" braucht. Sammlungen folgen diesem Muster statt einem neuen.

### Weiteres

| Baustein                 | Zustand                                      | Verwendung in Sprint 4                    |
| ------------------------ | -------------------------------------------- | ----------------------------------------- |
| `usage_events`           | 311 Zeilen, 6 Typen inkl. `app_opened`       | Streak-Grundlage, sammelt bereits         |
| `daily_plan_items.score` | integer, vorhanden                           | Verhältnis zu AP zu klären                |
| `features/progress/`     | ProgressPage + progressApi                   | erweitern, nicht ersetzen                 |
| `PhaseBadge`             | 23 Zeilen, funktioniert                      | Muster für `ApBadge`                      |
| Dynamische Importe       | `pdfjs`, `mammoth` bereits verzögert geladen | bewährtes Muster für schwere Bibliotheken |

## 1.3 Was vollständig fehlt

1. **AP-Feld** — nirgends, weder in `profiles` noch in `memberships`.
2. **Profilbild** — `profiles.avatar_url` existiert in der Datenbank, wird im Frontend **nirgends** verwendet. Kein Speicher-Bucket dafür (nur `produktbilder`), keine Profilseite, kein Upload.
3. **Animationsbibliothek** — 7 Laufzeit-Abhängigkeiten, kein three.js, kein R3F, kein GSAP, kein framer-motion.
4. **UI-Primitive** — `shared/ui/` hat nur Alert, Button, Card, Input. Kein Avatar, kein Badge, kein Fortschrittselement.
5. **Verzögertes Laden von Routen** — keine Route nutzt `React.lazy`.

## 1.4 Konflikte

### Eine bewusste frühere Entscheidung wird umgekehrt

`src/features/progress/progressApi.ts`, Zeile 12, wörtlich:

> Progression: echte Meilensteine + rollierendes Wochenfenster (Phase 3: kein Streak-Reset, **keine Punkte** — nur echter Fortschritt).

Sprint 4 führt beides ein. Das ist zulässig, aber es sollte bewusst geschehen: „kein Streak-Reset" war vermutlich gewählt, um Druckmechanik zu vermeiden. Ein 365-Tage-Streak, der bei einem verpassten Tag auf null fällt, ist ein bekannter Angsttreiber. Vorschlag in Abschnitt 2.9, Schritt 9.

### Rollen-Vokabular

Die Datenbank kennt `super_admin`, `admin`, `berater`, `leader`. Das Regelwerk nennt als Rollen `Developer` und `Super Admin`.

- **Developer** hat keinen Ort. Eine Erweiterung der CHECK-Bedingung wäre eine Migration.
- **`admin` und `leader`** existieren in der Datenbank, kommen im Regelwerk nicht vor.
- **Namenskollision:** „Team Leader" ist ein **Rang** bei 30.000 AP, `leader` ist eine **Rolle** in der Datenbank. Gleiches Wort, verschiedene Bedeutung.

Entscheidung nötig, Optionen in Abschnitt 2.4.

### Aufgelöst: Migration 17

Das GO-Dokument sagt „Rollen sind nicht öffentlich sichtbar". Das deckt sich mit Migration 17 (F4 Ä2). **Kein Konflikt mehr.** Rang und Rahmen öffentlich, Rolle nur im eigenen Profil.

### Designsprache

Tokens im Bestand sind zurückhaltend: `--color-bg: #F7F6F3` hell, `--color-accent: #B8935A` Champagner „nur Akzente". Die Assets sind Gold-Rot-Maximalismus.

**Gemessen, gegen meine eigene Erwartung:** Die Assets funktionieren auf dem **hellen** Bestandshintergrund am besten.

| Untergrund            | schlechtester Wert     |
| --------------------- | ---------------------- |
| **#F7F6F3 (Bestand)** | **36,9 % kontrastarm** |
| #4A4D52 Mittelgrau    | 49,5 %                 |
| #0F1012 Dunkel        | 62,2 %                 |

Kein Dark-Mode-Umbau nötig. Die Silberrahmen 01–03 sind der schwächste Fall (35–37 %), aber besser als das Silberlogo damals (55,4 %), weil sie dunkle Kanten haben.

### Maßstab

**1 Organisation, 3 Profile, 4 Kontakte.** Eine „Top 3"-Bestenliste zeigt derzeit buchstäblich alle. Braucht eine Mindestteilnehmerzahl, sonst ist der Hero-Screen sinnlos oder unangenehm.

## 1.5 Leistungsgrundlage

| Posten                        | Gewicht                            |
| ----------------------------- | ---------------------------------- |
| Sprint-4-Assets im Staging    | **28 MB**                          |
| `pdfjs-dist` + `mammoth`      | schwer, aber **verzögert geladen** |
| three.js + R3F, falls ergänzt | ~600 KB bis 1 MB gzip              |

Das Assetgewicht ist das größte praktische Risiko. Strategie in Abschnitt 2.10.

---

# PHASE 2 — Sprint-4-Plan

## 2.1 Ziel

Ein Fundament, auf dem Ränge, Titel, Seasons, Streaks, Events und Sammlerstücke **ohne Umbau** ergänzt werden können. Konkret in Sprint 4 sichtbar: AP, Rang mit Profilrahmen, Profilbild, Fortschrittsanzeige, Rangaufstieg, Berater des Monats.

Leitsatz: **Kataloge sind Daten, keine Konstanten im Code.** Ein neuer Rang, ein neues Sticker-Level, eine neue Season ist ein Datensatz, keine Auslieferung.

## 2.2 Architekturprinzip

```
pipeline_events (Bestand, unveraendert)
        |
        v
   ap_rules (Katalog: Ereignistyp -> AP)
        |
        v
   ap_ledger (fortschreibend, korrigierbar)
        |
        +--> memberships.ap_total (gepufferte Summe, Trigger)
                    |
                    v
              ranks (Katalog: Schwelle -> Rahmen)
                    |
                    v
        cosmetic_items / membership_cosmetics
```

AP sind eine **Projektion über belegte Ereignisse**, kein unabhängiger Zähler. Damit sind sie nachrechenbar, prüfbar und nicht durch Klicks aufblasbar.

## 2.3 Datenmodell

Neue Tabellen in **Migration 18**. Alle org-bezogen, alle nach dem bestehenden Katalog-plus-Besitz-Muster.

### `ap_rules` — beantwortet die offene Frage

```
id, org_id, event_type, ap, season_id (nullable),
valid_from, valid_until, is_active
```

Die bisher fehlende Zuordnung „welche Aktivität bringt wie viele AP" wird **Daten**, nicht Code. Damit ist sie ohne Auslieferung anpassbar, und eine Season kann eigene Sätze haben.

### `ap_ledger` — fortschreibend

```
id, membership_id, delta int, reason text,
source_event_id (FK pipeline_events, nullable),
source_kind text, created_at
```

Warum ein Register und kein reiner Zähler: Nachvollziehbarkeit (die 100 Euro hängen daran), Neuberechenbarkeit, Korrigierbarkeit (`pipeline_events` kennt `correction`), und die Animation „+25 AP" braucht eine Quelle.

`memberships.ap_total` als per Trigger gepflegte Summe — Bestenlisten lesen einen Integer, nicht eine Aggregation.

### `ranks` — Katalog statt Enum

```
id, org_id, key, label, threshold_ap, frame_asset,
sort_order, is_active
```

Startwerte: Newcomer 0, Active 250, Consistent 1.250, Elite 5.000, Legend 15.000, Team Leader 30.000, Mentor 50.000.

Als Tabelle, weil „Diese Werte sollen später leicht anpassbar sein" und „Neue Ränge" ohne Migration möglich sein muss.

### `cosmetic_items` + `membership_cosmetics` — die Sammlung

```
cosmetic_items:       id, org_id, kind, key, label, asset_path,
                      season_id, unlock_condition jsonb,
                      sort_order, is_active
membership_cosmetics: membership_id, item_id, unlocked_at, is_equipped
```

`kind` ∈ `frame | title | badge | event_object`. **Eine** Tabelle für alle kosmetischen Inhalte — neue Titel, Sticker, Rahmen und Seasons brauchen keine neue Tabelle.

`unlock_condition` nutzt **dieselbe jsonb-Form wie `achievements.condition`**, damit `check_achievements` erweitert wird statt verdoppelt.

### `seasons`

```
id, org_id, key, label, starts_at, ends_at, is_active
```

### `payouts` — die 100 Euro

```
id, identity_id (FK profiles, ON DELETE RESTRICT),
kind, amount_cents, currency,
entitled_at, confirmed_paid_at (nullable),
awarded_for_membership_id (nullable, nur Nachweis), note

UNIQUE (identity_id, kind)
```

**Das `UNIQUE (identity_id, kind)` ist der Kern.** Es macht eine Doppelauszahlung strukturell unmöglich — auf Datenbankebene, nicht in Anwendungslogik. Übersteht Austritt und Wiedereintritt nach F2 FD-2, weil es an der Identität hängt.

`ON DELETE RESTRICT` nach F2 Ä6: ein Zahlungsvorgang ist aufbewahrungspflichtig.

**Wichtig:** Das System zahlt **niemals selbst aus**. Es erfasst einen Anspruch (`entitled_at`); ein Mensch bestätigt die Zahlung (`confirmed_paid_at`). Eine automatische Geldbewegung, ausgelöst von einem Punktestand, wäre eine Haftung.

### `monthly_awards` — Berater des Monats

```
id, org_id, period date, place int, membership_id,
ap_in_period int, created_at

UNIQUE (org_id, period, place)
```

### Ohne neue Tabelle

- **Hero-Screen „diesen Monat gesehen"** → `usage_events` mit `event_type='hero_seen'`, Zeitraum in `metadata`. Die Tabelle ist genau dafür da.
- **Streaks** → berechnet aus `usage_events` mit `app_opened`. Ein gepuffertes Feld erst, wenn die Messung es verlangt.

## 2.4 Rollen — Entscheidung nötig

Drei Optionen, ich empfehle B.

| Option | Vorgehen                                                                                                          | Preis                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A      | `developer` in die CHECK-Bedingung von `memberships.role`                                                         | Migration; vermischt Berechtigung und Kosmetik          |
| **B**  | Rolle bleibt Berechtigung (`super_admin`, `admin`, `berater`). „Developer" wird ein **Titel** in `cosmetic_items` | keine Änderung am Rollenmodell, nutzt die neue Sammlung |
| C      | Zweite Spalte `display_role`                                                                                      | dritte Stelle mit Rollenbegriffen                       |

Zur Namenskollision „Team Leader" (Rang) gegen `leader` (Rolle): `leader` ist in Migration 15 bereits als **überholt** markiert. Vorschlag: nicht mehr vergeben, Rang „Team Leader" behält den Namen.

## 2.5 Komponentenstruktur

Zuerst geprüft, was existiert. `PhaseBadge` ist das Muster für Badges, `progressApi` die Grundlage für Fortschritt, `Card`/`Button` bleiben.

### Neue Primitive in `shared/ui/`

| Komponente       | Zweck                                                         |
| ---------------- | ------------------------------------------------------------- |
| `Avatar.tsx`     | Bild plus Initialen-Ersatz, eine Größe als Prop               |
| `RankFrame.tsx`  | Rahmen über Avatar, **mit Positionsdaten je Rahmen**          |
| `ApBadge.tsx`    | Sticker plus **lebende Zahl** darüber                         |
| `EnergyCore.tsx` | Fortschrittsanzeige, Schnittstelle unabhängig von der Technik |

### Neues Feature `features/gamification/`

```
gamificationApi.ts      Abfragen: AP, Rang, Sammlung, Auszeichnungen
RankProgress.tsx        Energiekern plus AP-Stand plus naechste Schwelle
ApTicker.tsx            "+25 AP" beim Eintreffen
RankUpOverlay.tsx       Choreografie beim Aufstieg
HeroScreen.tsx          Berater des Monats, Platz 1 bis 3
CollectionPage.tsx      Sammlung, gesperrt sichtbar
rankLogic.ts            reine Funktionen, testbar ohne Datenbank
```

### Neues Feature `features/profile/`

```
ProfilePage.tsx         Bild, Rahmen, Rang, AP, Statistiken, Auszeichnungen
ProfileEditPage.tsx     "Profil bearbeiten"
AvatarUpload.tsx        Zuschnitt und Upload
```

### Kritisch: Positionsdaten der Rahmen

Aus meinen Messungen — **keine Schätzung**. Jeder Rahmen hat eine andere Öffnung, und keine liegt im Bildmittelpunkt:

| Rahmen | Öffnung   | Vertikaler Versatz |
| ------ | --------- | ------------------ |
| 01     | 657 × 646 | −34 px             |
| 02     | 651 × 638 | −39 px             |
| 03     | 647 × 629 | −44 px             |
| 04     | 656 × 619 | −46 px             |
| 05     | 645 × 523 | −16 px             |
| 06     | 627 × 471 | −8 px              |
| 07     | 598 × 461 | +6 px              |
| 08     | 606 × 499 | +20 px             |
| 09     | 592 × 445 | −10 px             |
| 10     | 598 × 439 | −14 px             |

Der Versatz streut über **66 px**, also 6,4 % der Rahmenbreite. Ein naiv zentriertes Bild sitzt sichtbar schief. Diese Werte gehören als Datentabelle neben die Assets, nicht in verstreute CSS-Regeln.

Zweiter Punkt: Rahmen 01–04 haben eine **runde** Öffnung (Verhältnis 1,02–1,06), Rahmen 05–10 eine **flach ovale** (1,23–1,36). Ein einheitlich rundes Bild passt nicht. Vorschlag: Bild auf die Öffnungsbreite skalieren und vertikal beschneiden, je Rahmen unterschiedlich.

## 2.6 Assetnutzung

| Asset                  | Ort                           | Anzeigegröße               |
| ---------------------- | ----------------------------- | -------------------------- |
| Rahmen 01–09           | Profil, Bestenliste, Sammlung | 96 px Liste, 160 px Profil |
| Rahmen 10 (korrigiert) | nur Hero-Screen Platz 1       | 320 px                     |
| AP-Sticker 25–1000     | an Aufgaben und Belohnungen   | 48–64 px                   |

**Der fehlerhafte `frame-10-upload.png` wird nicht ausgeliefert.** Er bleibt im Staging als Nachweis, bis du das Löschen freigibst.

### Zur Sticker-Lesbarkeit

Gemessen: 250 und 500 sind bei 48 px zu **86 %** identisch. Deine Farbregel bleibt unangetastet — die Zahl wird stattdessen als **lebender Text** über den Sticker gelegt. Der Sticker bleibt dekorativ in Gold-Rot, die Zahl bleibt bei jeder Größe scharf. Nebeneffekt: neue Werte wie 75 oder 2000 brauchen kein neues Asset, und Türkisch bekommt „PUAN" ohne Neurender.

## 2.7 Animationen — meine Empfehlung weicht ab

Das Regelwerk nennt three.js, React Three Fiber und GSAP. **Ich empfehle, in Sprint 4 keine dieser drei aufzunehmen.** Begründung, weil du „denke performant" und Mobile-Optimierung ausdrücklich verlangst:

- 28 MB Assets sind schon das größte Risiko. Zusätzlich 600 KB bis 1 MB für eine 3D-Pipeline auf Geräten, mit denen Berater unterwegs arbeiten, verschlechtert genau das, was die Wirkung tragen soll.
- Alles Geforderte — Glow, Bloom, Partikel, Lichtlauf, Pulsieren, Energiekern, Reflexion — ist mit **CSS** (`conic-gradient`, `blur`, `mask`, `@property` für animierbare Eigenschaften) plus einer kleinen **Canvas-2D-Partikelschicht** erreichbar. Beides bereits im Browser, null zusätzliche Bytes.
- „Lieber wenige Animationen. Dafür perfekte Animationen." Eine sauber ausgeführte CSS-Choreografie wirkt hochwertiger als eine flach benutzte 3D-Pipeline.

**Modularität bleibt gewahrt:** `EnergyCore` bekommt eine Schnittstelle, die von der Technik unabhängig ist (`ap`, `threshold`, `state`). Eine WebGL-Fassung ist später ein Austausch hinter denselben Eigenschaften, kein Umbau.

Falls du three.js dennoch willst: dann **verzögert geladen**, nach dem Muster, das `pdfjs` im Bestand schon nutzt — und nur für den Rangaufstieg, nicht für die Dauerdarstellung.

Für die Choreografie beim Aufstieg genügt die eingebaute Web Animations API. GSAP (~25 KB) wäre vertretbar, aber erst wenn sich zeigt, dass die Sequenz von Hand unhandlich wird. Sprint 4 fügt vorerst **keine** Abhängigkeit hinzu.

## 2.8 Reihenfolge — Risiko zuerst

| Schritt | Inhalt                                                                 | Warum hier                                    |
| ------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| **0**   | Migrationen 15–17 anwenden und validieren (136 Prüfungen)              | **Blocker.** Ohne `memberships` kein AP       |
| 1       | Migration 18: Datenmodell aus 2.3, plus AP-Trigger und Regeln          | Fundament                                     |
| 2       | Asset-Pipeline: Skript erzeugt optimierte WebP nach `public/`          | vor jeder UI, sonst wird mit 28 MB entwickelt |
| 3       | Speicher-Bucket `avatare` plus Zugriffsregeln                          | Voraussetzung für Profilbild                  |
| 4       | `shared/ui`: Avatar, RankFrame, ApBadge — **statisch, ohne Animation** | erst korrekt, dann schön                      |
| 5       | `features/profile`: Profilseite und Bearbeitung                        | sichtbarer Nutzen früh                        |
| 6       | AP-Anzeige und EnergyCore, zunächst ohne Effekte                       | Zahlen müssen stimmen                         |
| 7       | Animationen: ApTicker, Pulsieren, Rangaufstieg                         | jetzt die Wirkung                             |
| 8       | Hero-Screen Berater des Monats                                         | braucht 4 bis 7                               |
| 9       | Streaks                                                                | zuletzt, kehrt eine frühere Entscheidung um   |

Nach jedem Schritt: Typprüfung, Testlauf, kurze Zusammenfassung, wie von dir verlangt.

## 2.9 Risiken

| Risiko                        | Schwere  | Umgang                                                                                                                                                                          |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrationen 15–17 unvalidiert | **hoch** | Schritt 0, vor allem anderen                                                                                                                                                    |
| 100 Euro echtes Geld          | **hoch** | `UNIQUE (identity_id, kind)`, plus getrennter `confirmed_paid_at` durch einen Menschen. Kein automatischer Zahlungsauslöser                                                     |
| AP-Sätze unbestimmt           | **hoch** | `ap_rules` ist vorbereitet, aber die **Werte fehlen**. Ohne sie sind die Schwellen unverankert                                                                                  |
| Assetgewicht 28 MB            | mittel   | Abschnitt 2.10                                                                                                                                                                  |
| 3 Nutzer, „Top 3"             | mittel   | Mindestteilnehmerzahl, sonst kein Hero-Screen                                                                                                                                   |
| Streak-Druck                  | mittel   | Vorschlag: Streak zählt hoch, **fällt nicht auf null**, sondern verliert langsam. Behält die Motivation, vermeidet die Angst — im Sinne der ursprünglichen Phase-3-Entscheidung |
| Doppelte Punktzählung         | mittel   | `ap_ledger.source_event_id` eindeutig je Ereignis und Regel                                                                                                                     |

### Zur AP-Rate, weil sie über echtes Geld entscheidet

Abstände: 250, 1.000, 3.750, 10.000, 15.000, 20.000 — zusammen 50.000 bis Mentor.

| AP pro Tag | Team Leader (30.000) und damit 100 Euro |
| ---------- | --------------------------------------- |
| 100        | rund 10 Monate                          |
| 200        | rund 5 Monate                           |
| 500        | rund 2 Monate                           |

Ich brauche von dir die Zuordnung Ereignis zu AP, oder ich schlage einen Satz vor und du korrigierst.

## 2.10 Leistungsstrategie

### Assets: von 28 MB auf unter 1 MB

Die Quellen sind 1024 px, angezeigt werden maximal 320 px. Das ist dreifach bis zehnfach überdimensioniert.

| Ausgabe      | Größe       | Zweck                                 |
| ------------ | ----------- | ------------------------------------- |
| Rahmen groß  | 320 px WebP | Hero, Profil                          |
| Rahmen klein | 96 px WebP  | Listen, Sammlung                      |
| Sticker      | 96 px WebP  | 48 px Anzeige bei doppelter Auflösung |

Geschätzt 25 Dateien, je 15 bis 40 KB, zusammen unter 1 MB. Etwa **Faktor 30**. Originale bleiben in `docs/brand`, werden nicht ausgeliefert.

Erzeugt von einem Skript nach dem Muster von `generate-brand-assets.py` — reproduzierbar, nicht von Hand.

### Weiteres

- **Rahmen vorausladen** nur für den eigenen Rang und die Nachbarstufen, nicht alle zehn.
- **Hero-Screen verzögert laden** — er erscheint einmal im Monat, gehört nicht ins Startpaket.
- **Bestenliste liest `ap_total`**, keine Aggregation über das Register.
- **`prefers-reduced-motion` respektieren** — Animationen abschaltbar, nicht nur leiser.

### Mobile

- Berührungsflächen mindestens 44 px, wie im Bestand.
- Hero-Screen überspringbar durch Antippen **irgendwo**, nicht nur auf einer kleinen Schaltfläche.
- Partikelzahl an die Bildschirmgröße koppeln, nicht fest.
- Energiekern ohne Layoutverschiebung animieren (`transform` und `opacity`), damit kein Neuberechnen der Seite entsteht.

---

# Offene Punkte für dich

1. **Migrationen 15–17**: anwenden und validieren? Ohne das kein Sprint 4.
2. **AP-Sätze**: welche Ereignisse bringen wie viele Punkte?
3. **Rollen**: Option A, B oder C aus 2.4?
4. **Titel**: an der Mitgliedschaft oder an der Identität? („Founder" klingt nach Person, AP hängen an der Mitgliedschaft.)
5. **three.js**: meine Empfehlung dagegen annehmen, oder soll ich es verzögert geladen aufnehmen?
6. **Streak**: langsam verlieren statt auf null fallen — einverstanden?
7. **Mindestteilnehmerzahl** für den Hero-Screen: ab wie vielen aktiven Mitgliedern?
8. **`frame-10-upload.png`** (fehlerhafter Text) löschen?
