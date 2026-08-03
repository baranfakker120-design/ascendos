# ASCENDOS CONSTITUTION v1.0

**Status:** Highest product and engineering authority  
**Effective:** 2026-08-03  
**Location:** `docs/ASCENDOS_CONSTITUTION_v1.md`  
**Audience:** Every human developer, product owner, and AI agent working on AscendOS  

---

## Preamble — Authority

This Constitution is the **highest authority** of AscendOS.

1. Every Pull Request must comply with this Constitution.
2. Where this Constitution and older notes, tickets, or chat prompts conflict, **this Constitution wins**.
3. Where this Constitution and the live repository conflict on facts (schemas, RPCs, shipped UI), resolve against the repository, then **update this Constitution** in a dedicated documentation PR.
4. Architecture Decision Records (`docs/adr.md`), the Security Baseline (`docs/security-baseline.md`), and the Design System (`docs/design-system.md`) are **implementing instruments** of this Constitution. They may refine how a rule is applied; they may not overturn a constitutional principle without an explicit Constitution amendment.
5. AI agents and contractors are bound by the same rules as permanent engineers. “The prompt asked for it” is not authority over this document.

**Why this exists:** AscendOS is built by a small team and many automated agents. Without a single written authority, each sprint invents a new product. Constitutions prevent accidental redesign of philosophy through feature creep.

---

## Chapter 1 — Vision

AscendOS is a professional **Business Operating System for Network Marketing**.

It exists so sponsors and consultants can run their workday with clarity:

- who to contact,
- what to do next,
- how the pipeline moves,
- how the team grows,
- how knowledge and coaching support real conversations,
- how leadership becomes measurable without becoming manipulative.

AscendOS starts in the Team Şeyda / Chogan / Essence Tribe context, but the architecture is multi-tenant from day one so additional organizations can share the platform without a rewrite.

**Why:** The documented bottleneck of the business is not tool scarcity — it is consistent outreach, follow-up, onboarding, and leadership. AscendOS exists to remove friction from that real work, not to invent a parallel entertainment product.

---

## Chapter 2 — Mission

Help every sponsor build:

- stronger personal discipline,
- stronger firstline leaders,
- healthier organizations,
- cleaner pipelines,
- fairer recognition of productive activity.

The AI coach **Ascent** acts as a virtual **Geschäftsführer / COO**: it watches the organization, explains why something matters, and recommends the next high-value action — without seizing control from the human sponsor.

**Why:** Leadership in network marketing fails when sponsors react late, forget people, or chase vanity metrics. A calm operating system that thinks ahead compounds trust and growth better than another chat gadget.

---

## Chapter 3 — Product Philosophy

### 3.1 Business first. Gamification second.

Every feature must improve business productivity first: outreach, follow-up, pipeline discipline, onboarding, coaching quality, leadership visibility, or operational safety.

Gamification (AP, ranks, frames, stickers) exists only to increase **motivation**, **consistency**, and **engagement**. It must never become the reason the application exists.

### 3.2 Clarity over cleverness

Prefer one obvious next action over ten optional widgets. Prefer plain language over jargon. Prefer durable event history over mutable status fields where history matters.

### 3.3 Human authority remains final

AI may prioritize, draft, warn, and explain. AI may **not** autonomously message contacts, award AP, alter genealogy, or make irreversible people decisions without explicit sponsor confirmation.

### 3.4 Data is the memory of the business

Pipeline events, usage events, memberships, and verification proofs are the measurement layer. Product decisions should rest on recorded activity, not on button taps that feel productive.

**Why:** Tools that feel busy but do not change outreach behavior fail the company’s own diagnosis. Philosophy that privileges real activity keeps AscendOS honest.

---

## Chapter 4 — Core Values

