# ClawText — Memory, Recall, and Continuity for OpenClaw

**Product:** ClawText | **Status:** Production-capable runtime with 2.0 claim-boundary documentation | **Repository:** https://github.com/ragesaq/clawtext

ClawText gives OpenClaw agents durable, file-first memory behavior with explicit operational boundaries.
It captures context, retrieves what matters for the next prompt, and preserves continuity across threads, while avoiding the common problem of “context drift” between sessions.

---

## The problem we solve

LLM agents in real workflows do not operate in one long conversation.
They switch tasks, threads, and sessions, then re-decide from low-fidelity context.
The result is repeated mistakes, lost continuity, and manual re-explanation.

ClawText prevents this with an explicit memory lifecycle:

- conversation is captured automatically,
- knowledge is ingested and indexed for retrieval,
- operational signals are reviewed and promoted,
- continuity handoff artifacts are generated for safe transitions.

So when context is needed, it is delivered as a curated, bounded, auditable packet rather than an unbounded blob.

---

## What is in the ClawText 2.0 scope (claim-safe)

The repository now defines a **2.0 claim boundary** and we recommend writing public positioning strictly within it.

### ✅ We can safely claim
- plugin loads and works in OpenClaw
- automatic capture-to-memory pipeline is operating (capture → extract → daily memory/writeback)
- retrieval/recall pipeline is active (ranking, merge, prompt injection)
- continuity artifact generation is reliable (`handoff`, `full continuity`, `bootstrap`, backups, manifests)
- operational learning loop works (`capture → recurrence → review → promote → retrieve`)
- bounded continuity safety is enforced:
  - preflight/estimate before runs,
  - chunk budget checks,
  - explicit oversized-run behavior unless override is used,
  - backup + source snapshot persisted with each continuity transfer

### ⚠️ Important limits (don’t overclaim)
- Existing-thread appends work when destination thread is valid and resolvable; stale/invalid IDs may fail.
- ClawText owns context creation and continuity packaging; it does **not** claim full ownership of all Discord transport semantics.
- Relationship support is useful but lightweight; it is not a full graph-native retrieval engine.
- Retrieval quality is continuously improving; it is operationally useful, not mathematically perfect.

For the formal boundary, see: [`docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md`](./docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md)

---

## Product architecture (2.0 view)

ClawText is implemented as three operational lanes:

| Lane | Responsibility | Why it matters |
|---|---|---|
| **Working Memory** | Capture, rank, and inject relevant context into prompts | Improves continuity and response quality in active sessions |
| **Knowledge Ingest** | Import docs/repos/Discord data and keep it searchable | Expands recall without flooding every prompt |
| **Operational Learning** | Learn from failures, patterns, and reviewed recoveries | Improves agent reliability over time |

```text
Message stream
  ├─> Staging / buffer
  ├─> extraction + de-dup
  ├─> daily memory + cluster rebuild
  ├─> hot recall / ranked recall
  └─> prompt injection (token budget controlled)

Discord continuity flow
  ├─> estimate/guardrail
  ├─> handoff/full/bootstrap packet
  ├─> backup + manifest
  └─> bounded execution + visible failure behavior
```

The key design choice is **file-first + explicit boundaries**:
- state is root-owned for runtime artifacts,
- outputs are plain files for auditability,
- critical behavior is controlled by explicit thresholds rather than hidden defaults.

---

## What’s changed recently

### v1.5.0 (current runtime baseline)
- added lightweight relationship support via `memory/clusters/relationships.yaml`
- stabilized operational review/maintenance cadence and curation workflow
- integrated continuity safety checks for bounded handoff behavior
- standardized release-boundary docs for what to claim vs what to defer

### Operationally useful 2.0 workstreams
- canonical plugin install stories (published + linked dev install)
- explicit runtime state-root conventions
- reliability-focused continuity pipeline (estimate first, backups, manifests)
- documented release boundaries to keep positioning technically honest

### In progress / post-2.0 direction
- deeper graph-native retrieval,
- further retrieval quality hardening,
- ongoing public-facing docs refinement and examples.

---

## Quickstart

### 1) Install (canonical)
```bash
# recommended
openclaw plugins install @openclaw/clawtext

# local dev
openclaw plugins install --link /path/to/clawtext
```

