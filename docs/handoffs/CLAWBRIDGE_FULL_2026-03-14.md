# ClawBridge — Full Continuity Packet

> Generated 2026-03-14T02:32:22.032Z | Source: 1480315446694641664 | 98 messages | Depth: standard

## 🎯 Priority
**Urgency:** medium
**Focus:** ClawText v2.0 — Holistic Memory System: shipping plan, repo cleanup, pipeline refactoring, ClawBridge v2.0 design and implementation, competitor research

**Priority Assessment:**
1. **🚨 Critical** — Complete ClawBridge v2 integration to done-state by executing all remaining tasks: test real-thread full LLM pipeline, wire `thread-bridge` to new engine, add `clawbridge` binary to `package.json`, and turn `skills/clawbridge/` into a deprecated pointer to `bridge/`.
2. **🚨 Critical** — Execute repo/public-readiness cleanup: fix `PsiClawOps/clawtext` links, remove/update private references, resolve dead docs (`ME-001`…`ME-004`, `ADOPTION_PLAN`, `ADOPTION_LOG`, `TESTING.md`), and align plugin metadata/version fields.
3. **⚠️ High** — Finish P2 roadmap pieces (`flush hook provenance`, `relationships.yaml` query integration), since they remain open from the roadmap and directly affect lineage visibility.
4. **⚠️ High** — Revalidate OpenClaw runtime/config stability after `modelByChannel` correction (`~/.openclaw/openclaw.json`) and keep gateway stable.
5. **ℹ️ Medium** — Verify actual implementation matches planning docs (`docs/CLAWTEXT_V2_SHIPPING_PLAN.md`, `docs/CLAWTEXT_REPO_CLEANUP_PLAN.md`) before adding v2.1 or additional modules (cost observability, advanced provenance lineage, etc.).
6. **ℹ️ Medium** — Reconcile ongoing changes across `plugin.ts`, `rag.ts`, `build-clusters.js`, and cluster schema (`id`, `sourceType`, `createdAt`, `dedupeHash`) to prevent provenance/dedupe/time-filter regressions.

## 📦 Facts & State
- **Thread objective:** `ClawText v2.0 — Holistic Memory System: shipping plan, repo cleanup, pipeline refactoring, ClawBridge v2.0 design and implementation, competitor research`
- **Primary scope path:** `~/.openclaw/workspace/skills/clawtext/`
- **Canonical repo:** `PsiClawOps/clawtext` (not `ragesaq/clawtext`)
- **Plugin manifest/version mismatch found:** `openclaw.plugin.json` = `1.3.0`, `package.json` = `1.5.0`
- **Manifest gap:** missing `kind: "memory"`
- **Critical cleanup items cataloged:** wrong GitHub URLs, dead docs (`ME-001` through `ME-004`, `ADOPTION_PLAN`, `ADOPTION_LOG`, `TESTING.md`), private references (`RGCS`, `Lumbot`, `ragesaq`) across `README.md`, `RELATIONSHIPS.md`, `MEMORY_SCHEMA.md`, `OPERATIONAL_LEARNING.md`, `relationships.yaml`, and over 50 occurrences total
- **Baseline ClawBridge (pre-v2):** 3 artifacts (short handoff/full continuity packet/bootstrap), 3 modes (continuity/memory/dual), 3 modal outputs (Discord forum posts, `docs/handoffs/`, GitHub Gists), integrated by thread-bridge during refresh/split
- **OpenClaw config error context:** `~/.openclaw/openclaw.json`, invalid for:
  - `channels.modelByChannel.discord.1475021817168134144: Invalid input: expected string, received object`
  - `channels.modelByChannel.discord.1482170879550033990: Invalid input: expected string, received object`
  - root error: `Invalid config at /home/lumadmin/.openclaw/openclaw.json`
- **Config correction rule:** `channels.modelByChannel` entries must be plain strings, no object config blocks
- **Example corrected entries:**
  - `"1475021817168134144": "openai-codex/gpt-5.4"`
  - `"1482170879550033990": "openai-codex/gpt-5.4"`
  - `"1474997928056590339": "openai-codex/gpt-5.3-codex-spark"`