| Value | Meaning | Why |
| --- | --- | --- |
| **Integrity** | No fake AP, no fake ranks, no silent data leaks | Trust is the only durable currency in a team product |
| **Respect** | No pressure tactics, no income promises, no humiliation UX | DACH compliance and human dignity |
| **Clarity** | Every recommendation explains WHY | Sponsors act when they understand, not when they are scored |
| **Calm premium** | Quiet confidence, not SaaS loudness | Matches brand DNA and long work sessions |
| **Accountability** | Server-side authority for money-like and permission-like rules | Clients lie; databases with RLS do not negotiate |
| **Stewardship** | Protect privacy of downline, contacts, and knowledge | Genealogy visibility is a privilege, not a dump |
| **Restraint** | Ship less chrome; surface only high-value signals | An annoying coach destroys the product |

---

## Chapter 5 — UI Principles

1. **One job per region.** A screen area has one primary purpose and one primary headline action.
2. **Hierarchy before decoration.** Size, weight, and spacing create priority — not badges, glow, or emoji clusters.
3. **Brand is quiet in work UI.** The claim “Build a better tomorrow” belongs on login/marketing surfaces, never as wallpaper in the workday tools.
4. **Monochrome + champagne accent.** No blue as a brand/function color. Champagne is a spice, not a paint (`docs/design-system.md`).
5. **Functional colors stay functional.** Warm red/green for overdue/done — readable status beats aesthetic purity.
6. **Cards only when they earn their border.** Prefer open layout; cards for interactive containers or true grouping.
7. **No redesign by accident.** Additive features must not restyle unrelated screens “while we are here.”

**Why:** Premium products feel expensive because they refuse visual noise. Every extra chip competes with the next call the sponsor should make.

---

## Chapter 6 — UX Principles

1. **Mobile is the center of gravity.** Design for one-handed phone use first; desktop must work, but phone decides defaults.
2. **Today, Contacts, Coach, Team** are the workday spine. Protect their speed and clarity above secondary hubs.
3. **Context travels with the user.** Opening Coach from a contact or team member should carry identity context without forcing re-explanation.
4. **Confirmations for irreversible acts.** Deletes, corrections that affect phase, and AP-relevant verifies need explicit confirmation.
5. **Empty states teach the next step.** Never leave a blank void without a single clear action.
6. **Errors are human and recoverable.** Prefer “try again” and local recovery over stack traces.
7. **Do not nag.** Proactive Coach tips must be high-value, few, and remember what was already shown.

**Why:** Network marketers use AscendOS between real conversations. Friction, ambiguity, or notification spam pushes them back to chaotic WhatsApp habits.

---

## Chapter 7 — Premium Design Rules

1. **Inspiration direction (not clones):** Apple, Vision Pro spatial calm, Linear density discipline, Stripe trust, Notion clarity.
2. **Materials:** Glass/surface, hairline borders, restrained shadows — no neon, no multi-layer glow stacks as identity.
3. **Typography:** Inter for UI readability; brand moments through treatment (tracking, case, weight), not font circus.
4. **Champagne accent usage:** Progress, active tab, milestones, Ascent cues — never primary button fills or body text (use `accent-deep` for text).
5. **Silver:** Logo and rare milestone moments only — never as a functional UI color (contrast failure).
6. **Motion is presence, not entertainment.** See Animation Rules.
7. **Rank frames and AP stickers** celebrate productive work; they must never obscure the next business action.

**Why:** The brand family (AscendOS / Essence Tribe / Team Şeyda) is geometric, monochrome, and spacious. Loud gamification would contradict the brand and reduce trust with serious leaders.

---

## Chapter 8 — Apple Quality Guidelines

Treat “Apple quality” as an operational bar, not a visual cosplay:

1. **Hit targets** large enough for thumbs; no microscopic icons as the only affordance.
2. **Predictable navigation**; back stacks and deep links must not strand users.
3. **Respect safe areas** and keyboard avoidance on mobile web / PWA.
4. **Reduce motion** when `prefers-reduced-motion` is set.
5. **No surprise permissions**; explain before asking for camera/share/notifications.
6. **Finish states feel complete** — success is quiet confirmation, not fireworks that block the next tap.
7. **Consistency of components** across Team, Contacts, Coach, Today — same buttons, sheets, and language.

**Why:** Consultants judge software the way they judge a flagship phone: if it feels cheap once, they never fully trust it with their livelihood.

---

## Chapter 9 — Performance Rules

