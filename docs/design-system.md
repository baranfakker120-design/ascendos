# AscendOS Design System — v1 (Brand Foundation)

Grundlage: Logo-Familie AscendOS · Chogan · Essence Tribe · Team Şeyda.
Gemeinsame DNA: Monochrom, geometrisch, großzügiger Weißraum, dünne
Versalien mit weiter Laufweite, Premium-Ruhe statt SaaS-Lautstärke.

## 1. Markenentscheidungen (verbindlich)

- **Der KI-Coach heißt „Ascent".** Kurz, eigenständig, direkt aus dem
  Logo-Chevron abgeleitet. Das Onboarding bleibt „Journey" / „Deine
  erste Woche" — keine Namenskollision mehr.
- **Farbwelt: Monochrom + Champagner-Akzent.** Kein Blau. Silber
  existiert NUR im Logo und in Meilenstein-Momenten — nie als
  UI-Funktionsfarbe (Kontrast-Fail).
- Claim: „Build a better tomorrow" — nur auf Login/Marketing-Flächen,
  nie in der Arbeits-UI.

## 2. Farb-Tokens

Licht (Standard):

| Token | Wert | Rolle |
|---|---|---|
| `bg` | `#F7F6F3` | App-Hintergrund (warmes Off-White statt kaltem Grau) |
| `surface` | `#FFFFFF` | Karten, Eingaben |
| `ink` | `#111214` | Text, primäre Aktionen |
| `muted` | `#6E7075` | Sekundärtext |
| `line` | `#E6E4DF` | Hairlines, Ränder |
| `primary` | `#1A1B1E` | Buttons/CTAs (Graphit — die Marke drückt, nicht schreit) |
| `primary-ink` | `#FFFFFF` | Text auf primary |
| `accent` | `#B8935A` | Champagner: Fortschritt, Meilensteine, aktive Zustände |
| `accent-deep` | `#8A6C3C` | Champagner als TEXT (erst ab hier ≥ 4.5:1 auf Weiß) |

Dunkel (PWA/abends):
`bg #0F1012 · surface #17181B · ink #F4F3F0 · muted #9A9CA1 ·
line #26282C · primary #F4F3F0 · primary-ink #111214 ·
accent #C9A76B · accent-deep #D8BC8A`

**Funktionsfarben bleiben funktional** (bewusste Ausnahme vom
Monochrom): Rot `#C0392B`-Familie für Überfällig/Löschen, Grün
`#1E7F4F`-Familie für Erledigt/Partner. Begründung: Status muss
schneller lesbar sein als schön — aber gedeckte, warme Varianten
statt Signal-Neon.

## 3. Akzent-Regeln (die wichtigste Disziplin)

Champagner ist ein Gewürz, kein Anstrich:
- JA: Fortschrittsbalken, aktiver Tab, freigeschaltete Meilensteine,
  „Tag X von 7"-Label, Ascent-Avatar-Ring, Fokus-Karten-Rahmen
- NEIN: Button-Flächen, Fließtext, Links in `accent` (Text nur
  `accent-deep`), großflächige Hintergründe
- Silber-Verlauf: ausschließlich Logo-Asset und der eine
  Meilenstein-Moment (Achievement freigeschaltet)

## 4. Typografie

UI-Font bleibt **Inter** (Systemnähe, Lesbarkeit, Ziffern).
Marken-Momente entstehen über Behandlung, nicht über einen zweiten Font:
- Display/Brand: Versalien, `tracking-[0.25em]`, leicht (300–400) —
  wie die Logo-Wortmarke („ASCEND" leicht + „OS" fett)
- Sektionstitel: 12px Versalien `tracking-wide` in `muted` (bereits etabliert)
- Zahlen (Fortschritt, Metriken): tabular-nums

## 5. Komponenten-Anpassungen (Phase 2, umgesetzt)

- Buttons primär: Graphit statt Blau; Fokus-Ring `accent`
- Aktiver Bottom-Nav-Tab: `accent-deep` + Punkt-Indikator statt Blau
- Fokus-Mission: Hairline-Rahmen `accent/40`, Chevron-Ordinale
- Journey-Fortschrittsbalken & „Tag X von 7": `accent`
- Achievements freigeschaltet: Champagner-Ring, gesperrt: Graustufe
- PWA: Theme `#0F1012`, Icons dunkel mit Silber-Chevron

## 6. Offene Asset-Anforderungen an dich

1. **Logo als SVG** (Chevron solo + Wortmarke) — die PNG-auf-Weiß-Datei
   taugt nicht für transparente/dunkle Kontexte und skaliert nicht sauber.
2. Chevron-Variante für dunklen Grund (oder Freigabe, dass wir die
   Silber-Verläufe aus dem SVG ableiten).
3. Team-Şeyda-Signatur als SVG, falls sie im Onboarding erscheinen soll.

## 7. Internes Design-Audit v1 (nach euren Kriterien)

- **Konsistenz/Wiedererkennbarkeit:** ✓ eine Akzentfarbe, eine Typo,
  Chevron als wiederkehrendes Motiv (Nav, Ordinale, Icons)
- **Accessibility:** ✓ alle Text-Kontraste ≥ 4.5:1 (deshalb
  `accent-deep` als eigener Token — die häufigste Falle bei Gold-Tönen);
  Fokus-Ringe sichtbar; Status nie nur über Farbe (immer + Text/Icon)
- **Mobile First:** ✓ unverändert; Touch-Ziele ≥ 44px bestehen
- **Schwächen, ehrlich:** (a) Champagner auf warmem Off-White ist bei
  billigen Displays subtil — Gegenmaßnahme: nie als einziger Träger von
  Information. (b) Emoji-Icons (🎯👥) beißen sich zunehmend mit der
  Premium-Linie — v2-Empfehlung: Line-Icon-Set (Lucide, 1.5px Stroke),
  bewusst NICHT jetzt (kein Feature-Creep in der Beta-Phase).
  (c) Dark Mode ist als Tokens definiert, aber noch nicht als
  Umschalter verdrahtet — kommt mit dem PWA-Feinschliff.
