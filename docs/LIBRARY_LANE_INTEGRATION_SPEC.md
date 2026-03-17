# Documentation / Library Lane — Technical Integration Spec

**Status:** Draft  
**Owner:** ClawText  
**Phase:** Post-2.0 / Phase 3  
**Related:** `docs/NORTHSTAR.md`, `docs/PRD.md`, `docs/LIBRARY_LANE.md`, `docs/LIBRARY_PROXMOX_9_1_COLLECTION_PLAN.md`

---

## 1. Goal

Integrate a new **Documentation / Library Lane** into ClawText so agents can retrieve from a stable, trusted documentation corpus — such as official Proxmox VE 9.1 docs — without confusing that material with:
- recent working context
- operational failure learning
- generic raw ingest

The lane must support **both**:
1. **library collections** — imported trusted documentation corpora
2. **library entries** — curated summaries / start-here records built on top of those corpora
3. **library overlays** *(optional but supported)* — local operator notes layered on top of trusted upstream material

---

## 2. Product intent

The intended user experience is:
- ingest trusted docs once
- keep them in a named library collection
- retrieve them consistently later
- optionally combine upstream docs with local environment overlays
- answer reference-style questions from the same known body of information each time

### Example
For Proxmox:
- collection = official Proxmox docs 9.1
- entry = "Proxmox 9.1 Start Here"
- overlay = "How we are using Proxmox in our environment"

This creates a stable retrieval base instead of relying on shifting web search results or model priors.

---

## 3. Recommendation

## Recommended implementation approach

**Implement Library Lane as an extension of the current ingest + retrieval pipeline, not as a second standalone memory engine.**

### Why
This is the best path because it:
1. **reuses existing strengths** — ClawText already has ingest, indexing, hybrid retrieval, and prompt injection
2. **avoids architecture drift** — no need to build a parallel retrieval system just for docs
3. **fits file-first doctrine** — collections, entries, overlays, and indexes can all remain plain files
4. **keeps ranking controllable** — Library Lane can be introduced mostly as metadata + weighting + provenance
5. **gets value fastest** — you can ship reference retrieval sooner by adapting the existing pipeline instead of rewriting core search

### Specific recommendation
Do **not** start with:
- a new DB
- a separate vector service
- a separate retrieval engine
- a large automation-heavy summarization system

Start with:
- collection manifests
- file-backed library content
- library-aware indexing
- reference-intent ranking boosts
- provenance-aware injection

That gives the product real value with the least risk.

---

## 4. Existing code surfaces to integrate with

Based on current repo structure:

### `src/rag.js`
Current role:
- loads clusters
- performs BM25 scoring
- merges with recent-capture results
- injects top memories into prompt context

Library integration role:
- load library indexes in addition to current clusters
- add reference-intent detection
- add provenance labels (`library-entry`, `library-collection`, `library-overlay`)
- add ranking boosts for trusted library material

### `src/memory.ts`
Current role:
- structured memory add/search API
- visibility filtering
- cache integration

Library integration role:
- optional future API surface for creating/searching library entries
- should not be the first integration point for raw doc corpora

### `src/index.ts` / plugin registration surface
Current role:
- exports injection plugin + RAG

Library integration role:
- no major change initially beyond wiring library-aware retrieval into the existing plugin behavior

### `plugin.js`
Current role:
- before-prompt-build injection
- project keyword detection

Library integration role:
- optional query-intent hints into RAG
- possible future project/topic routing for known collections (e.g. proxmox, tailscale, nemoclaw)

### existing ingest flow
Current role:
- import docs/repos/threads/URLs/JSON

Library integration role:
- support ingest targets marked as `library collection`
- persist content + manifests to library-specific runtime paths
- feed collection content into library indexing rather than general raw ingest only

---

## 5. Storage model

### Runtime state root
```text
~/workspace/state/clawtext/prod/library/
  collections/
  entries/
  overlays/
  indexes/
  snapshots/
  manifests/
```

### Repo-side design/dogfood docs
```text
repo/clawtext/docs/library/
  collections/
  entries/
  overlays/
```

### Separation rule
- **repo-side docs** = examples, canon, dogfood, templates
- **runtime library state** = actual ingested collections, refresh outputs, indexes, manifests

This keeps the repo clean while still allowing ClawText to dogfood the feature in docs.

---

## 6. Core object model

## 6.1 Library collection
A collection is a trusted imported corpus.

