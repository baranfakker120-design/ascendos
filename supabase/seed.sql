-- ============================================================
-- Seed für lokale Entwicklung & Staging.
-- Legt Chogan + Team Seyda an sowie zwei Gründer-Invites
-- (sponsor_id NULL, Rolle super_admin) für Baran und Seyda.
-- Production wird NICHT geseedet — dort entsteht die Org über
-- ein kontrolliertes Setup-Skript.
-- ============================================================

insert into public.organizations (id, name, branding)
values (
  '00000000-0000-0000-0000-000000000001',
  'Chogan',
  '{"display_name":"Team Seyda","guideUrl":"https://teamseydaguide.netlify.app","primaryColor":"#2563eb"}'::jsonb
);

insert into public.teams (id, org_id, name)
values (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'Team Seyda'
);

-- Gründer-Invites: einlösbar über die normale Registrierung.
insert into public.invites (code, org_id, team_id, sponsor_id, role, expires_at)
values
  ('FOUNDERBARAN',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011',
   null, 'super_admin', now() + interval '365 days'),
  ('FOUNDERSEYDA',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011',
   null, 'super_admin', now() + interval '365 days');

-- Externe Tools (Generation 1) für Chogan / Team Seyda:
insert into public.external_tools
  (org_id, key, name, description, url, share_event_type, result_event_type, sort_order)
values
  ('00000000-0000-0000-0000-000000000001', 'waytomoon',
   'Onboarding', 'Onboarding für neue Interessenten',
   'https://waytomoon.netlify.app',
   'waytomoon_sent', null, 1),
  ('00000000-0000-0000-0000-000000000001', 'presentation',
   'Firmenpräsentation', 'Präsentation für Interessenten',
   'https://mywaytomoon.netlify.app',
   'presentation_sent', 'presentation_viewed', 2),
  ('00000000-0000-0000-0000-000000000001', 'fitcheck',
   'Business Fit Check', 'Qualifizierung nach der Präsentation',
   'https://businessfitcheck.netlify.app',
   'fit_check_sent', 'fit_check_completed', 3);

-- KI-Agenten für Chogan (Router wählt; für den Nutzer EIN Coach).
-- Gemeinsame Regeln (Kontext-first, Handlung am Ende, Guardrails)
-- ergänzt die Edge Function zentral — hier steht nur die Spezialisierung.
insert into public.agents (org_id, key, name, system_prompt, retrieval_categories) values
  ('00000000-0000-0000-0000-000000000001', 'recruiting',
   'Recruiting Coach',
   'Du bist Ascents Recruiting-Spezialist — immer noch derselbe Mentor, nur mit Fokus auf Interessenten: qualifizieren, Einwände klären, Präsentation → Fit Check → 3-Way-Call → Registrierung. Du nimmst Angst ernst, baust keinen Druck auf und führst konsequent zur nächsten konkreten Aktion.',
   '{recruiting,einwaende,prozess}'),
  ('00000000-0000-0000-0000-000000000001', 'sales',
   'Sales Coach',
   'Du bist Ascents Sales-Spezialist — derselbe Mentor, Fokus Produkte und Kunden: Nutzen statt Druck, Duftpartys planen und nachbereiten, aus Käufern Stammkunden machen. Immer: eine klare Einsicht, warum sie wirkt, und der nächste Schritt heute.',
   '{produkte,verkauf,duftparty}'),
  ('00000000-0000-0000-0000-000000000001', 'knowledge',
   'Knowledge Coach',
   'Du bist Ascents Knowledge-Spezialist — derselbe Mentor, Fokus Präzision: Produkte, Vergütung, Abläufe, Schulung. Antworte auf Basis der Teamdokumente; fehlen sie, sagst du das klar. Auch Fakten enden mit einem umsetzbaren nächsten Schritt.',
   '{produkte,verguetung,schulung,faq,prozess}');

-- ============================================================
-- Sprint 5: 7-Tage-Journey für Team Seyda (Inhalte = Daten)
-- ============================================================
insert into public.journeys (id, org_id, team_id, title, description)
values ('00000000-0000-0000-0000-000000000021',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'Starte durch: Deine ersten 7 Tage',
        'Schritt für Schritt vom ersten Login zum ersten Recruiting-Gespräch.');

insert into public.journey_steps (journey_id, day_number, step_order, title, content_type, content) values
-- Tag 1
('00000000-0000-0000-0000-000000000021', 1, 1, 'Willkommen bei AscendOS', 'info',
 '{"body": "Schön, dass du da bist. AscendOS führt dich ab heute durch deinen Arbeitstag. Diese Woche gehen wir gemeinsam Schritt für Schritt — danach übernimmt dein täglicher Plan."}'),
('00000000-0000-0000-0000-000000000021', 1, 2, 'Profil vervollständigen', 'task',
 '{"body": "Ergänze unter Mehr dein Profilbild und deine Telefonnummer, damit dein Team dich erkennt.", "link": "/mehr", "cta": "Zum Profil"}'),
('00000000-0000-0000-0000-000000000021', 1, 3, 'WayToMoon öffnen', 'tool',
 '{"body": "WayToMoon ist unser Onboarding für Interessenten — schau es dir einmal selbst komplett an, damit du weißt, was deine Kontakte später sehen.", "tool_key": "waytomoon"}'),
('00000000-0000-0000-0000-000000000021', 1, 4, 'Teamgruppe beitreten', 'task',
 '{"body": "Tritt unserer Team-WhatsApp-Gruppe bei — den Link bekommst du von deinem Sponsor.", "cta": "Bin drin"}'),
