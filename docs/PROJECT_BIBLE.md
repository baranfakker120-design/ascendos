# AscendOS Project Bible

**Status:** Canonical product and engineering reference  
**Audience:** Every developer and AI agent working on AscendOS  
**Rule:** Prefer this document over ad-hoc assumptions. Where this document and older notes conflict, resolve against the repository (migrations, ADRs, code) and then update this file.

This bible describes AscendOS as it exists in the repository today. It does not invent product surface that has not been built. Open decisions are marked **currently undefined**.

---

# 1. Vision

AscendOS is a professional **Business Operating System for Network Marketing**.

It is **not a game**.

It exists so that network marketers can run their workday with clarity: who to contact, what to do next, how the pipeline moves, how the team grows, and how knowledge and coaching support real conversations. The product goal is to help users become **more productive**, **more consistent**, and **better leaders**.

In the current product, that means:

- Invite-only registration with genealogy (sponsor, team, organization)
- Contact pipeline from first touch to partner
- A daily command center that turns pipeline signals into missions
- An AI coach (**Ascent**) that works with real contact context and team knowledge
- A data-driven onboarding journey for new partners
- A gamification foundation that rewards productive activity — without replacing the business tools

AscendOS starts with Team Şeyda / Chogan / Essence Tribe context, but the architecture is multi-tenant from day one so additional teams and organizations can share the same platform without a rewrite.

---

# 2. Core Philosophy

**Business first. Gamification second.**

Every feature must improve business productivity first: outreach, follow-up, pipeline discipline, onboarding, coaching quality, leadership visibility, or operational safety.

Gamification exists only to increase **motivation**, **consistency**, and **engagement**. It must never become the reason the application exists.

Never sacrifice usability for visual effects. If a motion, frame, particle effect, or celebration makes the next business action harder, slower, or less trustworthy, it does not ship.

---

# 3. Product Principles

### Mobile First

AscendOS is operated primarily on phones. Layouts, touch targets, load budgets, and navigation must assume one-handed mobile use. Desktop must work, but mobile is the design center.

### Fast

The workday tools (Today, Contacts, Coach) must feel immediate. Heavy libraries are loaded lazily. Assets must be sized for display, not shipped at source resolution.

### Clean

One job per screen area. Prefer clear hierarchy over dense dashboards. Avoid competing callouts, badge clusters, and decorative chrome that do not serve the task.

### Professional

Language, defaults, and coaching behavior stay within DACH compliance boundaries: no income promises, no pressure tactics, no health claims. The product must remain credible in a business context.

### Premium

Quiet confidence over noise. Monochrome foundation, restrained champagne accent, generous space. Brand moments are earned (login, milestones, rank frames), not constant.

### Modular

Features are isolated slices. Agents, tools, ranks, AP rules, cosmetics, and journey content are data where possible — new variants should not require a new architecture.

### Scalable

Shared-database multi-tenancy (`org_id` + RLS), membership-based authorization, and server-side business logic keep the path open to more organizations, leaders, and clients without redesigning the core.

### AI Assisted

AI (Ascent) prioritizes, explains, drafts, and guides. It does **not** autonomously message contacts or make irreversible decisions about people. Keys and model calls stay behind Edge Functions.

### Data Driven

Pipeline events, usage events, achievements, knowledge gaps, and the AP ledger are the measurement layer. Product decisions and gamification rewards should rest on recorded activity, not vanity clicks.

---

# 4. Design Language

### UI philosophy

Modern SaaS. Minimalistic. Elegant. Premium.

The interface should feel closer to a high-end productivity product than to entertainment software.

**Inspirations (direction, not clones):**

- Apple
- Vision Pro
- Linear
- Arc Browser
- Stripe
- Notion

**Avoid:**

- MMORPG aesthetics
- Cartoon styling
- Mobile-game patterns
- Heavy fantasy worlds
- Excessive visual effects, glow stacks, and celebration spam

### Brand system (current)

Documented in `docs/design-system.md` and applied via CSS tokens / Tailwind:

- Light warm off-white background (`#F7F6F3`), graphite primary actions
- Champagne accent for progress and active states — spice, not paint
- Functional red/green only for status that must be read instantly
- Product name: **AscendOS**; coach name: **Ascent** (one-letter distinction must not be “corrected” away)

### Fantasy budget

**Profile frames are the strongest fantasy element allowed.**

Everything else stays subtle and business-focused: typography, spacing, restrained motion, and clear business copy. Rank frames and collection cosmetics may be expressive; the daily workflow UI must not look like a game HUD.

