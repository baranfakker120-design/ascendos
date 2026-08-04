# AscendOS Complete Beta Audit

**Sprint:** 5.5 — Complete Product Verification (no features, no refactors)  
**Date:** 2026-08-04  
**Baseline:** `main` @ post-PR #39 / #40 era (`get_genealogy_tree`, person Coach, CF Pages)  
**Method:** Codebase verification only — no assumptions, no runtime production probes  
**Author stance:** Brutally honest. UI without logic = incomplete. Schema without writer = dead. Cron without schedule = never fires.

---

## Executive Verdict

AscendOS is a **strong beta CRM + Coach + Daily Plan core** bolted onto a **half-finished recognition / notification / content platform**.

| Layer | Honest read |
|---|---|
| Contacts + pipeline + offline queue | 🟢 Real product |
| Coach chat + RAG + person conversation | 🟢 Real product |
| Daily Plan / Closing Loop / Journey week-1 | 🟢 Real product |
| Rank frames 01–07 display + sheen | 🟢 Display works |
| Team tree pan/zoom | 🟡 Works; scale claims oversold |
| Live Coaching Today card | 🟡 Works as “one Zoom event”; not a platform |
| Advisor of the Month | 🔴 Schema + readers; **no calculator, no cron** |
| AAA Cinema / Hero / Rank-up | 🔴 **Does not exist** |
| Push / scheduled notifications | 🔴 Tables + Settings theater; **no delivery** |
| Multi-org content tenancy (Stories / Live / KC) | 🔴 **No `org_id` — global to all authenticated users** |
| Gamification XP/Levels | 🔴 **Does not exist** (AP economy does) |
| Settings (theme, delete account, sync controls) | 🔴 Mostly copy / fake |

**Ship beta only if** you accept: single-org deployment, device-local CRM retention after logout, no push reminders, no monthly award automation, and Knowledge Center content **not** feeding the Coach.

---

## Status Legend

| Symbol | Meaning |
|---|---|
| 🟢 Complete | Implemented end-to-end and wired |
| 🟡 Partially Implemented | Real pieces exist; gaps, stubs, or UI-only |
| 🔴 Broken / Missing | Absent, never fires, or critically incomplete |

**Priority:** P0 Critical · P1 Important · P2 Nice to Have

---

# 1. Avatar & Frame System

## Status: 🟡 Partially Implemented · Priority: P1

### What exists
- Measured geometries + WebP assets for `frame-01` … `frame-10` under `public/brand/frames/` (50 files).
- Display component `RankFrame` + CSS sheen (`src/shared/ui/RankFrame.tsx`, `rank-frame.css`).
- Priority resolver `resolveDisplayFrameKey` in `src/shared/lib/frameAssets.ts`:
  1. `super_admin` → `frame-09`
  2. `developer` → `frame-08`
  3. `isBeraterDesMonats` → `frame-10`
  4. else AP rank `frame_asset` (`frame-01`…`07`)
- Wired into Profile, Profile Edit, Team cards, Genealogy list, Coach person chip, Node detail.

### Frame-by-frame