1. **Workday tools must feel immediate.** Today, Contacts, and Coach are latency-critical.
2. **No React state per animation frame** for pan/zoom cameras (genealogy viewport pattern).
3. **Virtualize heavy lists and trees.** Do not mount thousands of DOM nodes.
4. **Lazy-load heavy libraries**; keep the critical path thin.
5. **Assets sized for display**, not source giants.
6. **Reuse React Query caches**; do not invent duplicate fetches for the same dashboard.
7. **Coach intelligence must be lightweight:** prefer cached leadership/contact/tree data; avoid side-effect RPCs (for example, do not trigger `generate_daily_plan` merely to render a briefing).
8. **Performance regressions are product bugs**, not “nice to fix later,” when they hit the workday spine.

**Why:** A slow operating system trains sponsors to abandon it for notes apps. Speed is a leadership feature.

---

## Chapter 10 — Animation Rules

1. Ship intentional motion (2–3 meaningful moments), not decoration storms.
2. Prefer opacity/transform on the compositor thread.
3. Genealogy gestures: refs + `requestAnimationFrame`, not re-renders per frame.
4. Celebrations must never block the primary CTA for more than a brief moment.
5. Honor `prefers-reduced-motion`.
6. Do not add particle systems, WebGL flex, or parallax to prove modernity.

**Why:** Motion should communicate hierarchy and continuity. Entertainment motion competes with the call the sponsor needs to make.

---

## Chapter 11 — Accessibility

1. Semantic HTML and labels for icon-only controls.
2. Keyboard operability for primary flows where feasible on desktop.
3. Color is not the only status channel (text/icons accompany red/green).
4. Contrast: champagne text uses `accent-deep` on light surfaces.
5. Genealogy canvas must keep a usable alternative path (list/detail patterns) — visual tree alone is insufficient for accessibility.
6. Screen-reader names for Coach actions and share verification steps.

**Why:** Accessibility is quality and market reach. It also forces clearer information architecture for everyone.

---

## Chapter 12 — Genealogy Rules

1. **Authority lives in Postgres:** `memberships.sponsor_membership_id` (+ RLS / SECURITY DEFINER RPCs). The client never invents hierarchy.
2. **Tree UI may be premium and virtualized**, but must not invent relationships or permissions.
3. **Do not casually rewrite the genealogy engine** (`src/features/genealogy/engine/`) for cosmetic requests. Engine changes require explicit performance and correctness review.
4. **Read-only vs editable** must follow membership reality: viewers may see structure; only entitled members mutate notes/favorites/actions.
5. **Coach thought bubbles** (person insights) are additive overlays that analyze existing node metrics; they must not change layout math, RPCs, or permission model.
6. **Team page IA:** `/team` is the tree; Team Seyda Guide remains a separate content surface.
7. **No org-wide profile dumps** as a tree source — use the dedicated tree RPC / approved fallbacks.

**Why:** Genealogy is trust-sensitive and computationally sensitive. A beautiful wrong tree destroys leadership confidence faster than a plain correct tree.

---

## Chapter 13 — Permission Rules

1. **RLS-first.** Security attaches to data, not to a single client path (`docs/security-baseline.md`).
2. **Membership-based authorization** (active org membership, roles) — not “the UI hid the button.”
3. **`SECURITY DEFINER` is exceptional** and must document why; otherwise `SECURITY INVOKER`.
4. Prefer `auth.uid()` with no spoofable user parameters when “self” is meant.
5. Cross-person reads require ancestor/leader entitlement checks.
6. Knowledge retrieval must never become a secret dump (passwords, invite tokens, private credentials do not belong in RAG corpora).
7. Super-admin powers are narrow and auditable.

**Why:** One DEFINER mistake leaked third-party personal data historically. Permission discipline is constitutional because the failure mode is other people’s lives, not a 500 page.

---

## Chapter 14 — AP Integrity Rules

1. **AP is earned for verified productive activity**, not for tapping “share.”
2. Actions that require proof (notably Onboarding share and Firmenpräsentation share) follow:  
   **Share completed OR screenshot uploaded → Pending → Verified → then existing pipeline/AP award.**