---

# 5. Gamification Rules

### Purpose

Points (AP — Aktivitätspunkte) exist to reward **productive business activities** already recorded in the system (pipeline and usage events). They are a projection over evidence, not a free counter.

### What exists in the repository today

Implemented at the **database layer** (Migration 18 and tests):

| Concept                                   | Role                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `ap_rules`                                | Configurable mapping from event type → AP (catalog data, not hardcoded values) |
| `ap_ledger`                               | Append-only ledger; corrections are counter-entries                            |
| `memberships.ap_total`                    | Cached sum for ranking and lists                                               |
| `ranks`                                   | Progress thresholds with optional frame keys and payout metadata               |
| `cosmetic_items` / `membership_cosmetics` | Frames and other cosmetics; unlock + equip                                     |
| `monthly_awards`                          | “Berater des Monats” places 1–3                                                |
| `payouts`                                 | Real-money **claims** (e.g. Team Leader), never auto-transfer                  |

**Currently not shipped in the frontend:** profile frames UI, AP ticker, rank-up choreography, hero screen, collection page, avatar upload UX. Assets are staged under `docs/brand/sprint4-frames/` and are not yet optimized into `public/`.

### Philosophy by element

- **Points** reward productive business activities.
- **Ranks** visualize progress along thresholds (Newcomer → Mentor in seed data).
- **Profile frames** are cosmetic rewards tied to ranks or special recognition.
- **“Berater des Monats”** is recognition, not a career rank.
- **€100 Team Leader reward** is a real business incentive: the system creates an entitlement (`entitled_at`); a human confirms payment (`confirmed_paid_at`). The system never pays out automatically. Uniqueness is enforced on identity (`UNIQUE (identity_id, kind)`), surviving leave/rejoin.

### Hard rule

Gamification must never become the main purpose of the application. If a user can succeed at the game while failing at the business, the design is wrong.

### Open gamification decisions (**currently undefined**)

- Non-zero AP values per event (seeded as `0` until the operator sets them)
- Whether titles like “Founder” attach to identity vs membership
- Whether Developer / Super Admin frames appear in the private profile
- Soft streak decay vs hard reset
- Minimum participant count before the monthly hero screen appears

---

# 6. Technical Architecture

### Stack

| Layer            | Technology                                                               |
| ---------------- | ------------------------------------------------------------------------ |
| Frontend         | React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, PWA |
| Backend platform | Supabase (Auth, Postgres, RLS, Edge Functions)                           |
| Database         | PostgreSQL + pgvector                                                    |
| Hosting          | Netlify (frontend) + Supabase projects (Staging / Production, EU)        |
| CI               | GitHub Actions: lint, format, typecheck, Vitest, build, pgTAP, Gitleaks  |

Architecture decisions are recorded in `docs/adr.md` (ADR-001 through ADR-030).

### Feature-slice architecture

```
src/
  app/        Router, providers, layouts, error boundary
  features/   Isolated product areas (auth, contacts, daily-plan, coach, …)
  shared/     API client, auth, UI primitives, types, config, pure libs
```

Rules:

- Features import only from `shared/` (and React/ecosystem), never from other features
- ESLint `import/no-restricted-paths` makes boundary violations a build failure
- Server state lives in TanStack Query; no second global store as source of truth

### Why business logic belongs in the backend

AscendOS is built for **mobile readiness** (ADR-013): native apps must reuse the same rules.

Therefore:

- Prioritization, invite redemption, RAG, guardrails, achievements, AP awarding, genealogy, and RLS live in Postgres functions/triggers/policies and Edge Functions
- The web client is a replaceable consumer
- AI keys never ship in the browser; coach and ingest run in Edge Functions
- Provider choice for chat may evolve; embeddings and schema constraints (e.g. `vector(1536)`) are deliberate and must not be changed casually

**Note on AI providers (repository state):** Chat currently routes through a fallback chain (Groq → OpenRouter → Cerebras) with Gemini used for embeddings. Older docs still mention Gemini-only or OpenAI-only chat. Treat the Edge Function code as authoritative until documentation is unified.

---

# 7. Database Principles

### Identity vs Membership

- **Identity** (`profiles`): the human / login account (username, names, avatar URL, etc.)
- **Membership** (`memberships`): belonging to an organization — role, team, sponsor membership, status, and (from Sprint 4 foundation) `ap_total`

One identity may have multiple memberships over time. Authorization and genealogy hang on membership, not on the bare identity. Helper functions such as `current_org_id()`, `current_user_role()`, and `active_membership_id()` resolve the active organizational context.

