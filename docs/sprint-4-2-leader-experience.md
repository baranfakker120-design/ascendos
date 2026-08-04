# Sprint 4.2 — Leader Experience

## Goal

Make `/team` the daily leadership center: within seconds a leader sees who is
active, who needs help, who is near a rank, and who earned AP — without classic
MLM backoffice chrome.

## Surfaces

1. **Leader Dashboard** — glass metric cards above the genealogy canvas
2. **Insights / Warnings / Leaderboard** — automated signals + period ranking
3. **Team Nodes** — ICP, streak, favorite, sponsor, presence, message badge
4. **Detail Sheet** — notes, pin, WhatsApp/phone, Coach with partner context
5. **AP Tasks** — catalog + `complete_ap_task` (AP only on done, anti-cheat)
6. **TeamLeader** — 5 active firstlines → rank cosmetics + one-time €100 payout
7. **Qualifications** — `/qualifikationen` live progress

## Authority

All leadership math lives in Postgres SECURITY DEFINER RPCs
(`get_leader_dashboard`, `get_team_insights`, `get_smart_warnings`,
`get_team_leaderboard`, `get_team_leader_progress`, `evaluate_team_leader_qualification`,
`complete_ap_task`). The genealogy RPC is enriched for 4.2 fields.

`ap_apply_to_total` no longer auto-creates `team_leader_bonus`; qualification owns it.