3. **Never auto-verify** screenshots via AI guesses. Low confidence stays `pending` / `pending_review`.
4. **One AP award per contact + action.** Duplicates show “Bereits für diesen Kontakt bestätigt.”
5. Clients must not write AP ledgers directly; they trigger existing trusted flows only after verification gates.
6. Correcting mistakes uses explicit correction flows — history remains visible (ADR event integrity).
7. Pending proofs surface as **“Warte auf Nachweis”** — never as silent success.

**Why:** If AP can be farmed, ranks and recognition become fiction, and serious leaders abandon the system.

---

## Chapter 15 — Ranking Rules

1. Ranks and TeamLeader progress are **derived from trusted server rules**, not client cosmetics.
2. Rank frames are celebration and identity — not a substitute for leadership work.
3. Do not change ranking formulas casually inside unrelated PRs.
4. UI may explain remaining AP / firstlines; it may not invent progress.
5. Recognition features (Berater des Monats, frames) must remain fair and data-grounded.

**Why:** Rank is social status inside the organization. Gaming ranks destroys culture.

---

## Chapter 16 — Coach Philosophy

1. The coach product name is **Ascent**.
2. Ascent behaves like an experienced **Geschäftsführer**: professional, friendly, calm, data-driven, honest, never manipulative.
3. Ascent **prioritizes long-term leadership over short-term numbers**.
4. Every recommendation includes **WHY**.
5. Ascent may draft messages; the sponsor reviews. **No automatic sending** unless the sponsor explicitly enables a future automation — default OFF, every auto-message logged, disable anytime.
6. Ascent should notice organizational issues early (inactivity, onboarding gaps, forgotten contacts, weak legs, pending proofs) but **must not become annoying**.
7. Coach chat UI stability (thread, bubbles, markdown, composer) is sacred — intelligence layers add beside it, they do not rewrite it casually.
8. Contact/team context deep-links should make Ascent useful without forcing users to restate facts.

**Why:** A coach that pressures, hallucinates income, or spams tips becomes the enemy of the brand. A calm COO compounds sponsor skill.

---

## Chapter 17 — AI Philosophy

1. **AI assists; humans decide.**
2. Prefer retrieval of approved knowledge with compliance metadata over unconstrained model improvisation.
3. No income promises, no health claims, no illegal marketing advice.
4. Secrets never enter embeddings or prompts as retrievable facts.
5. Vision/screenshot understanding is **architecture-first**; shipping OpenAI (or any vendor) requires an explicit PR with privacy review — stubs must not silently call networks.
6. Model keys stay in Edge Functions / server secrets — never in the Vite bundle.
7. Evaluate coaching quality with fixtures (`docs/coach-eval-set.md` spirit): insight → why → next step.
8. When uncertain, Ascent should say what is unknown rather than invent CRM facts.

**Why:** AI without compliance and privacy discipline can destroy the company faster than missing features.

---

## Chapter 18 — Privacy Rules

1. Collect the minimum required for the business OS (contacts the user owns, team visibility they are entitled to).
2. Downline privacy: leaders see progress aggregates and entitled tree fields — not a voyeur dashboard of private coach chats.
3. Screenshots and share proofs are sensitive; treat them as personal activity evidence, not public feed content.
4. Do not log raw message bodies of private conversations to third parties without purpose limitation.
5. Export/delete expectations should follow platform capabilities and legal requirements as the product matures.
6. Multi-tenant `org_id` boundaries are privacy boundaries.

**Why:** AscendOS holds the social graph of people’s livelihoods. Privacy failures are existential.

---

## Chapter 19 — Security Rules

1. Follow `docs/security-baseline.md` for every new table, view, RPC, and Edge Function.
2. RLS on by default; policies tested (pgTAP) in CI.
3. No shared passwords in knowledge bases.
4. Invite codes are single-use / expiry controlled as designed — not permanent backdoors.
5. Dependency and secret scanning stay in CI.
6. Prefer explicit allowlists for dangerous operations.
7. Security fixes outrank feature work when integrity is at risk.

**Why:** A business OS that leaks a downline or contacts cannot be premium; it is a liability.

