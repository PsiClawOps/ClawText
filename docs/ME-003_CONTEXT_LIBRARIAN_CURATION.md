# ME-003 — Context Librarian Curation (Additive)

Date: 2026-03-12
Change ID: ME-003
Status: merged (flagged)

## Objective
Add optional select-then-hydrate curation on retrieved memory candidates to reduce noise in injected context while preserving recency coherence.

## Non-interference posture
- Additive only
- Default OFF
- No schema migration
- No default retrieval/injection behavior change unless explicitly enabled

## Feature flag
- `CLAWTEXT_CONTEXT_LIBRARIAN_ENABLED=true`
- Default: disabled

## Implementation scope
- `src/rag.ts`
- `src/rag.js`

Added optional curation pass:
1. Build compact per-memory summary signal from candidate memories
2. Select minimal set by query relevance + confidence/type signals
3. Always include most recent N memories for coherence
4. Hydrate selected memory content for final prompt injection

## Behavior (when enabled)
- curation runs only after normal candidate retrieval
- no change if candidates <= 2
- selected set defaults:
  - `contextLibrarianMaxSelect = 4`
  - `contextLibrarianAlwaysIncludeRecent = 1`
- injected count reflects curated set size

## Impact map
- ClawDash impact: none (memory injection internals only)
- ClawTask impact: none
- Continuity transfer impact: none
- Recall latency impact: low/constant (in-memory scoring/filtering)

## Rollback
Immediate disable:
- unset flag or set `CLAWTEXT_CONTEXT_LIBRARIAN_ENABLED=false`

Hard rollback:
- revert ME-003 changes in `src/rag.ts` and `src/rag.js`

## Why this order
ME-003 follows ME-001/ME-002 as another additive, flagged quality improvement before any default-on retrieval behavior changes.