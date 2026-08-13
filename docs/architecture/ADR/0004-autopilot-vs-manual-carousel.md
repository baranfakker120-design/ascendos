# ADR 0004 — Autopilot single-image vs Manual carousel

**Status:** Accepted (codifies existing product law)  
**Date:** 2026-08-13  
**Deciders:** Product owner + existing content program

## Context

Content Autopilot and Manual Carousel historically risked being mixed (carousel companions on autopilot slots). Production incidents required a hard split.

## Decision

1. **Autopilot feed** always publishes **exactly one image**. No automatic carousel.
2. **Manual carousel** remains a separate manual path supporting up to **10** slides.
3. Multi-tenant refactors must not recombine these systems.

## Consequences

- Autopilot planners/persist/publish continue to clear `carousel_asset_ids`
- Tenant migrations must not “simplify” content by merging paths
- Regression tests for the split remain required
