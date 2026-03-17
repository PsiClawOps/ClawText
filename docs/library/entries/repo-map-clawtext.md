---
kind: library-entry
project: clawtext
topic: repo-map
status: active
curation: reviewed
visibility: shared
last_reviewed: 2026-03-17
source_docs:
  - README.md
  - docs/STATE_ROOTS.md
  - openclaw.plugin.json
  - package.json
summary_confidence: 0.89
---

# ClawText Repo Map

## Repo purpose
This repository is the product/source home for ClawText.

Source code, product docs, packaging metadata, and operational scripts live here. Runtime-generated state should live outside the repo under the configured state roots.

## Important top-level areas
- `README.md` — storefront/product overview
- `docs/` — strategic docs, architecture, operating docs, and design drafts
- `src/` — memory, retrieval, ingest, and operational logic
- `scripts/` — maintenance, validation, and support tooling
- `bridge/` — ClawBridge continuity and transfer machinery
- `hooks/` — OpenClaw hook integrations
- `schemas/` — structured schema assets if used by the product
- `dist/` — built output
- `package.json` — package metadata and scripts
- `openclaw.plugin.json` — plugin manifest

## State-root rule
Generated/runtime state should not treat the repo as its database.

Use the external state root model documented in `docs/STATE_ROOTS.md`, especially:
- `~/workspace/state/clawtext/dev/`
- `~/workspace/state/clawtext/prod/`

## Planned library-lane runtime path
For the new Documentation / Library Lane, the intended production state root is:

```text
~/workspace/state/clawtext/prod/library/
  entries/
  indexes/
  snapshots/
  manifests/
```

These runtime paths are distinct from the example dogfood entries stored in the repo under `docs/library/entries/`.

## Use this entry for
- "Where does ClawText code live?"
- "Which files are strategic vs runtime?"
- "Where should library state live?"
- "What are the top-level repo areas worth reading first?"

## Refresh triggers
Refresh when:
- repo layout changes materially
- plugin/runtime packaging changes
- state-root policy changes
- library lane runtime layout changes
