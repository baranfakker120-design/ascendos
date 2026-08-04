# Sprint 5 — Technical Architecture & UX Strategy

**Status:** Binding product + engineering contract  
**Mission:** AscendOS becomes a daily Leadership Operating System — begin and end every workday here.  
**Rule:** Layers ship sequentially. No parallel feature sprawl.

---

## 0. North Star

> Not: “I open AscendOS when I need something.”  
> But: “I start and finish every workday with AscendOS.”

**Primary metric — Daily Closing Rate**  
Share of active users who, on a given local day:

1. Commit a priority  
2. Record at least one proven action (mission / pipeline)  
3. Close the day intentionally  

**Secondary — Time-to-Outreach**  
App open → first real contact attempt.

Every screen must answer: **What is the most important action now?**  
If it does not, rewrite it.

---

## 1. The three pillars (product)

| Pillar | Systems | Job |
|--------|---------|-----|
| **Day Memory** | Closing Loop → Decision Diff | Truth across days |
| **Day Constraint** | One-Tap Day → Gravity Engine | One action, physics of neglect |
| **Moment of Truth** | Conversation Prep → Coach as Surface | Magic at the point of outreach |

Coach is **not** chat-first. Coach appears where decisions happen.

---

## 2. Strict build order

```
1. Closing Loop
2. Decision Diff
3. One-Tap Day
4. Gravity Engine
5. Conversation Prep
6. Coach Surface Integration
```

A layer is “done” only when: UX is shippable, pure logic is tested, no regression on Today / plan / coach, and the next layer has a clear read API.

---

## 3. Architecture principles

1. **Compose, don’t replace** — `pipeline_events`, `daily_plans` / `daily_plan_items`, `usage_events`, leadership warnings, coach org intelligence, offline outbox stay authoritative.
2. **Deterministic truth, adaptive presentation** — scores and diffs from events/rules; copy may be coached, numbers never invented by a model.
3. **Local day memory first** — Closing Loop / Diff seed in IndexedDB (keyed by `userId + planDate`). Optional `usage_events` insert (`day_closed`) for analytics; no parallel schema junkyard.
4. **One priority engine** — Gravity explains and ranks; `generate_daily_plan` remains source of mission candidates. Never a second competing plan RPC.
5. **Human sends** — Prep drafts only; never auto-message.
6. **No new nav tabs / KPI walls / widget dashboards.**

```
┌─────────────────────────────────────────────────────────┐
│  Today (Home)                                            │
│  Stories · Live · Sync · [Day Memory / Constraint] ·    │
│  Coach surfaces (briefing / prep / suggestions)          │
└──────────────────────────┬──────────────────────────────┘
                           │ reads / writes
┌──────────────────────────▼──────────────────────────────┐
│  Day Memory Store (IDB)                                  │
│  DayOpenRecord · DayCloseRecord · tomorrowSeed           │
└──────────────────────────┬──────────────────────────────┘
                           │ evidence
┌──────────────────────────▼──────────────────────────────┐
│  Existing truth                                          │
│  daily_plans · pipeline_events · usage_events · warnings │
│  coach intelligence (client pure functions)              │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Layer contracts

### L1 — Closing Loop

**UX**  
Intentional end-of-day ceremony (not passive AP summary). One question: *Did today’s most important work land?* Then close. Seeds tomorrow.

**Data**

```ts
DayCloseRecord {
  version: 1
  userId, planDate, closedAt
  outcome: 'done' | 'partial' | 'missed'
  priorityItemId?, priorityTitle?, priorityMissionType?
  missionsDone, missionsTotal, missionsSkipped, missionsDeferred
  openTitles: string[]          // carry into Diff
  tomorrowSeed: string[]        // human-readable carry-overs
  source: 'missions_complete' | 'manual_close'
}
```

**Surfaces**  
- After missions complete → Closing Loop (must tap close)  
- From Focus Mode → “End workday” (honest partial/missed)  
- After close → calm Closed Day state (no re-nag)

**Hooks**  
`DayReview` → `ClosingLoop`; `TodayDailyPlan` state machine; IDB via `@shared/offline/idb`.

### L2 — Decision Diff

**UX**  
Morning: *What changed since yesterday that matters?* Reads yesterday’s `DayCloseRecord` + today’s plan/warnings/events. Ends in one implied priority handoff to L3.

**Pure function**  
`buildDecisionDiff({ yesterdayClose, todayPlan, warnings, contactsHeat }) → DiffCard[]`  
Max 3–5 lines. No dashboard.

### L3 — One-Tap Day

**UX**  
After commit (or instead of multi-mission menu): **one** action. Done / later-with-consequence / skip-with-consequence. Queue is invisible until current resolves.

**Constraint**  
`FocusMode` becomes the only work mode; MorningCommit collapses toward single priority selection (still backed by full plan items in DB).

### L4 — Gravity Engine

**UX**  
Neglect has weight. Follow-ups pull into the one action with WHY proof.

**Pure function**  
`scoreFollowUpGravity(contact, events, now) → number`  
Feeds ordering hints / reason copy; does **not** fork `generate_daily_plan`.

### L5 — Conversation Prep

**UX**  
≤8s pack on contact / One-Tap “Now”: phase, last events, risk, next question, draft, compliance soft-guard. Compose existing timeline + person insight + drafts.

### L6 — Coach as Surface

**UX**  
Wire Ascent into Diff, Closing, One-Tap, Prep, Gravity WHY — chat remains escape hatch. Proactive suggestions subordinate to the day’s one action.

---

## 5. UX strategy (cross-cutting)

| Principle | Application |
|-----------|-------------|
| One job per region | Mission region = action; briefing = context; never both competing CTAs |
| Motion with meaning | Close ceremony 2–3s max; Diff enter; Prep reveal — honor `prefers-reduced-motion` |
| Calm premium | Existing monochrome + champagne; no game HUD on workday |
| Empty honesty | No close → no fake “all good”; Diff says “No close yesterday — start clean” |
| Offline | Close must succeed offline (IDB); usage insert best-effort when online |

**Home stack (unchanged order, smarter middle):**  
Stories → Live Coaching → Sync → **Day Memory / Constraint mission** → CEO surface → Coach OS chips  

---

## 6. Explicit non-goals (Sprint 5)

- New bottom-nav destinations  
- WhatsApp inbox / auto-send  
- Comp-plan simulator as sprint heart  
- Casino streaks / public shame boards  
- Multi-agent persona zoo  
- Analytics chart walls  
- Knowledge corpus mass-ingest as blocker for L1–L4  

---

## 7. Test strategy

| Layer | Tests |
|-------|--------|
| L1 | `buildCloseSnapshot`, dayMemory store roundtrip, Today state transitions (unit) |
| L2 | `buildDecisionDiff` fixtures |
| L3–L4 | mission order + gravity pure tests |
| L5 | prep composer from timeline fixtures |
| L6 | surface wiring / suggestion filter tests |
| Always | existing `missionOrder`, offline sync, analyzeOrg smoke |

---

## 8. Rollout discipline

Ship L1 behind no flag if stable — Closing Loop is additive on Today.  
Each layer: implement → unit tests → manual Today path → commit/push → then next layer.

**This document is the contract.** Feature ideas that do not serve Daily Closing Rate or Time-to-Outreach wait.
