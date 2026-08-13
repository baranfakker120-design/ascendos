# ADR 0005 — Platform admin ≠ organization super_admin

**Status:** Accepted (target; not yet implemented)  
**Date:** 2026-08-13  
**Deciders:** Product owner + architecture program (Phase 0)

## Context

Constitution requires `PLATFORM_SUPER_ADMIN` and `ORGANIZATION_ADMIN`. Today’s `memberships.role = super_admin` is an **org** admin power via `is_super_admin()`.

## Decision

1. Organization admins manage **only** their organization.
2. Platform operators are a **separate** principal (exact storage to be finalized in Phase 1/2 design) and alone may access `/platform-admin`.
3. Knowing `/platform-admin` or `/admin` URLs grants nothing without server checks.
4. Existing Team Seyda `super_admin` users remain org admins for Org A; they do **not** automatically become platform operators.

## Consequences

- Phase 2/8 must introduce platform principal without privilege escalation surprises
- Docs and code must stop implying `is_super_admin()` means platform-wide
- Isolation tests cover both admin planes