| Name (product language) | Reality in code | Appear when | Automatic? | Disappears? | Priority OK? | Animations | Status |
|---|---|---|---|---|---|---|---|
| New Member | **No frame.** Closest: rank **Newcomer** (`frame-01`) + 14-day “NEU” badge on cards (`isNewPartner`) | AP ≥ 0 / joined < 14d | Rank yes; badge yes | Badge after 14d; frame on higher AP | N/A | Badge static; frame sheen | 🟡 |
| Active | `frame-02` Active (AP ≥ 250) | `rank_for_ap` | Yes | Yes on higher rank | Via AP ladder | Sheen | 🟢 |
| Inactive | **Not a frame** — genealogy filter only (`isInactive`) | Filter chip | N/A | N/A | N/A | None | 🔴 as frame |
| Leader | Membership **role** display; rank frame “Team Leader” is `frame-06` (AP ≥ 30k) | Role vs AP diverge | Partial | Partial | Role ≠ frame | Sheen | 🟡 |
| Super Admin | `frame-09` when `role === 'super_admin'` | Role | Yes (client) | On role change | Beats all | Sheen (+ separate `RoleBadge`) | 🟢 display |
| Top Recruiter | **Does not exist** anywhere | — | — | — | — | — | 🔴 |
| Advisor of the Month | `frame-10` when `isBeraterDesMonats` | Flag from `monthly_awards` | **Flag never auto-set** | Would when period ends | Beats AP ranks | Sheen only; **no hero** | 🔴 E2E |
| AAA Cinema | **No feature** | — | — | — | — | — | 🔴 |
| Rank Frames 01–07 | Seeded in `ranks` + assets | AP thresholds | Yes via `ap_total` / `rank_for_ap` | Yes | Yes | Sheen | 🟢 display |
| Special Event Frames | Schema (`event_object`, `seasons`, `unlock_condition`) | Never evaluated | No | No | No | No | 🔴 dead schema |
| Temporary Frames | Same as events | Never | No | No | No | No | 🔴 |
| Developer | `frame-08` | `role === 'developer'` | Yes | On role change | Below SA | Sheen | 🟢 display |

### Bugs / gaps
1. **`membership_cosmetics` unlocks in DB but no Collection / equip UI** — display ignores `is_equipped`.
2. **Team Leader split brain:** AP ≥ 30k shows `frame-06`; business qualification is 5 active firstlines (`evaluate_team_leader_qualification`). Display can lie.
3. **No RankUpOverlay / HeroScreen** (planned in `docs/sprint-4-plan.md`, never built under `src/`).
4. **`ApBadge` unused by features** — only tests + `ApRewardSticker` import helpers.
5. PROJECT_BIBLE still claims frames “not shipped” — **stale docs**.

### Evidence
- `src/shared/lib/frameAssets.ts`, `resolveDisplayFrame.test.ts`
- `supabase/migrations/20260805000018_gamification_foundation.sql`
- `docs/sprint-4-plan.md` (planned `features/gamification/` never created)

---

# 2. Advisor of the Month

## Status: 🔴 Broken / Missing · Priority: P0

| Question | Finding |
|---|---|
| Calculated automatically? | **No.** Zero `INSERT` into `monthly_awards` in app, SQL jobs, or Edge Functions. |
| Runs on 1st of month? | **Nothing scheduled.** No `pg_cron`, no Cloudflare Cron, no Worker. |
| Timezone? | Readers use **UTC month** (`Date.UTC` in `profileApi.ts`; `date_trunc('month', now())` in genealogy). No org TZ. |
| Tie handling? | **Undefined** — no scorer exists. Uniques would block dupes if someone wrote manually. |
| Storage? | Table `monthly_awards` (places 1–3, `ap_in_period`) — empty unless manual super_admin write. |
| History UI? | **None.** |
| UI / badge / frame? | Frame-10 + gold team-node CSS **if** flag true. |
| Animation / popup? | **No** hero cinema. Coach “could become Advisor…” is a **heuristic story**, not awards. |
| Functional? | **No** in production without manual SQL. |

### Bug
- Profile requires `place = 1` for Berater frame (`profileApi.ts`).
- Genealogy `is_berater_des_monats` is **any place** for current period → places 2–3 can get gold/`frame-10` on tree but not on own profile.

### Evidence
- Readers: `src/features/profile/profileApi.ts`, `get_genealogy_tree` in genealogy migration
- Table: `20260805000018_gamification_foundation.sql`
- No cron: `docs/sprint-0-bericht.md`, empty schedules in `wrangler.toml`

---

# 3. AAA Cinema

## Status: 🔴 Broken / Missing · Priority: P0 (if product expected it)

**There is no feature, route, component, table, unlock, popup, history, or reset named AAA Cinema / Cinema / Kino.**

