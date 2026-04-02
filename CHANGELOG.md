# Changelog

All notable changes to ClawText are documented here.

---

## [Unreleased]

### Changed
- Refreshed `README.md` to distinguish **live now**, **shadow-only**, **restart/cutover-gated**, and **not yet fully live** ClawText behavior.
- Added `docs/SESSION_INTELLIGENCE_ROLLOUT_PREP.md` with the current-state delta, guarded Walk 1/2 rollout plan, canary recommendation, prerequisites, blockers, measurement plan, and explicit call that `legacy` remains the current gating limiter.

---

## [0.4.0] — 2026-03-20

### Added

#### Reflect — LLM-Mediated Memory Synthesis
- `src/reflect/index.ts` — core reflect module: `reflect()`, `shouldReflect()`, `loadConfig()`, `saveConfig()`, `clearCache()`, `getStats()`
- Synthesizes retrieved memories into 2–3 sentence summaries via LLM (Gemini 3 Flash Preview by default, via OpenRouter)
- Automatic trigger mode: agents get synthesis on every memory retrieval without manual opt-in
- 1-hour result cache to eliminate redundant calls on repeated queries
- Graceful stub fallback when API key is unavailable
- API key resolution: reads from `openclaw.json` config directly — no gateway restart required
- `src/reflect/telemetry.ts` — JSONL append-only telemetry log with latency, token estimates, cost, cache hits, and per-model breakdown
- `src/reflect/prometheus.ts` — Prometheus-format metrics export for future ClawMon integration
- `src/slots/reflect-slot-provider.ts` — `{{memory.reflect:query}}` slot selector support
- CLI: `reflect show|set|stats|clear` commands
- Default config seeded at `state/clawtext/prod/reflect/config.json`
- Spec: `docs/REFLECT_SPEC.md`

#### Permission Model — Context Access Control (CAC)
- `src/permissions/index.ts` — 4-layer hierarchical permission resolver
- Resolution order: Global Defaults → Role → Vault Override → User Override
- `resolvePermissions({ userId, vaultId })` → full `ResolvedPermissions` with layer provenance
- `canAccess({ userId, vaultId, operation })` → `{ allowed, permissions }`
- Fields: `recall`, `retain`, `recallBudget`, `recallMaxTokens`, `retainEveryNTurns`, `llmModel`, `crossSessionVisibility`, `operationalLearningAccess`
- Operator role seeded at `state/clawtext/prod/permissions/roles/operator.json`
- Global defaults seeded at `state/clawtext/prod/permissions/defaults.json`
- Spec: `docs/PERMISSION_MODEL.md`

#### Record — Transaction Journal
- `src/record/index.ts` — append-only JSONL transaction log with SHA-256 hash chain
- `appendTransaction(type, payload)` — adds transaction, updates sequence index
- `readTransactions({ from, to })` — range read
- `verifyChain()` — validates entire hash chain integrity
- `getRecordStatus()` — current sequence, entry count, last hash
- Typed helpers: `recordMemoryExtracted()`, `recordMemoryPromoted()`, `recordSessionCheckpoint()`, `recordOperationalFailure()`
- Transaction types: session events, memory events, operational learning, vault/permission events, node lifecycle
- Spec: `docs/RECORD_SPEC.md`

#### Fleet Command — Node Registry
- `src/fleet/index.ts` — cluster node registry
- `upsertNode()`, `removeNode()`, `recordHeartbeat()`, `sweepStaleNodes()`
- `getFleetStatus()` — summary across all nodes with status counts
- `buildHeartbeat()` — constructs heartbeat payload from local node config
- Luminous node seeded at `state/clawtext/prod/fleet/config.json` and `nodes.json`
- Spec: `docs/FLEET_COMMAND_SPEC.md`

#### Peer Push/Pull Protocol
- `src/peer/index.ts` — HTTP-based transaction sync between nodes
- `pushToPeer()`, `pullFromPeer()`, `getPeerStatus()`, `sendHeartbeat()` — outbound calls
- `handleInboundPush()` — idempotent inbound transaction replay with hash verification
- `handleInboundHeartbeat()` — inbound heartbeat handler
- `syncWithPeers()` — full pull-then-push cycle with all online peers

