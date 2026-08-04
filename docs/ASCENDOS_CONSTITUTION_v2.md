# ASCENDOS CONSTITUTION v2.0

**Status:** Highest **product decision** authority  
**Effective:** 2026-08-04  
**Location:** `docs/ASCENDOS_CONSTITUTION_v2.md`  
**Audience:** Every human developer, product owner, designer, and AI agent working on AscendOS  
**Relationship to v1:** `docs/ASCENDOS_CONSTITUTION_v1.md` remains binding for engineering, security, domain language, CI, and platform law. **Where product, UX, or feature-priority guidance conflicts, this v2 document wins.**

---

## Preamble — Permanent Product Law

These ten rules are not suggestions. They are permanent product law.

1. Every Pull Request that changes product behavior, UI, Coach, Today, Contacts, Team, or motivation systems **must comply** with this Constitution v2.
2. “Competitors have this feature” is **not** a valid justification for a PR.
3. “The prompt asked for it” is **not** authority over this document.
4. If a proposed screen or flow cannot satisfy these rules, **redesign it** — do not ship an exception.
5. Amendments require a dedicated documentation PR that updates this file and states what changed and why.

**Why this exists:** AscendOS becomes valuable when it creates better leadership decisions every day — not when it accumulates screens. Sprint 5 proved the path: memory, constraint, prep, and Coach-as-surface. Constitution v2 locks that philosophy so future PRs cannot dilute it.

---

## RULE #1 — One question per screen

**Every screen must answer one question:**

> **What should I do now?**

If a screen cannot answer this question clearly, it must be redesigned.

### Implications

- Primary CTA is obvious without hunting.
- Secondary information supports the action; it does not compete with it.
- Dashboards that only display status without a next action violate this rule.
- Empty states must still answer the question (e.g. “Add a contact” / “Close the day”).

### PR test

Reviewers ask: _After three seconds on this screen, does a leader know the next move?_  
If no → block merge until redesigned.

---

## RULE #2 — Every tap reduces uncertainty

**Every tap must reduce uncertainty. Never increase complexity.**

### Implications

- A tap that opens five new choices without collapsing priority is a product failure.
- Settings and power tools may exist, but the workday path must get simpler with use, not denser.
- Adding a field, chip, or filter requires proof that it removes a real decision burden.

### PR test

_Does this interaction leave the user more sure what matters — or more overloaded?_

---

## RULE #3 — Coach appears automatically

**Coach appears automatically. Users should not search for Coach.**

Coach appears **where decisions happen**.

### Implications

- Chat is an escape hatch, not the home of intelligence.
- Surfaces: Decision Diff, One-Tap / Focus, Conversation Prep, Closing Loop, Gravity WHY, leadership warnings.
- “Open Coach and ask…” as the only path to insight violates this rule.
- Proactive Coach must remain high-value, few, and non-nagging (see Constitution v1 Chapter 6).

### PR test

_Can a leader receive Ascent’s help without navigating to a chat tab?_

---

## RULE #4 — One truth. One recommendation. One action.

**Never show five equally important tasks.**

### Implications

- Lists may exist as queues, but the UI must crown **one** current action.
- Equal visual weight across five missions is forbidden on the workday spine.
- If the system cannot choose, it must still propose a default and explain WHY (Rule #8).

### PR test

_Is there a single dominant next action, or a menu pretending to be clarity?_

---

## RULE #5 — Build what competitors cannot copy

**Never build features because competitors have them.**  
**Build features competitors cannot copy.**

### Implications

- Moat comes from event truth, day memory, gravity, prep at the moment of outreach, and leadership OS loops — not from cloning CRM tabs.
- Feature proposals must state the unique AscendOS advantage, not a competitor checklist.
- Classic MLM-app patterns are explicitly non-goals unless they pass Rules #1–#4 and #10.

### PR test

_Would this still be worth building if every competitor already shipped a weaker version?_

---

## RULE #6 — Evidence before motivation

**Coach must motivate using real events. Never invent progress.**

### Implications

- Wins, streaks-adjacent signals, AP-facing celebration, and “you’re doing great” copy require recorded evidence (`pipeline_events`, `usage_events`, plan outcomes, verified activity).
- Hallucinated praise, fake deltas, or unverified screenshot AP are constitutional violations.
- Closing Loop and Decision Diff must not invent yesterday’s truth.

### PR test

_What immutable event or projection backs this motivational claim?_

---

## RULE #7 — No dead screens

**Every screen ends with an action.**

### Implications

- Informational panels without a next step are incomplete.
- “Nice to know” without “do this” belongs in secondary docs, not the workday spine.
- Closed Day still ends with a calm next path (rest / pipeline / tomorrow seed) — not a void.

### PR test

_What does the user do when they finish reading this screen?_

---

## RULE #8 — Every AI recommendation explains WHY

**Every AI recommendation must explain WHY.**

### Implications

- Insight → WHY → next step is mandatory for Ascent surfaces.
- Scores without reasons are forbidden in leadership-facing UI.
- “Because the model said so” is not a WHY; cite events, rules, gravity, or org signals.

### PR test

_Can the sponsor repeat the reason in one sentence without opening chat?_

---

## RULE #9 — The best interface often disappears

**Prefer invisible assistance over visible chrome.**

### Implications

- Prep that appears at the moment of outreach beats a new Prep tab.
- Diff that appears at morning commit beats a History dashboard.
- Do not add navigation destinations when an in-context surface suffices.
- Animation and decoration must serve hierarchy, not announce themselves.

### PR test

_Did we add UI — or remove thinking?_

---

## RULE #10 — Better leaders, not better dashboards

**AscendOS exists to create better leaders, not better dashboards.**

### Implications

- Success metrics favor outreach, follow-up, day closing, and firstline health — not screen count or chart density.
- KPI walls, vanity leaderboards, and BI cosplay without action paths violate this Constitution.
- Every epic must answer: _How does this make a sponsor a better leader this week?_

### PR test

_If this ships, does leadership behavior improve — or only reporting?_

---

## Enforcement — Future Pull Requests

### Required PR checklist (also in `.github/pull_request_template.md`)

Every product PR must affirm:

- [ ] **R1** Screen(s) answer “What should I do now?”
- [ ] **R2** Each new tap reduces uncertainty
- [ ] **R3** Coach/help appears at the decision (not only via chat hunt)
- [ ] **R4** One dominant action — not five equal priorities
- [ ] **R5** Not built merely because competitors have it
- [ ] **R6** Motivation/claims backed by real evidence
- [ ] **R7** No dead ends — every screen ends in an action
- [ ] **R8** AI recommendations include WHY
- [ ] **R9** Prefer disappearing interface over new chrome/tabs
- [ ] **R10** Improves leadership behavior, not dashboard theater

### Failure modes (automatic redesign triggers)

| Symptom                                      | Likely broken rule |
| -------------------------------------------- | ------------------ |
| User opens app and scrolls without acting    | R1, R4, R7         |
| New tab or widget without workday spine need | R5, R9, R10        |
| Coach tip without event proof                | R6, R8             |
| Five CTAs same size                          | R4                 |
| “Ask Coach” as only intelligence path        | R3                 |

### Relationship to Sprint 5 architecture

`docs/sprint-5-architecture.md` is an implementing instrument of these rules (Day Memory, Constraint, Moment of Truth, Coach-as-Surface). Future sprints may extend systems; they may not contradict Rules #1–#10.

---

## Closing line

AscendOS is not a collection of features.  
It is a **daily leadership operating system**.

Ship fewer surfaces.  
Create clearer decisions.  
Make better leaders.

---

**End of ASCENDOS CONSTITUTION v2.0**
