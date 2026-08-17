# ADR 0011 — Knowledge Operating Model (CMS vs RAG)

**Status:** Accepted  
**Date:** 2026-08-16  
**Deciders:** Glossily readiness / future architecture program

## Context

AscendOS has two org-scoped knowledge stores:

1. **CMS** — `coach_knowledge_articles` (+ versions / change_log) — Knowledge Center UI
2. **RAG** — `knowledge_docs` / `knowledge_chunks` — Coach retrieval via `match_knowledge`

PDF Vision can write CMS drafts and optionally opt into Coach RAG. Publishing to Knowledge Center alone does **not** feed the Coach.

Operators can wrongly assume “Knowledge Center = Organization Brain.”

## Decision

1. CMS and RAG remain separate stores (no silent auto-merge).
2. Coach chat continues to retrieve **only approved RAG** for the active org.
3. Sync from CMS/PDF → RAG is **explicit admin opt-in** (`enableCoachRag` / ingest).
4. Product surfaces must expose sync status (`cms_only` | `rag_only` | `synced` | …) so admins see when Coach cannot retrieve CMS content.
5. Exact PDF duplicates (same org + SHA-256) skip deep AI analysis (Fast Scan).
6. Same filename / different hash → `possible_version` / `conflict_review`; admin decides; never silent overwrite.
7. A full fact/entity graph is **deferred**; page-level `key_facts` JSON remains transitional.

## Consequences

- Glossily can own isolated CMS + RAG without sharing Essence Tribe knowledge.
- Dual-store complexity remains until a later ADR introduces a fact layer.
- Fast Scan reduces vision/embedding cost on re-uploads.