| Claim | Reality |
|---|---|
| “AAA” in repo | Marketing adjective for AP economy migration, EnergyCore, bottom-nav polish |
| Closest planned product | Sprint 4 **HeroScreen** + **RankUpOverlay** — **never built** |
| Trigger / timing / requirements | Undefined |
| Animation / unlock / popup / history / reset / storage | Absent |

Do not confuse with: cinematic BottomNav CSS, `EnergyCore` canvas, `ApRewardSticker` particles, TeamLeader sessionStorage dialog.

### Evidence
- Repo search: no `HeroScreen`, `RankUpOverlay`, `Cinema`
- Plan only: `docs/sprint-4-plan.md`

---

# 4. Zoom Coaching (Live Coaching)

## Status: 🟡 Partially Implemented · Priority: P0 (honesty) / P1 (product)

| Capability | Status | Notes |
|---|---|---|
| Event CRUD in Supabase | 🟢 | `live_coaching_events`, admin page `/live-coaching` |
| Media upload | 🟢 | Storage bucket `coaching-media` |
| Today card countdown | 🟢 | Client `setInterval` 1s |
| Join Zoom | 🟢 | `zoomus://` + HTTPS fallback |
| Calendar links | 🟢 | Apple / Google / Outlook |
| Pick “today’s” event | 🟡 | Heuristic soonest non-finished |
| Cloud sync to members | 🟡 | RLS read of `active` events; **no Realtime**, no poll on member query |
| Reminders (30m / 5m) | 🔴 | Scheduled in **publisher localStorage** only; flush on Today |
| `coaching_notification_outbox` | 🔴 | Written on publish; **zero readers / workers** |
| Web Push | 🔴 | `push_subscriptions` table; **no app usage** |
| Recurrence (`repeat_rule`) | 🔴 | Column + admin select; **no expansion logic** |
| Library / replay / multi-event | 🔴 | `LIVE_COACHING_FUTURE` all `false` |
| Expired meetings | 🟡 | “Finished” UI; no archive job |
| Tenancy | 🔴 | **No `org_id`** — any authenticated user can see active events |

### Brutal summary
Shippable as **“one Zoom card on Today + Join + calendar.”** Not shippable as a coaching notification platform.

### Evidence
- `src/features/live-coaching/*`
- `supabase/migrations/20260815000028_sprint_5_1_knowledge_live_coaching.sql`

---

# 5. Notifications

## Status: 🔴 Broken / Missing (as a product system) · Priority: P0

| Notification | Exists? | Trigger? | Works? | Verdict |
|---|---|---|---|---|
| New member | No system | — | — | 🔴 Missing |
| Activation | No | — | — | 🔴 Missing |
| Follow-up due | Roadmap only | — | Never | 🔴 Missing |
| Inactive member | Coach insight heuristic | Client `analyzeOrg` | Advisory UI only | 🟡 Not a notification |
| Birthday | Draft kind / automation kind | **Never** (no `birth_date` usage in `src/`) | Never fires | 🔴 Stub |
| Zoom reminder | Local Notification API | Publisher device schedule | Audience never gets it | 🔴 Theater |
| Coach reminder | Automation prefs | Default OFF; no runner | Never | 🔴 Stub |
| Advisor of the Month | Would be frame/story | No award job | Never | 🔴 |
| AAA Cinema | No | — | — | 🔴 |
| Achievement unlocked | DB `check_achievements` | On Progress/Journey open | Unlocks quietly; **no toast/push** | 🟡 Silent |
| Push notification | Settings toggle | Requests permission | No VAPID / SW push / subscribe write | 🔴 UI only |
| Browser notification | Coaching path | `showCoachingNotification` | Local only | 🟡 |
| Badge counter (`setAppBadge`) | No | — | — | 🔴 |
| Genealogy `messageBadge` | Column / UI | Hardcoded `0` in tree RPC path | Never shows | 🔴 Dead UI |
| Offline notification | No | OfflineBootstrap = sync queues | ≠ notifications | 🔴 |
| In-app notification center | Roadmap Phase 7 | Tables not migrated | — | 🔴 Missing |