- **Incorrect object form that failed validation:**  
  `"1475021817168134144": { "model": "openai-codex/gpt-5.4", "reasoning": { "effort": "high" } }`
- **Referenced OpenClaw issues:** `#30760`, `#12246`
- **Gateway status after fix:** running, app `2026.3.12`, PID active, config valid
- **Refactor planning docs:** `docs/CLAWTEXT_PIPELINE_REFACTOR_ASSESSMENT.md`, `docs/CLAWTEXT_REPO_CLEANUP_PLAN.md`, `docs/CLAWTEXT_V2_SHIPPING_PLAN.md`, `docs/CLAWBRIDGE_V2_DESIGN.md`
- **Research artifacts:** `research/agent-context-transfer-guide.md` (48KB)
- **Competitor links used:**  
  `https://github.com/rodrigouroz/memory-braid`  
  `https://uselibrarian.dev/`  
  `https://www.toolify.ai/openclaw-skills/mindgardener-18942`
- **Competitor findings:**  
  - Memory Braid: consolidation loop, cost observability, capture provenance, weighted RRF, remediation/quarantine  
  - Librarian: index/select/hydrate pattern, async summary indexing, context-rot mitigation, claimed ~85% cost reduction  
  - MindGardener: effectively nonexistent / non-usable surface
- **ClawBridge v2 architecture:** target pipeline `Raw messages → Pre-filter → LLM Extract → LLM Compress → LLM Structure → 6 knowledge types → Multi-format output`  
  and compact form `Raw messages → LLM extract → LLM compress → LLM structure → Format per audience`
- **Required handoff knowledge types:** Episodic, Semantic, Procedural, Relational, Implicit, Priority
- **Density policy in v2 design:** score ≥ `0.7` keep verbatim, `0.4–0.7` compress, `<0.4` cut
- **Proposed formats in v2:** YAML/JSON structured, Git diff-based, Clipboard, with Audio/TTS deferred to v2.1
- **Commit `87e5f87` (P0+P1 refactors):** auto-detect projects, provenance fields, dual storage repair, BM25 and time filtering improvements
- **P0 (`87e5f87`) changes:** remove hardcoded keywords in `plugin.ts`, remove literals (`moltmud`, `rgcs`) from public code, auto-detect projects from cluster filenames, all 18 clusters discoverable
- **Provenance fields added:** `id`, `sourceType`, `createdAt`, `dedupeHash`
- **P1 (`87e5f87`) changes:** `build-clusters.js` reads `memory/api-memories/*.json`; API writes reach clusters; real BM25 in `rag.ts` (TF-IDF + doc frequency + length normalization) with `k1=1.5`, `b=0.75`; time parsing added to `findRelevantMemories` for phrases like `"last week"`, `"since 2026-03-01"`, `"yesterday"`
- **P0/P1 verification:** `tsc` clean, `18 clusters`, `436 memories`, `3 API memories`, dedupe works via `SHA1 hash`, note `was 142 in clawtext alone → 150 with dedup`
- **ClawBridge v2 commit `f3132e1` artifacts in `bridge/`:**
  - `extractor.cjs` (3-pass LLM pipeline + density scoring, `9.7 KB`)
  - `formatter.cjs` (6 formats: short/full/bootstrap/clipboard/YAML/diff, `11.5 KB`)
  - `index.cjs` (orchestrator + mechanical fallback, `11.8 KB`)
  - `cli.cjs` (CLI + Discord integration, `10 KB`)
- **ClawBridge v2 test outcomes:** module loads, density scoring works (`decisions score 0.55`, identifiers higher), mechanical fallback valid without LLM, all 6 formatters clean, full/clipboard/bootstrap outputs look good
- **Remaining explicit v2 tasks:** real-thread LLM dogfood, `thread-bridge` integration, `clawbridge` bin in `package.json`, `skills/clawbridge/` deprecated pointer update to `bridge/`
- **Module format decision:** package is `"type": "module"` and bridge code was `require()`-based; switched to `.cjs` standalone CJS modules for compatibility
- **Architecture decision:** bundle ClawBridge into ClawText as first-class `skills/clawtext/bridge/`, replacing nested skill structure with a compatibility pointer strategy
- **User sequencing decision:** dogfood bridge first, then clean-thread handoff and project-wide roadmap consolidation