---

## Chapter 20 — Database Rules

1. **Postgres is the system of record.**
2. Multi-tenancy: `org_id` + RLS (ADR-002).
3. Prefer event-sourced pipeline history over mutable status-only models (ADR-003).
4. Genealogy source of truth remains membership sponsor links (ADR-004).
5. Schema changes require migrations, types regeneration discipline, and CI database tests.
6. **Do not change schema “for convenience”** in feature PRs that can be solved client-side or with existing RPCs — especially Coach intelligence and verification UX.
7. Generated `database.types.ts` is not hand-poetry; domain unions live in `src/shared/types/domain.ts`.

**Why:** Schema churn is the most expensive debt in a small team. Stability enables agent-assisted development without constant breakage.

---

## Chapter 21 — Backend Rules

1. Business authority in SQL functions / Edge Functions with explicit authz — not in the browser.
2. Soft-fail optional RPCs where product already adopted that resilience pattern — never white-screen the Team hub because one leadership RPC is missing.
3. Edge Functions: validate JWT, enforce quotas (Coach), sanitize outputs.
4. Idempotent generators (`generate_daily_plan`) must remain safe to call, but clients should still avoid needless calls.
5. Bundled function artifacts stay in sync with source (`generate:check` in CI).

**Why:** Backend rules keep every future client (PWA, native shell, admin) honest under the same law.

---

## Chapter 22 — Frontend Rules

1. Feature-sliced structure (`src/features/...`) with shared UI/lib — no dumpster `utils`.
2. Additive modules preferred over rewriting stable surfaces (Coach intelligence under `coach/intelligence/`).
3. Do not “drive-by refactor” unrelated files in a feature PR.
4. React Query for server state; localStorage only for explicitly client-scoped concerns (verification drafts, CEO memory, automation prefs) until a durable store is approved.
5. TypeScript strictness is mandatory; `any` is a last resort with justification.
6. Respect existing layout shells (AppShell, Coach fill layout) — do not invent parallel navigation.

**Why:** Frontend chaos is how agents accidentally redesign the product every week.

---

## Chapter 23 — Mobile First Rules

1. Primary persona uses a phone on the go.
2. Bottom navigation remains the home for core pillars.
3. Touch-first controls; hover is enhancement.
4. Sheets and compact briefings beat wide dashboards on small screens.
5. Test critical flows at narrow widths before merge when UI changes.
6. PWA install / offline expectations evolve carefully — never break the installed app shell casually.

**Why:** If AscendOS is awkward on a phone, it is not an operating system for this industry.

---

## Chapter 24 — Offline Rules

1. Do not pretend full offline CRM if the architecture is online-first.
2. Where offline is claimed, define exactly what works (read cache vs write queue).
3. Never silently drop user-entered contacts or events.
4. Coach and leadership intelligence may degrade gracefully when RPCs fail — empty honest states over crashes.
5. Future offline queues require conflict rules before implementation.

**Why:** False offline promises cause double-entry and lost trust.

---

## Chapter 25 — Testing Rules

1. Pure business logic gets unit tests (AP display helpers, verification gates, Coach analyzers, genealogy layout math).
2. Database RLS and critical RPCs get pgTAP coverage in CI.
3. Tests must not import browser-only barrels that instantiate Supabase clients under Node 20 CI without WebSocket — import pure modules directly.
4. Do not delete tests to make CI green; fix the product or the test.
5. Manual test notes belong in the PR for UX-sensitive flows (share verification, tree bubbles, Coach briefing).

**Why:** AscendOS is agent-heavy. Tests are the constitution’s enforcement arm.

---

## Chapter 26 — CI Rules

1. Lint, typecheck, unit tests, production build, format check, secret scan, and database tests are gates — not suggestions.
2. Warnings may exist historically; **new errors must not ship**.
3. `generate:check` keeps SQL/function bundles honest.
4. A red CI PR is not “done.”
5. Flaky tests are defects; quarantine requires an issue and owner, not silence.

**Why:** Without CI law, the Constitution is literature.

---

## Chapter 27 — Pull Request Rules