`~/.openclaw/workspace/skills/clawtext` can exist as an alias/convenience path if present, but the canonical install contract is plugin-manager install/linked install.

### 2) Verify runtime
```bash
openclaw plugins list
openclaw hooks list
openclaw cron list
```

Expect `clawtext` plugin enabled and its hooks/crons visible.

### 3) Confirm memory pipeline
```bash
# manual extraction/rebuild path is implementation-specific; validate per your environment
# (safe, idempotent commands are listed in AGENT_SETUP.md)

node scripts/build-clusters.js --force
node scripts/validate-rag.js
node scripts/operational-cli.mjs status
```

### 4) Configure
Tune memory recall and gating in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "clawtext": {
        "enabled": true,
        "memorySearch": {
          "sync": { "onSessionStart": true },
          "maxMemories": 5,
          "minConfidence": 0.70
        },
        "clusters": {
          "rebuildInterval": "0 2 * * *",
          "validationThreshold": 0.70
        }
      }
    }
  }
}
```

Common adjustments:
- safer defaults: lower `maxMemories` and raise `minConfidence`
- wider recall: increase `maxMemories`, lower `minConfidence`

Restart OpenClaw after config changes (`openclaw gateway restart`).

---

## Operational workflow (what you actually use)

### Daily memory capture
- every message event is captured to a staging buffer,
- periodic extraction writes structured memory files,
- cluster rebuild and quality validation run on schedule.

### Knowledge import
- ingest docs/repos/Discord exports into structured source packs,
- keep source history in versioned artifact paths.

### Learning feedback loop
- repeated operation signals are surfaced,
- candidates are reviewed before promotion,
- approved guidance is preserved as durable instructions.

### Continuity transfers
- ClawText ships bounded handoff/bootstrap packet generation,
- outputs are visible artifacts (`docs/handoffs/*`, `docs/bootstrap/*`, `memory/bridge/backups/*`),
- execution failures are explicit so agents can recover without silent loss.

---

## Documentation map

**Start here (what most people need):**
- [`docs/CLAWTEXT_2_0_RELEASE_DEFINITION.md`](./docs/CLAWTEXT_2_0_RELEASE_DEFINITION.md) — scope/in-scope vs out-of-scope
- [`docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md`](./docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md) — claim-safe release boundary
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — pipeline and lane model
- [`docs/INGEST.md`](./docs/INGEST.md) — source ingest design and behavior
- [`docs/OPERATIONAL_LEARNING.md`](./docs/OPERATIONAL_LEARNING.md) — capture → review → promotion
- [`docs/PROJECT_DOCS_SCHEMA.md`](./docs/PROJECT_DOCS_SCHEMA.md) — repository-first docs and release schema

**Operational playbooks:**
- [`AGENT_INSTALL.md`](./AGENT_INSTALL.md)
- [`AGENT_SETUP.md`](./AGENT_SETUP.md)
- [`SECURITY.md`](./SECURITY.md)
- [`RISK.md`](./RISK.md)

---

## What ClawText is and isn’t

### ✅ ClawText is
- a practical file-based memory system for multi-agent coordination
- automatically capturing and retrieving memory at prompt time
- auditable, explicit, and file-visible by design
- operationally safe by default (token and confidence gates, failure visibility)

### ❌ ClawText is not
- a full hidden long-context replacement
- a vector-db-first architecture
- a full execution-layer authority for Discord transport quirks
- fully autonomous code-rewrite or self-authoring infrastructure

---

## Version history

| Version | What Changed |
|---|---|
| **2.0 (release boundary)** | Added explicit claim-safe supported behavior/limitations and public 2.0 publication contract |
| **1.5.0** | Added lightweight relationship tracking (`relationships.yaml`) and curated review cadence |
| **1.4.0** | Integrated bundled ingest and operational learning lane |
| **1.3.0** | Hot cache + plugin activation + policy controls |
| 1.2.0 | Tiered memory model and cluster rebuild / validation tooling |
| 1.1.0 | Multi-source ingest + dedup pipeline |
| 1.0.0 | Initial memory injection + recall loop |

> Note: `2.0` here is a published product boundary and behavior claim package; runtime package version remains `1.5.0` until release/versioning aligns.

---

## License

MIT

**Made for OpenClaw.** Designed for reliable agent continuity, practical retrieval, and operational learning.