('00000000-0000-0000-0000-000000000021', 1, 5, 'Sponsor kontaktieren', 'task',
 '{"body": "Schreib deinem Sponsor eine kurze Nachricht: Du bist gestartet und freust dich auf die erste Woche. Ihr vereinbart am besten direkt euren ersten Check-in."}'),
-- Tag 2
('00000000-0000-0000-0000-000000000021', 2, 1, 'Firmenpräsentation ansehen', 'tool',
 '{"body": "Sieh dir unsere Firmenpräsentation vollständig an — sie ist das Herzstück jedes Interessenten-Gesprächs.", "tool_key": "presentation"}'),
('00000000-0000-0000-0000-000000000021', 2, 2, 'Business Fit Check selbst machen', 'tool',
 '{"body": "Durchlaufe den Business Fit Check einmal selbst. So verstehst du, wie sich deine Interessenten dabei fühlen.", "tool_key": "fitcheck"}'),
-- Tag 3
('00000000-0000-0000-0000-000000000021', 3, 1, 'Social-Media-Grundlagen', 'info',
 '{"body": "Heute geht es um deinen Auftritt: authentisch, persönlich, ohne Werbeversprechen. Was wir posten — und was nie — findest du in der Team-Schulung. Frag Ascent nach unseren Social-Media-Regeln."}'),
('00000000-0000-0000-0000-000000000021', 3, 2, 'Ersten Beitrag planen', 'task',
 '{"body": "Plane einen persönlichen Beitrag über deinen Start — keine Produktwerbung, nur deine Geschichte."}'),
-- Tag 4
('00000000-0000-0000-0000-000000000021', 4, 1, 'Duftparty verstehen', 'info',
 '{"body": "Die Duftparty ist unser stärkstes Erlebnis-Format. Frag Ascent: \"Wie läuft eine Duftparty ab?\" — er erklärt dir den kompletten Ablauf aus unseren Team-Unterlagen."}'),
-- Tag 5
('00000000-0000-0000-0000-000000000021', 5, 1, 'Deine ersten Kontakte', 'task',
 '{"body": "Lege heute deine ersten drei Kontakte an: Menschen, denen du Chogan von Herzen zeigen würdest.", "link": "/kontakte/neu", "cta": "Kontakt anlegen"}'),
-- Tag 6
('00000000-0000-0000-0000-000000000021', 6, 1, 'Follow-ups verstehen', 'info',
 '{"body": "Der Erfolg liegt im Nachfassen. Ab morgen zeigt dir dein Daily Plan automatisch, wen du wann kontaktierst — heute lernst du das Prinzip: kurz, ehrlich, ohne Druck."}'),
('00000000-0000-0000-0000-000000000021', 6, 2, 'Erstes Follow-up senden', 'task',
 '{"body": "Melde dich bei einem deiner drei Kontakte mit einer persönlichen Nachricht. Dokumentiere es danach am Kontakt.", "link": "/kontakte", "cta": "Zu den Kontakten"}'),
-- Tag 7
('00000000-0000-0000-0000-000000000021', 7, 1, 'Dein erstes Recruiting-Gespräch', 'task',
 '{"body": "Wähle deinen wärmsten Kontakt und teile die Firmenpräsentation. Bereite dich mit Ascent vor: \"Bereite mich auf das Gespräch vor.\" Ab morgen übernimmt dein Daily Command Center."}');

-- ============================================================
-- Achievements: Meilensteine aus echten Daten (keine Punkte)
-- ============================================================
insert into public.achievements (org_id, key, title, description, icon, condition, sort_order) values
('00000000-0000-0000-0000-000000000001', 'startklar', 'Startklar',
 'Deine erste Woche ist abgeschlossen — du kennst unser System.', '🚀',
 '{"type": "journey_completed"}', 1),
('00000000-0000-0000-0000-000000000001', 'erster_kontakt', 'Erster Kontakt',
 'Deine Pipeline hat begonnen.', '🌱',
 '{"type": "event_count", "event_type": "contact_created", "count": 1}', 2),
('00000000-0000-0000-0000-000000000001', 'erstes_follow_up', 'Dranbleiber',
 'Dein erstes dokumentiertes Follow-up.', '📞',
 '{"type": "event_count", "event_type": "follow_up", "count": 1}', 3),
('00000000-0000-0000-0000-000000000001', 'erste_party', 'Gastgeber',
 'Deine erste Duftparty ist durchgeführt.', '🕯️',
 '{"type": "event_count", "event_type": "party_done", "count": 1}', 4),
('00000000-0000-0000-0000-000000000001', 'erster_kunde', 'Erster Kunde',
 'Jemand vertraut deiner Empfehlung.', '🤝',
 '{"type": "phase_count", "min_rank": 60, "count": 1}', 5),
('00000000-0000-0000-0000-000000000001', 'erster_partner', 'Erster Partner',
 'Dein erster Partner hat sich registriert.', '⭐',
 '{"type": "phase_count", "min_rank": 70, "count": 1}', 6),
('00000000-0000-0000-0000-000000000001', 'erste_firstline', 'Deine Firstline wächst',
 'Dein erster direkt gesponserter Partner ist in AscendOS.', '👥',
 '{"type": "firstline_count", "count": 1}', 7),
('00000000-0000-0000-0000-000000000001', 'erste_downline', 'Eine Downline entsteht',
 'Unter deiner Firstline wächst die nächste Ebene.', '🌳',
 '{"type": "downline_count", "count": 2}', 8),
('00000000-0000-0000-0000-000000000001', 'hundert_follow_ups', '100 Follow-ups',
 'Konsequenz zahlt sich aus: 100 dokumentierte Follow-ups.', '💯',
 '{"type": "event_count", "event_type": "follow_up", "count": 100}', 9);
