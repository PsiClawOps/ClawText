# ClawText Memory Evolution Adoption Log

Use this log to leave durable breadcrumbs for memory-engine evolution work.

## Entry template

- **Change ID:**
- **Date (UTC):**
- **Feature:**
- **Status:** proposed|in-progress|merged|rolled-back
- **Flag:**
- **Default State:** on|off
- **Reason:**
- **Impact on Other Pillars:**
- **Rollback:**
- **References:**

---

## 2026-03-12 — Plan initialization

- **Change ID:** ME-000
- **Date (UTC):** 2026-03-12
- **Feature:** Memory evolution adoption plan + breadcrumb protocol
- **Status:** merged
- **Flag:** N/A (process-only)
- **Default State:** N/A
- **Reason:** Adopt valuable memory insights without disrupting active ClawText/ClawDash streams.
- **Impact on Other Pillars:** No runtime impact; planning/process layer only.
- **Rollback:** Remove docs (`ADOPTION_PLAN_MEMORY_EVOLUTION.md`, `ADOPTION_LOG_MEMORY_EVOLUTION.md`, `BREADCRUMB_SCHEMA_MEMORY_EVOLUTION.json`).
- **References:**
  - `docs/ADOPTION_PLAN_MEMORY_EVOLUTION.md`
  - `docs/BREADCRUMB_SCHEMA_MEMORY_EVOLUTION.json`

## 2026-03-12 — ME-001 Durability Classifier

- **Change ID:** ME-001
- **Date (UTC):** 2026-03-12
- **Feature:** Durability classifier for promotion proposals
- **Status:** merged (flagged)
- **Flag:** `CLAWTEXT_DURABILITY_CLASSIFIER_ENABLED`
- **Default State:** off
- **Reason:** Improve durable-vs-transient guidance quality with low-risk additive logic.
- **Impact on Other Pillars:** No ClawDash/ClawTask/continuity runtime impact; promotion-path only when flag enabled.
- **Rollback:** Disable feature flag; or revert files `src/durability-classifier.ts` and related `src/operational-promotion.ts` integration.
- **References:**
  - `docs/ME-001_DURABILITY_CLASSIFIER.md`
  - `src/durability-classifier.ts`
  - `src/operational-promotion.ts`

## 2026-03-12 — ME-002 Scope Isolation Hardening

- **Change ID:** ME-002
- **Date (UTC):** 2026-03-12
- **Feature:** Strict scope filtering for operational retrieval
- **Status:** merged (flagged)
- **Flag:** `CLAWTEXT_SCOPE_ISOLATION_ENABLED`
- **Default State:** off
- **Reason:** Reduce cross-scope operational pattern noise while preserving default behavior.
- **Impact on Other Pillars:** No ClawDash/ClawTask/continuity runtime impact; retrieval-path filter only when flag enabled.
- **Rollback:** Disable feature flag; or revert `src/operational-retrieval.ts` ME-002 changes.
- **References:**
  - `docs/ME-002_SCOPE_ISOLATION_HARDENING.md`
  - `src/operational-retrieval.ts`

## 2026-03-12 — ME-003 Context Librarian Curation

- **Change ID:** ME-003
- **Date (UTC):** 2026-03-12
- **Feature:** Optional select-then-hydrate curation over retrieved memories
- **Status:** merged (flagged)
- **Flag:** `CLAWTEXT_CONTEXT_LIBRARIAN_ENABLED`
- **Default State:** off
- **Reason:** Improve signal-to-noise in injected context using lightweight curation with recency floor.
- **Impact on Other Pillars:** No ClawDash/ClawTask/continuity runtime impact; injection-path curation only when flag enabled.
- **Rollback:** Disable feature flag; or revert ME-003 changes in `src/rag.ts` and `src/rag.js`.
- **References:**
  - `docs/ME-003_CONTEXT_LIBRARIAN_CURATION.md`
  - `src/rag.ts`
  - `src/rag.js`
