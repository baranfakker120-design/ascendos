# Corrective Migrations 23 / 30 / 28 / 29

Status: **PLANNING / IMPLEMENTATION ONLY** (repository).  
Production: **UNCHANGED** by this change set.

Backup (confirmed): `$HOME/ascendos-backups/20260814T165548Z/`

## Production drift

| Historical migration                    | Production reality (pre-corrective)                                                                                                 | Why not re-run original                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **23** `aaa_ap_game_economy`            | `ap_design_score_mission` absent; `ap_award_from_event` lacks `mission_completed` scoring; Org#1 `ap_rules` still at AP=0           | Original also **UPDATE**s economy rule amounts                                        |
| **30** `sprint6_frame_display_contract` | `display_rank_for_ap` present; frame RPCs `ensure_role_frame_cosmetics` / `list_my_frame_cosmetics` / `equip_frame_cosmetic` absent | Original also rewrites genealogy/qualification and **`ap_apply_to_total` auto-equip** |
| **28** `sprint_5_1` CMS portion         | `coach_knowledge_*` tables absent (live/push exist via later migrations)                                                            | Original creates **global** CMS RLS + live/push/storage side-effects                  |
| **29** `ascend_stories`                 | `ascend_stories` absent                                                                                                             | Original creates **global** stories RLS                                               |

History reconciliation already recorded FULL MATCH versions **15, 17, 18, 20, 21, 22, 24, 27, 31**.  
Versions **19, 23, 26, 28, 29, 30, 32** remain **out of history** / not re-run.

## Corrective files created (additive)

| Corrective      | File                                                                        | Intent                                                               |
| --------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 23 → **52**     | `supabase/migrations/20260908000052_corrective_ap_design_score_mission.sql` | `ap_design_score_mission` + mission-aware `ap_award_from_event` only |
| 30 → **53**     | `supabase/migrations/20260909000053_corrective_frame_cosmetics_rpcs.sql`    | Frame RPCs only; **no** `ap_apply_to_total` change                   |
| 28 CMS → **54** | `supabase/migrations/20260910000054_corrective_coach_knowledge_cms.sql`     | CMS tables with `org_id` + Phase-4 tenant RLS                        |
| 29 → **55**     | `supabase/migrations/20260911000055_corrective_ascend_stories.sql`          | Stories with `org_id` + Phase-4 tenant RLS                           |

Original migration files **23 / 28 / 29 / 30 are not modified**.

## Dependencies

- Membership helpers: `active_membership_id()`, `current_org_id()`, Fall-4 ambiguity reject
- Gamification tables (18+): `ap_rules`, `ap_ledger`, `usage_events`, triggers
- Cosmetics tables (18+): `cosmetic_items`, `membership_cosmetics`
- `organizations`, `set_updated_at()`
- Coach manager helper: `is_coach_content_manager()` (reasserted in 54)
- Local chain already contains 44/45; correctives are **idempotent** (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`)

## Explicitly NOT included

- AP economy `ap_rules` upserts / Org#1 score raises (needs separate human approval)
- Auto-equip via `ap_apply_to_total`
- Live coaching / push / storage from original 28
- Org#1 CMS or Stories seed/backfill
- Production apply (`db push` / `migration up` / deploy)
- History inserts for 23/28/29/30/52–55

## Rollback

Repo-only until applied. If a future approved apply is rolled back:

1. Prefer restore from confirmed backup dump
2. Or drop corrective functions/policies/tables only if no dependent production data exists
3. Do **not** delete historical migration files 23/28/29/30

## Tests

- Unit: `src/shared/tenant/correctiveMigrations23_30_28_29.test.ts`
- pgTAP: `supabase/tests/database/corrective_23_30_28_29.test.sql`
  - mission scoring + non-mission compatibility
  - frame list/equip + foreign frame denial
  - CMS/Stories Org A/B isolation, forged `x-ascendos-org`, forged `org_id`, Fall 4, expiry filter

## Production remains unchanged

This PR only adds repository migrations, tests, and docs.  
No remote SQL, no `supabase_migrations` writes, no deploy, no secret/API changes.
