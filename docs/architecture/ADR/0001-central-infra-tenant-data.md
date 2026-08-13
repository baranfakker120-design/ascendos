# ADR 0001 — Central infrastructure, tenant via data

**Status:** Accepted  
**Date:** 2026-08-13  
**Deciders:** Product owner + architecture program (Phase 0)

## Context

AscendOS must support multiple network-marketing organizations. A tempting shortcut is one Supabase project (or AI keys) per organization.

## Decision

Keep **one** AscendOS platform:

- one Supabase project
- one set of platform API / AI / VAPID / Meta secrets
- one Edge Function fleet
- tenant isolation via `organization_id`, memberships, RLS, and tenant-aware APIs

## Consequences

- No per-org Supabase projects or AI keys
- Strong requirement for correct RLS and Edge org headers
- Platform cost/usage may later be metered per org without forking keys
