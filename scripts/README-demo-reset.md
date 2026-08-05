# Demo-Daten-Reset

Einmaliges Ops-Skript für einen sauberen Neustart der Demo-Organisation
(Chogan / Team Seyda).

## Zielstruktur

```
Şeyda Tatar (super_admin)
└── Baran (developer)
    └── Zuhal Özkartal (berater)
```

Ann-Christin Aydin wird vollständig entfernt (Profil + Auth).

## Ausführen

Voraussetzung: Supabase CLI, Projekt gelinkt (`supabase link --project-ref …`).

```bash
supabase db query --linked -f scripts/demo-data-reset.sql
supabase db query --linked -f scripts/demo-data-reset-verify.sql
```

## Was passiert

- Löscht Kontakte, Coach-Chats/-Nachrichten, Daily Plans, Usage, AP-Ledger,
  Awards, Journey-Progress, Achievements, Invites, Leadership-Notizen usw.
- Setzt AP / Streaks / TL-Qualifikation der verbleibenden Mitglieder auf 0
- Verdrahtet Sponsor-Kette Şeyda → Baran → Zuhal
- Setzt Rollen: Şeyda=`super_admin`, Baran=`developer`, Zuhal=`berater`
- Stellt ggf. fehlende `developer`-Rollen-Constraints nach (Migration 22)

## Was bleibt

Organisation, Teams, Ränge, Journey-Definitionen, Knowledge-Docs,
Agents, Achievements-Katalog, Tools — keine Tabellen/Migrationen gelöscht.