## 🕐 Timeline
1. **2026-03-13T10:08:02.653** — `lumbot [bot]` introduced a self-aware memory health feature and noted cluster-status/recommendation reporting.
2. **2026-03-13T23:58:47.603** — `ragesaq` asked for a full v2 execution plan covering repo cleanup, competitor research, claim-accuracy discipline, Gold Standard Post hygiene, and avoidance of private/project leakage (`RGCS`, `Lumbot`, `ragesaq`) in public docs.
3. **2026-03-14T00:03:17.181–00:03:18.883** — `lumbot` began parallel prep: repo audit, README/spec checks, and OpenClaw native-memory review.
4. **2026-03-14T00:03:30.046–00:03:30.858** — `lumbot` discovered high-impact blockers and started a cleanup plan: wrong repo URLs, version mismatch, private references, dead doc links, and manifest metadata gaps.
5. **2026-03-14T00:07:20.599–00:07:20.776** — `lumbot` produced `docs/CLAWTEXT_REPO_CLEANUP_PLAN.md` and raised explicit scope decisions (ClawBridge bundling, QMD inclusion, generic examples, npm publish status, dead docs handling).
6. **2026-03-14T00:20:58.289–00:20:59.196** — `lumbot` integrated competitor research (Mem0, Librarian, MindGardener, Memory Braid, QMD, Hindsight, Kybernesis) and updated `docs/CLAWTEXT_V2_SHIPPING_PLAN.md`.
7. **2026-03-14T00:21:04.399–00:21:04.861** — `lumbot` logged `⚠️ Write failed` but continued and proposed memory-braid-inspired Phase 1–6 improvements including provenance, time-aware retrieval, cost observability, and Git hygiene.
8. **2026-03-14T00:59:03.629** — `ragesaq` requested comprehensive plan execution, stronger handoff “mind-meld” quality, expanded transfer modalities, and dogfooding via a clean bridged thread.
9. **2026-03-14T01:00:19.079–01:00:20.350** — `lumbot` audited current ClawBridge (template-driven, mechanical handoff) and analyzed thread-bridge/bin/docs integrations while awaiting context-transfer research.
10. **2026-03-14T01:04:46.367–01:04:47.440** — `lumbot` finalized ClawBridge v2 design with six knowledge types, extraction/compression/structure pipeline, extra formats, and dog-food strategy, plus linked `docs/CLAWBRIDGE_V2_DESIGN.md` and `research/agent-context-transfer-guide.md`.
11. **2026-03-14T01:16:17.047** — `ragesaq` explicitly asked whether ClawText ingestion/memory needed refactors before execution.
12. **2026-03-14T01:22:42.802–01:22:43.593** — after gateway errors, `ragesaq` and `lumbot` resolved OpenClaw `modelByChannel` schema issues; `lumbot` provided corrected string mappings and confirmed runtime health.
13. **2026-03-14T01:34:42.713–01:34:48.930** — `lumbot` completed a full pipeline audit and forced sequencing: P0/P1 fixes first, then ClawBridge build.
14. **2026-03-14T01:39:48.090–01:40:13.801** — `lumbot` executed P0/P1 refactors in `plugin.ts`, `rag.ts`, `build-clusters.js`, including provenance fields and dual-storage/BTM scoring/time filters, with one failed edit in `~/.openclaw/workspace/skills/clawtext/scripts/build-clusters.js (1470 chars)`.
15. **2026-03-14T01:40:08.372–01:40:13.605** — `lumbot` confirmed P0+P1 completion and commit readiness (`87e5f87`), then paused to choose whether to proceed to ClawBridge or remaining P2 items.
16. **2026-03-14T02:08:51.842–02:09:00.076** — `lumbot` implemented ClawBridge v2 in new `bridge/` modules, handling require/module compatibility and verification checkpoints.
17. **2026-03-14T02:09:00.076** — `lumbot` announced ClawBridge v2 core is built and pushed (including commit `f3132e1`) with formatter validation done and completion list published.
18. **2026-03-14T02:09:05.672** — `lumbot` reiterated repo-cleanup backlog and asked whether to test/dog-food first or clean up first.
19. **2026-03-14T02:26:06.755** — `ragesaq` decided: dog-food bridge now, then create a clean thread for project status, cleanup, and forward path.