### Organizations

The tenant boundary. Every substantive table carries `org_id`. RLS policies use `current_org_id()` so Mandantengrenzen are enforced in the database, not only in UI.

### Teams

Teams sit under an organization. Invites and profiles/memberships bind users into a team. Team is operational structure; it is not the same thing as a gamification rank named “Team Leader”.

### Pipeline Events

Immutable event log (`pipeline_events`) for contact history. Phase is derived, not stored as a mutable status field. Corrections append `correction` events; consumers that need truth use `effective_pipeline_events`. This is the primary evidence source for business progress and for AP.

### Gamification Ledger

`ap_ledger` is the source of truth for points. `memberships.ap_total` is a maintained projection. Double awards are blocked by uniqueness on `(source_event_id, rule_id)`. Manual and correction paths exist; user roles do not freely INSERT arbitrary points through the client.

### Ranks

Catalog table `ranks`: threshold, label, frame asset key, optional payout cents/kind. Ranks are data — adjustable without shipping new application constants.

### Cosmetics

`cosmetic_items` (catalog) + `membership_cosmetics` (ownership/equip). Kinds include frame, title, badge, event_object. Rank frames unlock when thresholds are reached. At most one equipped item per kind per membership.

### Payouts

`payouts` records entitlements for real incentives. The application creates claims; humans confirm payment. Deletion of related identities is restricted where retention applies. This table is compliance-sensitive and must stay boring, explicit, and auditable.

### Related existing domains (non-exhaustive)

Also present and foundational: invites, contacts, daily plans / items, coach conversations/messages, agents, knowledge docs/chunks/gaps, usage events, journeys / steps / user progress, achievements / user_achievements.

---

# 8. UI Principles

### Consistency

Reuse shared primitives (`Button`, `Input`, `Card`, `Alert`, and future Avatar / RankFrame / ApBadge). Same spacing scale, same tokens, same navigation model (bottom tabs: Heute, Kontakte, Ascent, Mehr).

### Accessibility

Respect contrast guidance from the design system (champagne as text only via `accent-deep`). Maintain usable touch targets (existing guidance: at least ~44px). Support screen-reader labels on navigation and critical actions. Prefer semantic HTML over div-only structures.

### Performance

- Lazy-load heavy parsers and rare screens (pattern already used for PDF/DOCX extraction)
- Optimize brand frames before shipping (source assets in docs must not inflate the PWA)
- Prefer `transform` / `opacity` for motion to avoid layout thrash
- Keep the Today / Contacts paths free of month-rare hero bundles

### Animation philosophy

Few animations, executed well. Motion creates presence and hierarchy — not constant celebration. Rank-up and AP feedback may be expressive; daily workflow remains calm.

### Reduced Motion

Honor `prefers-reduced-motion`. Animations must be disableable, not merely quieter.

### Business-first UX

The first question of every screen: **What is the next productive action?** Empty states should be honest. Coach answers should end in a next step. Daily plan missions should explain why they matter. Gamification chrome must not bury that answer.

---

# 9. Coding Rules

1. **Never break architecture.** Feature slices stay isolated. Business rules stay in Postgres / Edge Functions. Do not invent a parallel client-side authority.
2. **Never duplicate logic.** One rule for phase derivation, AP awarding, invite redemption, achievement checks — shared by all consumers.
3. **Prefer reusable components.** New UI belongs in `shared/ui` when it is cross-feature; feature-local components stay inside the feature.
4. **Catalogs are data.** Ranks, AP rules, agents, tools, journeys, cosmetics — prefer rows over constants that require a deploy to change.
5. **Always explain architectural changes before implementing them.** If a change needs a new ADR, write or update the ADR. If it contradicts this bible, update the bible in the same effort.
6. **Never delete existing code without justification.** Removals need a reason (security, dead path, replaced by generated artifact, etc.) recorded in commit message or ADR.
7. **Migrations are append-only.** Do not edit applied migrations; correct with a new migration (ADR-018).
8. **Generated artifacts are not hand-edited.** `setup/functions/*` and `setup/setup-complete.sql` come from `npm run generate`.
9. **Types discipline.** App code imports domain types from `shared/types/domain.ts`. `database.types.ts` belongs to `npm run db:types` / CI drift checks.
10. **Security defaults.** RLS on every table; SECURITY DEFINER functions must check the caller; no secrets in the repo; coach never stores raw PII in knowledge gaps.

---

# 10. Sprint Overview