### Required fields
- `kind: library-collection`
- `slug`
- `title`
- `version` *(if known)*
- `source_type` (`official-docs`, `internal-docs`, `community-docs`, etc.)
- `trust_level` (`official`, `internal`, `reviewed-community`, `community`)
- `status` (`planned`, `active`, `stale`, `archived`)
- `visibility`
- `sources[]`
- `topics[]`
- `refresh_policy`

### Optional fields
- `last_ingested`
- `last_reviewed`
- `retrieval_priority`
- `notes`

## 6.2 Library entry
A curated summary or start-here artifact.

### Required fields
- `kind: library-entry`
- `project`
- `topic`
- `status`
- `curation`
- `visibility`
- `last_reviewed`
- `source_docs[]`

### Optional fields
- `linked_collection`
- `summary_confidence`
- `supersedes`
- `refresh_triggers`

## 6.3 Library overlay
A local interpretation/constraint layer on top of trusted docs.

### Required fields
- `kind: library-overlay`
- `slug`
- `collection`
- `project`
- `scope`
- `status`
- `visibility`
- `last_reviewed`

### Typical content
- local hardware assumptions
- chosen deployment path
- environment-specific caveats
- things upstream supports that we are not doing

---

## 7. Ingest integration

## 7.1 New ingest target type
Add a library-oriented ingest mode.

### Conceptual command shape
```bash
clawtext ingest \
  --mode library \
  --collection proxmox-official-docs-9-1 \
  --source https://pve.proxmox.com/pve-docs/ \
  --source https://pve.proxmox.com/pve-docs/pve-admin-guide.html
```

### Required behavior
- content is stored under the library runtime root
- ingest output is tagged as belonging to a named collection
- source lineage is preserved
- content is deduped/chunked/indexed like other ingest content
- collection manifests are updated after successful ingest

## 7.2 Collection ingest flow
```text
collection manifest
  -> fetch/ingest trusted sources
  -> normalize and chunk
  -> write collection corpus files
  -> write/update manifest metadata
  -> build library indexes
  -> make available to retrieval
```

## 7.3 Important boundary
Library ingest should be **source-disciplined**.

For v1:
- official docs should outrank community docs
- untrusted/random web material should not silently join a trusted collection
- collections should be explicit and named, not accidental side effects of generic ingest

---

## 8. Indexing model

## Recommendation
Build a **separate library index layer** that is loaded alongside the existing cluster layer.

### Why
This gives cleaner retrieval control than shoving everything into general clusters immediately.

### Proposed library indexes
```text
state/clawtext/prod/library/indexes/
  library-index.json
  collections.json
  entries.json
  overlays.json
```

### Index record shape
Each indexed item should include:
- `id`
- `kind` (`entry`, `collection-doc`, `overlay`)
- `collection`
- `topic`
- `trust_level`
- `status`
- `freshness`
- `source_type`
- `provenance`
- `content/snippet`
- `keywords/entities/tags`

### Why not reuse clusters only?
You *can* eventually merge library material into the broader retrieval graph, but starting with explicit library indexes is safer because:
- ranking is easier to control
- provenance is easier to preserve
- trusted-vs-general behavior is easier to reason about

---

## 9. Retrieval integration

## 9.1 Intent detection
Add a lightweight reference-intent detector to `src/rag.js`.

### Reference-intent examples
- "what do the docs say"
- "how does proxmox handle zfs"
- "what is the recommended install path"
- "how is this system structured"
- "where should I start reading"
- "what is the official guidance"

### Operational-intent examples
- "this failed again"
- "what workaround did we use"
- "why did tool X break"

### Working-context examples
- "continue what we were doing"
- "what did we decide earlier in this thread"

## Recommendation
Use a **lightweight rules-based detector first**, not an LLM classifier.

### Why
- simpler
- predictable
- debuggable
- fast enough for current scale

## 9.2 Retrieval precedence
For reference-style questions:
1. reviewed `library-entry`
2. trusted `library-collection` content
3. matching `library-overlay`
4. general ingest/archive
5. operational memory only if clearly relevant

For operational/debugging questions:
1. operational patterns
2. recent working memory
3. library only if docs are clearly relevant

## 9.3 Ranking factors
Library results get boosts for:
- reference intent match
- official/internal trust level
- reviewed status
- freshness
- exact topic match
- linked collection relevance

