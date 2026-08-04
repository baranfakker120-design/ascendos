# Sprint 4.1 — Genealogy Engine: Architecture Decision

## Goal

Premium team-tree experience: 60 FPS pan/zoom, virtualized nodes, glass cards,
elegant edges — usable with 10 000+ members. Authority stays in Postgres
(`memberships.sponsor_membership_id` + RLS / SECURITY DEFINER).

## Options compared

| Approach                                                                                      | Pros                                                                                  | Cons                                               | Verdict       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------- |
| Nested DOM / CSS flex trees                                                                   | Simple                                                                                | No virtualization, O(n) layout cost, weak zoom     | Reject        |
| React Flow / XYFlow                                                                           | Pan/zoom, edges                                                                       | Editor-oriented; React node cost at 10k; heavy dep | Reject for v1 |
| D3 + full SVG                                                                                 | Classic tidy-tree                                                                     | SVG DOM fails at scale                             | Reject alone  |
| Pixi / WebGL canvas                                                                           | Best raw throughput                                                                   | Lose RankFrame React; hard a11y; long ramp         | Defer         |
| **Custom engine: tidy layout + CSS transform viewport + virtualized React cards + SVG edges** | Reuses RankFrame/glass; GPU pan/zoom; only visible cards mount; zero graph-lib weight | We own layout/gestures                             | **Choose**    |

## Decision

Build `src/features/genealogy/engine/` as a first-party Genealogy Engine:

1. **Layout** — Reingold–Tilford-style tidy tree (top-down), collapse-aware.
2. **Viewport** — single `transform: translate3d + scale` layer (compositor thread).
3. **Virtualization** — mount TeamNode cards only inside the camera frustum (+ overscan).
4. **Edges** — SVG cubic Beziers under the node layer; soft champagne stroke + subtle dash animation.
5. **Data** — one SECURITY DEFINER RPC `get_genealogy_tree` (enriched nodes, counts, last seen); never org-wide `profiles_public` as the tree source.
6. **Presence proxy** — `memberships.last_app_opened_at` synced from `usage_events.app_opened` (no realtime channel in v1).
7. **IA** — bottom-nav **Team → `/team`** (tree). Team Seyda Guide stays at `/team-seyda` (More).
8. **A11y** — list mode toggle alongside the canvas (F4 §7.8).

## Non-goals (v1)

Realtime presence sockets, WebGL particles, structure snapshots, sideline visibility.

## Performance budget

- Initial paint: layout of full graph in memory (lightweight structs), render ≤ ~80 DOM nodes.
- Gestures: no React state per frame; camera via refs + rAF.
- Expand/collapse: relayout + FLIP-ish opacity/transform on affected subtree.