## 🔧 Lessons & Workflows
- When `plugin.ts` hardcodes project keyword lists and private project names, use cluster-filename auto-detection, because hardcoding (`moltmud`, `rgcs`) breaks public suitability and misses discoverability across 18 clusters.
- When multiple source streams exist (`memory/api-memories/*.json`, `memory/*.md`, `memory/clusters/*.json`), ingest API memories into clustering, because disconnected storage prevented API additions from reaching RAG injection.
- When `rag.ts` relevance is based on naive matching, implement proper BM25 with TF-IDF doc frequency and length normalization (`k1=1.5`, `b=0.75`), because nuance-sensitive retrieval fails with string includes.
- When temporal phrasing appears in queries, apply date parsing before scoring in `findRelevantMemories`, because users need `"last week"` / `"since 2026-03-01"` / `"yesterday"` correctness.
- When package mode is ESM (`"type": "module"`), keep bridge runtime files as `.cjs` if using `require()`/`execFileSync`, because ESM-imported code cannot directly use commonjs `require` safely.
- When `openclaw.json` validation rejects channel overrides, use string-only model values, because nested object configs violate schema.
- When planning a launch, run dependency-ordered refactors: P0/P1 before ClawBridge, because upstream retrieval defects amplify downstream handoff quality issues.
- When handoff content is sparse/mechanical (template + bullets), migrate to progressive LLM extraction/compression/structuring, because template filling underperforms high-density transfer for agent continuity.
- When creating transfer continuity artifacts, include all six handoff types, because missing episodic/implicit/relational context causes repeated context setup costs.
- When preserving compression accuracy, apply density thresholds (`>=0.7` verbatim, `0.4–0.7` compress, `<0.4` cut), because it preserves high-signal facts and decisions while trimming noise.
- When continuing long handoffs, prefer diff-based outputs, because chained A→B→C context should transmit change deltas instead of replaying full state.
- When docs include broken links or removed files, map claims and links against actual file inventory before publishing, because stale references undermine credibility and onboarding.
- When claims are made about features/performance, tie them to measured evidence (counts, clean-compiles, test results), because the bar is explicit correctness over hype.
- When thread contamination exists, perform bridge dogfood into a fresh thread before broad cleanup, because that captures authoritative state and unblocks unbiased continuation planning.
- When finishing cleanup and major refactors, update both architecture docs and plugin docs in the same pass, because split changes otherwise drift.

## 👥 Working Dynamics
- `ragesaq` drives architecture and sequencing (`dogfood first`, phased delivery, high verification bar), while preferring clean context and public-facing hygiene over rushing.
- `ragesaq` insists on concrete evidence and scope control, regularly asks decision checkpoints, and constrains actions to avoid private project leakage and negative competitor commentary.
- `lumbot [bot]` reports with explicit status markers (`✅`, numbered lists, file-level edits, verification metrics), asks targeted review/approval questions, and links generated artifacts before execution.
- Decision exchange pattern is cooperative: `ragesaq` sets strategic direction and sequencing, `lumbot` proposes implementation steps and validates tradeoffs.
- Both prefer documentation-first workflows (`docs/*.md`, daily notes, planning docs) and measurable states (cluster counts, compile status, test outcomes).
- Working dynamic implies trust in execution ability is high, but strategic gating remains user-controlled.

## 💡 Implicit Context
- The project is in a release-hardening phase where quality of public-facing docs and packaging is treated as part of core functionality, not cleanup (high confidence).
- Privacy boundaries and brand credibility are priority constraints; stale private references are seen as blockers to ecosystem adoption (high confidence).
- Context integrity for handoffs is becoming infrastructure, not convenience; this drives the mind-meld and dogfood-first decisions (high confidence).
- The team values architecture discipline over opportunistic fixes, accepting staged dependency work before feature completion (high confidence).
- The user is actively seeking long-term learning transfer (not just one-off changes), hence repeated emphasis on competitor-informed comparison and Gold Standard Post alignment (high confidence).
- Operationally, there is implicit deadline pressure for coherent v2 messaging because multiple audits and fixes are converging toward public readiness (high confidence).