Naming caution: the repository historically used “Sprint 4” for the AI coach. The **current** Sprint 4 plan (`docs/sprint-4-plan.md`) means **Gamification foundation**. This section uses the current meaning and labels older tracks explicitly.

### Completed product tracks (present in app + DB)

| Track                                                      | Delivered                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| MVP Sprint 1 — Fundament                                   | Tenancy, profiles, invites, auth, AppShell, genealogy loop                                                          |
| MVP Sprint 2 — Pipeline                                    | Contacts, pipeline events, phases, share tools, timeline                                                            |
| MVP Sprint 3 — Daily Command Center                        | Rule-engine daily plan, focus mode, mission status, day review                                                      |
| MVP Sprint 4 (historical) — Coach                          | Ascent, RAG, agents, ingest, guardrails, eval set                                                                   |
| Sprint 4.5 / 4.6 — Stabilization & audit                   | Usage tracking, corrections, profiles_public, validate-invite rate limit, ErrorBoundary, search/pagination, ADR-023 |
| MVP Sprint 5 — Journey & Progression                       | 7-day journey, Today routing, achievements, firstline progress view                                                 |
| Identity & Membership (Migrations 15–17)                   | `memberships`, active org resolution, mirror sync, registration paths                                               |
| Sprint 4 Gamification — **data foundation** (Migration 18) | AP rules/ledger, ranks, cosmetics, payouts, monthly awards, pgTAP suite                                             |

### Current project state (summary)

- Core business OS for the workday is **implemented and usable** in the web PWA.
- Coach and knowledge **machinery** exist; knowledge content quality and ingestion hygiene remain an operational concern (Phase 0 of the long-term roadmap).
- Gamification is **implemented in the database** and covered by dedicated pgTAP tests; **frontend gamification/profile UI is not implemented yet**.
- AP rule values are seeded at **0** until explicitly configured — ranks will not advance from real activity until values are set.
- `database.types.ts` / `domain.ts` may lag new tables; regenerating types is part of continuing Sprint 4 safely.
- Production migration head relative to Migrations 15–18 must be **verified before** shipping gamification UI (historically flagged as a blocker in the Sprint 4 plan).

### Remaining for current Sprint 4 (Gamification delivery)

Ordered for risk-first delivery:

0. Validate Migrations 15–18 + full pgTAP; regenerate types; confirm production head
1. Set AP values and close open product decisions (streaks, hero minimum, titles)
2. Asset pipeline (optimized WebP + frame geometry)
3. Storage bucket for avatars + policies
4. Shared UI: Avatar, RankFrame, ApBadge (static first)
5. Profile feature (view / edit / upload)
6. Gamification API + rank progress / energy core without heavy effects
7. Wire AP/rank into existing Progress and More surfaces
8. Rank-up motion and AP ticker (`prefers-reduced-motion`)
9. Hero screen + collection (lazy-loaded)
10. Streaks last, with a soft-decay preference unless product decides otherwise

### Explicitly later (roadmap / Phase-0 masterplan — not current Sprint 4 UI)

Examples that are planned in docs but **not** the active gamification delivery:

- Fine-grained permission grants beyond role helpers
- Compensation-plan engine (PT/AP business plan — distinct from gamification AP)
- Product catalog / smartlinks
- Notifications, push, news, events calendar
- Full i18n message catalogs
- DSGVO export/delete automation (launch checklist item; not optional forever)
- Broader leader analytics dashboards

---

# 11. Future Vision

AscendOS aims to become the best **AI-powered Business Operating System for Network Marketing**.

Long-term direction (from roadmap and ADRs, not a claim of present completeness):

- Activate a curated, status-aware team knowledge base so Ascent answers from real team truth
- Deterministic qualification and license tooling where numbers must never be “guessed” by a model
- Leadership views that activate downline without exposing foreign contact identities
- Activity targets and follow-up cadence that attack the real bottleneck: consistent outreach
- Recognition systems bound to activity and milestones — never to income theater
- Multi-organization scale with the same security model
- Optional richer clients later, because the backend already owns the rules

The north star does not change: **help people do the business**, every day, with clarity and integrity. Gamification, AI, and polish exist to serve that outcome — never to replace it.

---

## Document maintenance

- Update this bible when a sprint changes the product surface or an ADR changes a permanent rule.
- Do not silently diverge: if code and bible disagree, fix the false one in the same change set.
- For AI agents: read this file first, then `docs/adr.md`, then the relevant feature folder and migrations. Do not invent features marked here as unfinished or undefined.