#### ClawCouncil Integration Helper
- `src/integrations/clawcouncil.ts` — packages ClawText context for advisor sessions
- `renderCouncilContext({ sessionId, query, memories, enableReflect })` → `CouncilContextPayload`
- `renderCouncilPromptBlock(template, options)` → expanded prompt string
- Supported tokens: `{{memory.context}}`, `{{advisor.context}}`, `{{session.context}}` plus all standard slot selectors
- Automatic Reflect integration when memories + query are provided

#### IaC CLI — Plan / Apply / Validate
- `iacCLI(['plan'])` — shows current resource inventory, detects drift
- `iacCLI(['validate'])` — validates permissions, record chain integrity, fleet config
- `iacCLI(['apply'])` / `apply --auto-approve` — applies pending config changes
- `iacCLI(['status'])` — live resource state: Record seq, Fleet nodes, Permission roles

#### Topic-Based Extraction
- `src/extraction/extraction-router.ts` — strategy-based extraction routing
- `src/extraction/tag-filters.ts` — tag-based memory filtering
- `src/providers/extraction-provider.ts` — extraction slot provider
- CLI: `extraction strategies|topics|tags` commands
- Strategies: `deep-analysis`, `lightweight`, `disabled`, `recall-only`
- Spec: `docs/TOPIC_EXTRACTION_SPEC.md`

#### Advisor Slots + Session Matrix
- `src/slots/advisor.ts` — advisor definitions, routing rules, council perspectives
- `src/slots/sessionMatrix.ts` — session rows, ownership events, related session resolution
- `src/slots/slot-api.ts` — slot resolution functions for all selector types
- `src/slots/template-expansion.ts` — `expandSlotTemplates()` with `onMissing` option
- Selectors: `{{advisor.active}}`, `{{advisor.byDomain:X}}`, `{{advisor.byId:X}}`, `{{session.owner:X}}`, `{{session.related:X}}`, `{{session.matrix:X}}`, `{{council.perspectives}}`, `{{routing.rule:X}}`, `{{routing.explain:X}}`
- `src/providers/advisor-provider.ts`, `src/providers/session-matrix-provider.ts` — slot providers

### Changed
- Renamed: Ledger → Record, Hive → Fleet Command (spec alignment)
- Default reflect model: `gemini-3-flash-preview` (via OpenRouter `google/gemini-3-flash-preview`)
- Default reflect trigger: `auto` (was `on-demand`)
- `callReflectLLM()` reads API key from `openclaw.json` before falling back to env var

### Fixed
- Integration test updated to match `renderCouncilContext` async API

### Tests
- 7/7 tests passing (4 content classifier + 3 integration)

---

## [0.3.0] — 2026-03-18

### Added
- Lane 6 — Clawptimization: `PromptCompositor`, `BudgetManager`, `ContextPressureMonitor`, `ActivePruner`, `ContentTypeClassifier`, `ContradictionDetector`, `DecisionTreeMemory`, `CrossSessionAwareness`
- ClawBridge: active working context transfer with structured transfer packets
- Library Lane: curated documentation collections with manifest-backed ingest
- `ClawTextInjectionPlugin`: OpenClaw hook integration for automatic context injection
- Slot providers: topic anchor, decision tree, cross-session, ClawBridge, situational awareness, ClawDash panel
- Scored-select compositor for context quality ranking

---

## [0.2.0] — 2026-03-12

### Added
- Operational learning lane with recurrence-based promotion
- Hot cache (L1) with confidence-scored admission
- Ingest system: files, JSON, URLs, Discord exports
- SHA1 deduplication via `.ingest_hashes.json`
- `validate-rag.js` — retrieval quality validation tool

---

## [0.1.0] — 2026-03-03

### Added
- Working memory: capture → extract → cluster → inject
- BM25 + semantic hybrid retrieval
- Nightly cluster rebuild cron
- Before-prompt-build hook
- `MEMORY.md` + daily notes integration