Library results get penalties for:
- stale status
- superseded status
- low-trust source when official source exists
- mismatch to query intent

---

## 10. Prompt injection behavior

### Injection rules
- include provenance label on every injected library result
- prefer concise entries over raw collection excerpts when both match
- include overlays only when clearly relevant to the environment/question
- stay within existing token budget discipline

### Provenance examples
- `library-entry: proxmox-9-1-start-here`
- `library-collection: proxmox-official-docs-9-1`
- `library-overlay: proxmox-our-environment`

### Recommendation
Prefer **entry → collection → overlay** composition in the prompt.

### Why
- entries give clean summaries
- collection excerpts provide grounding
- overlays add local reality

This yields better answers than injecting raw docs alone.

---

## 11. Refresh workflow

## 11.1 Manual-first refresh
For v1, use manual refresh only.

### Why
- trusted corpora should change intentionally
- easier to audit
- avoids accidental drift when upstream docs change

## 11.2 Refresh flow
```text
mark collection refresh-needed
  -> re-ingest selected sources
  -> compare/update manifest
  -> rebuild library indexes
  -> mark impacted entries stale if source changed materially
  -> review overlays if needed
```

## 11.3 Staleness model
- collection can be `active`, `stale`, `archived`
- entry can be `active`, `stale`, `superseded`, `archived`
- overlay can be `active`, `stale`, `archived`

Stale records should remain inspectable but lose ranking priority.

---

## 12. CLI / operator surface

### Recommended initial commands
```bash
clawtext library:list
clawtext library:show --collection proxmox-official-docs-9-1
clawtext library:ingest --manifest docs/library/collections/proxmox-official-docs-9.1.yaml
clawtext library:index
clawtext library:search "how does proxmox handle zfs"
clawtext library:refresh --collection proxmox-official-docs-9-1
```

### Why CLI first
This matches the rest of ClawText:
- inspectable
- scriptable
- agent-usable
- no UI dependency required

---

## 13. Implementation slices

## Slice A — manifest + runtime paths
- add runtime library directories
- add collection manifest loader
- add basic validation for collection/entry/overlay metadata

## Slice B — collection ingest
- add `--mode library` ingest path
- write collection corpus files to runtime path
- preserve provenance and source lineage

## Slice C — library indexing
- build `library-index.json`
- build separate records for entries / collection docs / overlays
- keep index rebuild explicit and inspectable

## Slice D — retrieval integration
- load library indexes in `src/rag.js`
- add reference-intent detection
- add library-aware ranking and provenance labels
- inject top library context when appropriate

## Slice E — operator workflows
- add CLI commands
- add refresh flow
- add stale/superseded handling

---

## 14. Risks and mitigations

### Risk: library becomes generic ingest dump
**Mitigation:** collections must be explicit, named, and trust-scoped

### Risk: official docs get mixed with random web content
**Mitigation:** keep collection source list explicit; do not auto-expand sources without approval

### Risk: library results drown out operational knowledge
**Mitigation:** rank by query intent; do not treat all questions as reference questions

### Risk: too much automation too early
**Mitigation:** manual refresh, manual collection definition, lightweight rules first

### Risk: duplicate retrieval paths become confusing
**Mitigation:** preserve provenance and keep a separate library index at first

---

## 15. Proxmox VE 9.1 recommendation

## Recommended first real collection
Use **Proxmox VE official docs 9.1** as the first end-to-end Library Lane implementation target.

### Why
- official and authoritative source base
- clearly structured docs
- likely real operational value soon
- strong difference between upstream docs and local overlays
- perfect example of "stable reference corpus" behavior

### Recommendation
For the first implementation pass, ingest only:
1. docs index
2. admin guide
3. selected linked official CLI/API references if needed

Do **not** start with:
- community forums
- random tutorials
- blog posts
- third-party guides

### Why
You want the first collection to prove **consistency and trust**, not breadth.

---

## 16. Final recommendation

If we are choosing the best implementation path, I recommend:

### Build order
1. **manifest + runtime path support**
2. **collection ingest mode**
3. **separate library index**
4. **reference-intent retrieval weighting in `src/rag.js`**
5. **entry/collection/overlay provenance in prompt injection**

### Why this order
Because it gives you:
- the cleanest proof of the feature
- the least architectural risk
- real value early
- a path to dogfood the exact Proxmox use case you care about

This is the fastest route to a Library Lane that is actually useful instead of just well-described.