### Evidence
- `src/features/live-coaching/notifications.ts`
- `src/features/settings/SettingsPage.tsx` (push toggle)
- `src/features/coach/intelligence/automation.ts` (defaults `enabled: false`)
- `docs/roadmap-ascendos.md` Phase 7
- No `from('push_subscriptions')` in `src/`

---

# 6. Automations

## Status: 🔴 Missing platform · Priority: P0

| Process | Implemented? |
|---|---|
| Cloudflare Cron / Workers schedules | **No** (`wrangler.toml` has no triggers) |
| `pg_cron` / `pg_net` | **Not installed** (documented Sprint 0) |
| Edge Function schedules | **No** — only on-demand: `coach-chat`, `ingest-knowledge`, `validate-invite` |
| Coaching outbox processor | **No** |
| Monthly awards job | **No** |
| Coach birthday / inactivity / follow-up senders | **Stub prefs only** |
| Client `setInterval` | UI only (countdown, notify flush, offline flush) |
| Daily plan generation | **On user open** (`generate_daily_plan` RPC) — not midnight |
| Streak sync | 🟢 Trigger on `usage_events` |
| AP award on pipeline/usage | 🟢 DB triggers |
| Achievement check | 🟢 On-demand RPC when Progress/Journey opens |

**Anything that must fire when the app is closed cannot work today.**

---

# 7. Gamification

## Status: 🟡 Partially Implemented · Priority: P1

| Surface | Status |
|---|---|
| AP rules + ledger + totals | 🟢 DB + triggers + pgTAP |
| Auto AP from pipeline/usage | 🟢 |
| Manual AP tasks | 🟢 Leadership UI + RPC |
| Rank / EnergyCore / frames on Profile | 🟢 Display |
| ApRewardSticker on Daily Plan | 🟢 |
| Streak days | 🟢 DB trigger |
| Achievements / milestones | 🟢 On-demand (`ProgressPage`) |
| Cosmetics unlock on AP | 🟢 DB insert; 🔴 no Collection UI |
| Payout entitlements (€100 TL) | 🟡 Entitlement rows, not payments |
| Monthly Berater award | 🔴 No auto fill |
| **XP** | 🔴 Does not exist |
| **Levels** (as XP levels) | 🔴 Does not exist (AP ranks do) |
| Badges (achievement UI polish / toast) | 🟡 Data without celebration push |
| `features/gamification/` | 🔴 Never created |

---

# 8. Ascend Coach

## Status: 🟢 Chat core Complete · 🟡 Intelligence Partial · Priority: P0 for chat honesty