1. **One intent per PR.** Do not mix Coach intelligence with ranking formula changes.
2. PR description must state: what changed, what explicitly did **not** change, and how it was tested.
3. Constitution compliance is mandatory: if a PR violates a chapter, amend the Constitution first in a docs PR, or redesign the feature.
4. Prefer draft PRs until CI is green.
5. No unrelated reformatting or dependency bumps inside feature PRs.
6. Screenshots/recordings for visual changes when feasible.
7. Agents must not claim “no genealogy changes” while rewriting the layout engine — name the real blast radius.

**Why:** Review bandwidth is limited. Small, honest PRs protect production.

---

## Chapter 28 — Domain Clarity Rules (Product Facts)

These facts are constitutional product language:

1. **Firmenpräsentation** and **Onboarding** are separate actions and must never be merged.
2. **Firmenpräsentation** presents the business opportunity to prospects.
3. **Onboarding** (formerly visible as WayToMoon / MyWayToMoon) is the **final activation step after a consultant registers** — business basics, compensation understanding, first steps, team expectations, resources, and guidance into Austauschgruppe and Nina Informationsgruppe. It is **not** recruiting and **not** a presentation.
4. Visible product copy uses **Onboarding**; technical keys may remain `waytomoon` for compatibility until a planned migration.
5. Canonical onboarding URL: `http://waytomoon.netlify.app`.

**Why:** Confusing presentation with onboarding creates wrong coaching, wrong AP semantics, and wrong sponsor behavior.

---

## Chapter 29 — Future Vision

AscendOS aims to become the default operating system for modern network-marketing leadership:

- proactive organizational intelligence without nagging,
- verified activity economies,
- premium genealogy at scale,
- coach that remembers objections, promises, and outcomes,
- optional automations that are transparent and revocable,
- vision understanding of chat screenshots and documents — privacy-preserving and never auto-awarding AP,
- multi-organization white-label readiness without forking the core.

Future features must still pass the bottleneck test: **Does this increase real outreach, follow-up, onboarding completion, or healthy leadership — or does it only feel like building tools?**

---

## Chapter 30 — What AscendOS Should NEVER Become

1. **Never a casino.** AP farming, loot-box psychology, or dopamine dark patterns.
2. **Never a surveillance dystopia.** No stalking of private lives beyond entitled business visibility.
3. **Never an income-promise machine.** No earnings tables as marketing copy inside Coach.
4. **Never a prompt playground.** AI features without product law, evals, and privacy review.
5. **Never a redesign treadmill.** Visual rewrites every sprint that erase user memory.
6. **Never a second WhatsApp.** Auto-messaging people without consent and logging.
7. **Never a schema junkyard.** Tables and RPCs for every whim.
8. **Never a broken tree demo.** Genealogy that looks premium but lies about permissions or performance.
9. **Never an annoying COO.** Notification spam, repeated tips, guilt UX.
10. **Never “move fast” at the cost of RLS.** Speed without security is sabotage.

**Why:** The fastest way to kill AscendOS is to succeed at the wrong product.

---

## Chapter 31 — Amendment Process

1. Amendments are documentation PRs titled clearly (e.g. `docs: Constitution v1.1 — …`).
2. Each amendment must state which chapters change and why.
3. Code may not silently redefine philosophy; philosophy changes land in this file first or simultaneously.
4. Versioning: break changes increment minor (`v1.1`); worldview shifts increment major (`v2.0`).

---

## Chapter 32 — Oath for Contributors and Agents

Before writing code, affirm:

- I will improve business productivity, not vanity.
- I will explain WHY to users when I recommend.
- I will not award AP without integrity.
- I will not weaken RLS or invent permissions in the client.
- I will not rewrite genealogy, rankings, or rewards inside unrelated work.
- I will keep Coach calm, honest, and non-autonomous by default.
- I will leave CI green.
- I will treat this Constitution as law.

---

## Closing

AscendOS is not entertainment software with a CRM attached.  
It is a **premium operating system for human leadership**, measured by cleaner pipelines, stronger firstlines, and sponsors who know what to do next — and why.

End of ASCENDOS CONSTITUTION v1.0.
