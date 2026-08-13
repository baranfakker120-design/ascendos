# ADR 0003 — AI context is organization-scoped

**Status:** Accepted  
**Date:** 2026-08-13  
**Deciders:** Product owner + architecture program (Phase 0)

## Context

AI providers are central. If retrieval or CMS context is global, organizations leak proprietary coach/knowledge content to each other.

## Decision

- AI **infrastructure** (providers, keys, Edge) stays central.
- AI **context** (RAG chunks, CMS articles, agent prompts, org branding in prompts) is always bound to the caller’s organization.
- Global shared knowledge across orgs is forbidden unless an explicit future ADR creates a separate **platform** corpus with clear labeling (default: none).

## Consequences

- Knowledge Center and related CMS must gain `org_id` + RLS (Phase 3/5)
- `coach-chat` / ingest must resolve org from membership header, not assume single-tenant
- Isolation tests are mandatory before Phase 10