| Capability | Status | Notes |
|---|---|---|
| AI chat E2E | 🟢 | Client → Edge `coach-chat` (auth, limit, RAG, providers, persist) |
| Message persistence | 🟢 | `coach_messages` / `coach_convos` |
| Error handling | 🟢 Basic | Optimistic rollback; user-facing errors |
| Contact context (server) | 🟢 | Loaded under JWT |
| Person conversation screen | 🟢 | `/coach/person/:mid` (PR #39) |
| Auto person context brief | 🟢 | Client prepend once (`personContext.ts`) |
| Workspace list / archive | 🟢 Local | localStorage + IDB — **not cloud sync** |
| Org intelligence / CEO briefing | 🟡 | Client heuristics over RPCs — **not a second LLM** |
| Suggested actions | 🟡 | Prompt chips → navigate to chat |
| Follow-up generation | 🟡 | Derived insights; not scheduled sends |
| Message preparation / WhatsApp cards | 🟢 | Cards + extract draft |
| Message draft library (birthday…) | 🔴 | `messageDrafts.ts` — tests/exports only, not production UI |
| Coach memory (objections/promises) | 🔴 | localStorage stub; not product flow |
| Automations auto-send | 🔴 | Default OFF; constitution forbids surprise send |
| Knowledge RAG | 🟢 | When `knowledge_docs` approved |
| Knowledge Center articles → Coach | 🔴 | **Different tables — never connected** |
| Daily limit | 🟢 | RPC `coach_messages_today` |

### Brutal summary
**Chat + RAG + persistence is the real product.** “COO intelligence” is a useful rules engine, not magic. Dual knowledge systems mean operators can publish into Knowledge Center and **nothing reaches Coach replies**.

---

# 9. Team Tree

## Status: 🟡 Functional with fragilities · Priority: P1

| Area | Status |
|---|---|
| Zoom (pinch / wheel / double-tap) | 🟢 (improved PR #40) |
| Pan | 🟢 |
| Selection | 🟢 URL `?member=` |
| Navigation to Coach / back | 🟢 (PR #40) |
| Performance at claimed 10k | 🔴 Oversold — full edge SVG + full JS tidy layout |
| Gesture stability | 🟡 Stage capture + idle culling (PR #40); still watch double-select |
| Mobile UX | 🟡 Ops strip steals ≤28dvh; tree cramped |
| Tablet UX | 🟡 Better space; same edge cost |
| Animations | 🟡 Node/edge/aura CSS — perf risk |

### Bugs / fragilities
1. **Double-select path:** card `onClick` + stage `elementFromPoint` tap both call `onSelect`.
2. Camera `emit()` every move (docs promised rAF batching).
3. **Edges never virtualized** — all paths mounted.
4. Full layout recompute on every collapse/filter.
5. RPC-missing **fallback tree is structurally dishonest** (fake memberships).
6. Coach insight bubble on every visible card (cost + clutter).
7. Minimap capped at 200 dots.
8. `didCenter` once forever — no re-center after major filter.
9. Unbounded pan — can lose the tree.
10. `messageBadge` always 0 — dead UI chrome.

### Evidence
- `GenealogyViewport.tsx`, `useGenealogyCamera.ts`, `cameraMath.ts`
- `docs/sprint-4-1-genealogy-architecture.md` (10k claim)

---

# 10. Contacts

## Status: 🟢 Core Complete · 🟡 Filters Partial · 🔴 Import/Export Missing · Priority: P1

| Feature | Status |
|---|---|
| Search (server `ilike`) | 🟢 |
| Phase filter chips | 🟡 **Client-side on loaded page only** — wrong under “load more” |
| Sorting | 🟡 Fixed `updated_at desc` — no UI |
| Create / edit | 🟢 + draft persistence |
| Delete | 🟢 Online; 🔴 **not offline-queued** |
| Detail / pipeline / history | 🟢 |
| Share tools + screenshot proof | 🟢 |
| Offline create/update/events | 🟢 |
| Import (CSV/vCard/device) | 🔴 Missing |
| Export | 🔴 Missing |
| Phone-book sync | 🔴 Missing |

---

# 11. Today Dashboard

## Status: 🟡 Partially Implemented · Priority: P1

Routing: incomplete Journey → Stories + Live + Sync + **JourneyToday** + CEO + Coach OS; else → `TodayPage` (Daily Plan stack).

| Widget | Data source | Logic | Refresh | Actions | Empty/Loading | Status |
|---|---|---|---|---|---|---|
| Stories | Admin `ascend_stories` + coach-built cards | Merge feeds | Admin 60s poll | Open story | **Returns `null` if empty** | 🟡 |
| Live Coaching | `live_coaching_events` | Pick today | Query + 30s notify flush | Join, calendar | **`null` if none** | 🟡 |
| Sync chip | Offline queues | Status | Interval | — | Shows state | 🟢 |
| Daily Plan / Mission | `generate_daily_plan` + IDB day memory | Commit → Focus → Closing | Query invalidation | Done/defer/skip, prep, end day | Loading/error/empty cards | 🟢 |
| Journey Today | Journey RPCs | Week-1 steps | Query | Complete steps | Loading/error | 🟢 |
| CEO Briefing | Client `useCoachOrgIntelligence` | Morning/evening heuristics | On inputs | Ask → Coach | Loading; `null` if no intel | 🟡 |
| Coach OS strip | Same intel + suggestions | Horizon chips | On inputs | Open coach | Weak empty copy | 🟡 |

**UX issue:** First viewport is a **stacked dashboard**, not one composition (Stories + Live + Sync + Missions + CEO + Coach).

---

# 12. Settings

## Status: 🔴 Mostly Incomplete · Priority: P1

| Area | Status |
|---|---|
| Language | 🟢 `setLocale` |
| Theme | 🔴 Copy only — “Dark mode follows with PWA polish” |
| Profile | 🟢 Separate `/profil` routes (not Settings) |
| Cloud Sync controls | 🔴 Missing (home indicator only) |
| Logout | 🟢 `signOut()` — **does not clear IDB** |
| Import / Export | 🔴 Missing |
| Account delete | 🔴 **Fake** — confirm → “contact support” hint; no API |
| Push toggle | 🔴 Permission ask only |
| General / Privacy cards | 🔴 Copy-only |
| Support | 🟡 Mailto links |

---

# 13. Database

## Status: 🟡 Core solid · Sprint 5 content tenancy broken · Priority: P0

### Live & used (high confidence)
`organizations`, `teams`, `profiles`, `memberships`, `invites`, `contacts`, `pipeline_events`, `daily_plans`, `daily_plan_items`, `coach_convos`, `coach_messages`, `knowledge_docs`, `knowledge_chunks`, `journeys`, `journey_steps`, `user_progress`, `achievements`, `user_achievements`, `usage_events`, `external_tools`, `leadership_*`, `ap_*` (via RPC), `ranks`, `live_coaching_events`, `ascend_stories`, `coach_knowledge_*`

### Schema-only / dead / write-sink
| Table | Verdict |
|---|---|
| `push_subscriptions` | 🔴 Dead — no client/Edge writers |
| `coaching_notification_outbox` | 🔴 Write-only; no processor; **SELECT using (true)** |
| `monthly_awards` | 🔴 Readers only; no writers |
| `seasons` / `cosmetic_items` / `membership_cosmetics` | 🟡 Backend economy; no Collection UI |
| `payouts` | 🟡 Entitlements; no client queries |
| `knowledge_gaps` | 🟡 Edge inserts; no admin UI |
| `agents` | 🟡 Edge-only |

### Critical issues
1. **Dual knowledge:** Coach RAG = `knowledge_docs`. Knowledge Center = `coach_knowledge_articles`. **Never connected.**
2. **No `org_id` on Stories / Live Coaching / Coach Knowledge / outbox** → cross-tenant readable to all authenticated users.
3. Indexes generally present for core CRM/coach; Sprint 5 content skipped tenancy indexes because it skipped tenancy.
4. Broad `GRANT ALL` + RLS-only defense; `profiles_public` SELECT granted to **anon**.

### Evidence
- `src/shared/types/database.types.ts`
- Migrations `20260815000028`, `20260816000029`, `20260805000018`
- RLS tests under `supabase/tests/database/`

---

# 14. Security

## Status: 🟡 Core auth OK · P0 offline + tenancy holes · Priority: P0

| Area | Status | Notes |
|---|---|---|
| Supabase Auth + `RequireAuth` | 🟢 | |
| Role from `memberships.role` | 🟢 | Not `profiles.role` |
| Client route gates | 🟡 | Explicitly not the security boundary |
| Org header `x-ascendos-org` | 🟢 | Validated in `active_membership_id()` |
| Env: only anon URL/key in Vite | 🟢 | Secrets Edge-only (`.env.example`) |
| Edge CORS `*` | 🟡 | Weak |
| Offline IDB caches CRM + coach | 🔴 | Survives refresh |
| **`signOut` clears IDB?** | 🔴 **No** — only `supabase.auth.signOut()` |
| Cross-org Stories/Live/KC | 🔴 | No `org_id` |
| Outbox readable by all auth users | 🔴 | `using (true)` |
| Account delete | 🔴 | Fake |
| Login error mapping | 🟢 | Generic i18n |
| Invite create raw `error.message` | 🟡 | Leak risk |
| Public storage buckets (avatars, coaching media) | 🟡 | Intentional; guessable URLs |

---

# 15. UX Audit

Scores are code-informed estimates (structure/CSS/a11y), not visual QA lab scores.

| Screen | Visual | UX | Read | Mobile | Consist. | A11y | Perf | Anim | Avg |
|---|---|---|---|---|---|---|---|---|---|
| Today / Journey | 7 | 6 | 6 | 7 | 6 | 7 | 5 | 7 | 6.4 |
| Contacts | 6 | 7 | 7 | 8 | 7 | 6 | 7 | 5 | 6.6 |
| Coach workspace | 8 | 8 | 7 | 7 | 7 | 7 | 6 | 8 | 7.3 |
| Person Coach | 8 | 8 | 8 | 8 | 8 | 8 | 7 | 8 | **7.9** |
| Team tree | 8 | 7 | 6 | 6 | 6 | 7 | 5 | 8 | 6.6 |
| Profile | 7 | 7 | 7 | 8 | 7 | 6 | 7 | 7 | 7.0 |
| Settings | 5 | 5 | 7 | 8 | 6 | 7 | 8 | 3 | 6.1 |
| More hub | 4 | 5 | 6 | 7 | 5 | 5 | 8 | 2 | 5.3 |
| Team Seyda iframe | 3 | 4 | 5 | 5 | 3 | 4 | 4 | 1 | **3.6** |
| Knowledge admins | 5–6 | 5–6 | 6 | 6 | 4–5 | 5 | 6 | 3–4 | ~5.3 |
| Auth | 5 | 7 | 8 | 8 | 6 | 7 | 9 | 2 | 6.5 |

### UX issues (concrete)
1. **P0:** Bottom nav Team uses `TeamSeydaIcon` but routes to genealogy `/team`; real Seyda guide is `/team-seyda` via More — icon/name lie.
2. **P1:** Today is a stacked dashboard (Stories + Live + Sync + Missions + CEO + Coach OS).
3. **P1:** Team page piles Leader Dashboard + Insights + Warnings + Leaderboard + AP Tasks + tree.
4. **P1:** Settings fake delete / copy-only theme & privacy.
5. **P1:** Dual Knowledge admin IA (`/wissen` vs `/knowledge-center`).
6. **P2:** `NewConversationSheet` lacks Escape/focus trap of `BottomSheet`.
7. **P2:** Genealogy `role="application"` hurts screen readers.
8. **P2:** Coach workspace + BottomNav fight for height (person coach correctly hides nav).
9. **P3:** `*` → `/` (no 404).
10. **P3:** German/English path mix (`/registrieren`, `/kontakte`, `/wissen`, `/more`).

---

# Final Scorecard (all systems)

| # | System | Status | Priority |
|---|---|---|---|
| 1 | Avatar & Frame display | 🟡 | P1 |
| 2 | Advisor of the Month | 🔴 | P0 |
| 3 | AAA Cinema | 🔴 | P0 |
| 4 | Zoom / Live Coaching | 🟡 | P0 honesty |
| 5 | Notifications | 🔴 | P0 |
| 6 | Automations / Cron | 🔴 | P0 |
| 7 | Gamification (AP) | 🟡 | P1 |
| 7b | XP / Levels | 🔴 | P2 |
| 8 | Ascend Coach chat | 🟢 | — |
| 8b | Coach intelligence / dual knowledge | 🟡/🔴 | P0 |
| 9 | Team Tree | 🟡 | P1 |
| 10 | Contacts core | 🟢 | — |
| 10b | Contacts import/export | 🔴 | P2 |
| 11 | Today Daily Plan | 🟢 | — |
| 11b | Today peripheral slots | 🟡 | P1 |
| 12 | Settings | 🔴 | P1 |
| 13 | Database core | 🟢 | — |
| 13b | Sprint 5 tenancy | 🔴 | P0 |
| 14 | Auth | 🟢 | — |
| 14b | Offline logout hygiene | 🔴 | P0 |
| 15 | UX consistency | 🟡 | P1 |

---

# P0 Punch List (must decide before Sprint 6)

1. **Do not market push / Zoom reminders / monthly Advisor / AAA Cinema** — they do not work.
2. **Fix or quarantine Sprint 5 content tenancy** (Stories, Live Coaching, Knowledge Center, outbox) — add `org_id` or freeze to single-org only.
3. **Connect or rename Knowledge systems** — operators editing Knowledge Center does not feed Coach.
4. **Clear offline stores on sign-out** — shared devices retain CRM + coach history.
5. **Advisor of the Month:** either build calculator + schedule or remove UI promises (frame-10 / gold / stories).
6. **Nav honesty:** Team icon vs Team Seyda.
7. **Settings honesty:** remove or implement delete account / theme / push.

---

# P1 Punch List

- Collection / equip cosmetics UI or stop unlocking into a void  
- Team Leader AP-frame vs firstline qualification alignment  
- Contacts phase filter server-side  
- Genealogy edge virtualization / layout cost vs 10k claim  
- Double-select on tree cards  
- Today / Team density (one job per section)  
- Live Coaching recurrence / Realtime / member poll  
- Account delete API or remove control  

---

# P2 Punch List

- Import/export contacts  
- Top Recruiter / event / temporary frames (or delete schema promises)  
- Toast on achievement unlock  
- `messageBadge` real or remove  
- `knowledge_gaps` admin UI  
- Dialog a11y parity  
- Docs: PROJECT_BIBLE / beta checklist still mention Netlify in places — hosting is Cloudflare Pages  

---

# Dead Code / Unused / Never Triggered (inventory)

| Item | Why |
|---|---|
| `push_subscriptions` | No writers |
| `coaching_notification_outbox` processor | No reader/worker |
| `monthly_awards` auto-fill | No job |
| `HeroScreen` / `RankUpOverlay` / `CollectionPage` | Never created |
| `messageDrafts` production UI | Tests only |
| Coach `automation.ts` runners | Prefs only; default OFF |
| `ApBadge` in features | Unused |
| Genealogy `messageBadge` UI | Always 0 |
| `LIVE_COACHING_FUTURE` surfaces | All false |
| Settings theme/privacy/general controls | Copy only |
| Settings delete account | Fake confirm |
| Event/temporary frame evaluators | Schema only |
| XP / Levels | Absent |

---

# What Actually Works (protect this)

1. Auth + memberships + org switcher  
2. Contacts CRM + pipeline + share tools + offline create/update  
3. Coach chat + RAG (`knowledge_docs`) + person conversation + WhatsApp cards  
4. Daily Plan state machine + Closing Loop + Journey week-1  
5. AP economy triggers + ranks display + EnergyCore  
6. Team genealogy view (for realistic team sizes) + member sheet + Coach deep link  
7. Live Coaching **admin publish + Today join card** (without relying on reminders)  
8. Ascend Stories bar when content exists  
9. i18n catalogs (de/en/fr/it/tr) for shipped surfaces  
10. CI: lint, typecheck, unit tests, build assert for `VITE_*`, pgTAP RLS suite  

---

# Recommendation for Sprint 6 Gate

**Do not start Sprint 6 feature work** until P0 punch list is either:
- **Fixed**, or  
- **Explicitly deferred in writing** with product copy that does not claim those capabilities.

This audit is verification-only. No code was changed for this document.

---

*Evidence drawn from `src/`, `supabase/migrations/`, `supabase/functions/`, `docs/`, and asset inventory under `public/brand/frames/` as of the audit date.*
