# ClawText

**Status:** Production · v1.4.0  
**Architecture:** Three-lane holistic memory system for OpenClaw  
**Focus:** working memory + ingest + operational learning in one installable skill  
**New:** automatic memory pipeline, semantic clustering, continuity transfer

ClawText is a file-based memory system for OpenClaw that keeps `MEMORY.md` small, keeps recent/high-value context on the fast path, and lets deeper knowledge stay searchable without turning the whole workspace into prompt sludge.

It does three things together — and they work automatically:

1. **Working Memory** — retrieves relevant context via semantic clustering and BM25 scoring
2. **Ingest** — pulls in docs, repos, Discord, JSON, and other sources (with deduplication)
3. **Operational Learning** — captures failures, reviews them, promotes durable system guidance

Cross-cutting capability:
- **Continuity Transfer** — creates structured handoff artifacts (short/full/bootstrap) so active work moves across threads/sessions without context loss (packaged as companion skill `clawbridge`)

---

## Why ClawText exists

Most agent memory systems fail in one of two ways:

- they keep almost everything in the prompt and blow up token usage
- or they push everything into a giant archive that agents never retrieve well

ClawText splits the problem into lanes:

- **fast path** for recent and high-value memories
- **searchable path** for larger knowledge stores
- **review path** for lessons about the system itself

That gives you a memory system that stays useful under real load.

---

## 🚀 What's New in v1.4.0

### Automatic Memory Pipeline

ClawText now runs a three-stage pipeline automatically:

1. **Extraction (every 20 min)** — Messages captured to `memory/extract-buffer.jsonl`, then extracted facts/decisions/learnings written to `memory/YYYY-MM-DD.md` using LLM
2. **Clustering (nightly)** — Daily 2am UTC cron rebuilds semantic clusters from daily memories, validates RAG quality, notifies if confidence < 70%
3. **Injection (every prompt)** — `before_prompt_build` hook injects top 5 relevant memories (by BM25 + semantic similarity) automatically — zero latency (~1ms), token-budgeted, confidence-filtered

**Result:** You get context-aware responses without manual memory searches. All memories are discoverable via `memory_search` as well.

### Operational Learning Lane (Live)

ClawText now has three distinct memory paths:

- **Working Memory** — Conversations, decisions, project state (fast path)
- **Knowledge Memory** — Repos, docs, imports, research (searchable)
- **Operational Learning** — System failures, successful fixes, recurring patterns, self-improvement heuristics (separate curation)

The operational lane is populated via:
- Failure capture hooks (tool errors, retry loops, etc.)
- Agent-led review workflow (optional)
- Promotion to durable guidance (if recurrence threshold met)
- Scheduled health checks and metrics

See [docs/OPERATIONAL_LEARNING.md](./docs/OPERATIONAL_LEARNING.md) for full details.

### Structured Memory Maintenance

New agent-driven workflows for memory gardening:

- **Review & Curation** — Inspect extracted facts, mark for archival or promotion
- **Deduplication** — Merge redundant memories via persistent SHA1 hashing
- **Archival** — Move old/stale memories to offline storage
- **Health Monitoring** — Weekly cluster quality metrics, anti-pattern wall breach alerts

Operational CLI: `node scripts/operational-cli.mjs status|review|promote|archive`

### State Root Adoption

Runtime-generated state now lives under `~/.openclaw/workspace/state/clawtext/prod/`:
- Cluster indices
- Evaluation metrics
- Extraction checkpoints
- Thread state

This keeps the repo clean and separates sources (git-tracked) from runtime state (not git-tracked).

---

## Core Architecture

### 1. Working Memory

- **Fast path:** `MEMORY.md` + `memory/YYYY-MM-DD.md` (recent, curated)
- **Searchable:** `memory/clusters/` (semantic indices, 11 pre-built topics)
- **Automatic injection:** `before_prompt_build` hook retrieves top-5 via BM25 + clustering
- **Safety:** Token budgeting, confidence thresholds, anti-pattern walls

### 2. Ingest

- **Sources:** Markdown, GitHub repos, Discord (with auth), docs, JSON exports, structured tables
- **Deduplication:** Persistent SHA1 hashing — safe to re-run imports
- **Scale:** File-based, no external vector DB needed; handles 100K+ memories
- **Filtering:** Raw-log detection, credential hygiene patterns, configurable anti-pattern walls

### 3. Operational Learning

- **Capture:** Hooks detect tool failures, prompt-build issues, retry loops, health degradation
- **Review:** Agent inspects and categorizes (transient vs. systemic, one-off vs. recurring)
- **Promotion:** Durable patterns promoted to `MEMORY.md` or guidance files when threshold met
- **Maintenance:** Scheduled compaction, dedup, archival; health metrics in `state/clawtext/prod/`

### 4. Continuity Transfer

- **Handoff artifacts:** Short summary, full packet, next-agent bootstrap (3 formats)
- **Thread extraction:** Automatic extraction from Discord forum threads with agent-led review
- **Promotion:** Optionally promote high-value continuity artifacts into long-term memory
- **Companion tool:** Packaged as `clawbridge/` skill (usable standalone or with ClawText)

---

---

## Safety and quality model

ClawText is designed to avoid the two biggest memory failures:

1. **storing things that should never be stored**
2. **retrieving things that should never be injected**

Current controls include:

- hygiene patterns for secrets and credentials
- raw-log detection to keep pasted logs/tool dumps out of clusters
- anti-pattern walls to block false associations
- token budgeting for prompt injection
- approval-gated promotion for durable operational guidance
- file-based auditability instead of hidden database state

See:

- [SECURITY.md](./SECURITY.md)
- [RISK.md](./RISK.md)

---

## Install & Activate

### Quick Start

Clone into the canonical OpenClaw workspace path and install:

```bash
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build
```

Enable the plugin in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "~/.openclaw/workspace/skills/clawtext"
      ]
    },
    "allow": ["clawtext"],
    "entries": {
      "clawtext": {
        "enabled": true,
        "memorySearch": {
          "sync": {
            "onSessionStart": true
          },
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

Then restart the gateway:

```bash
openclaw gateway restart
```

### Companion Skill: ClawBridge

For continuity transfer (thread handoffs), also install the companion skill:

```bash
git clone https://github.com/ragesaq/clawbridge.git ~/.openclaw/workspace/skills/clawbridge
```

See `skills/clawbridge/START_HERE.md` for integration docs.

### Validate Installation

```bash
# Build semantic clusters
node scripts/build-clusters.js --force

# Validate RAG quality and injection latency
node scripts/validate-rag.js

# Check operational learning status
node scripts/operational-cli.mjs status

# View memory extraction stats
node scripts/operational-cli.mjs report
```

You should see:
- ✅ Cluster files in `memory/clusters/` (one per major topic)
- ✅ Validation report with BM25 scores and latency < 5ms
- ✅ Extraction state with watermarks and candidate count
- ✅ System health metrics

---

## Documentation Map

### For First-Time Users
Start here to understand what ClawText does:

- **[SKILL.md](./SKILL.md)** — Formal skill definition (for OpenClaw registry / `clawhub`)
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — End-to-end system design (15 min)
- **[docs/HOT_CACHE.md](./docs/HOT_CACHE.md)** — How fast-path memory injection works (5 min)
- **[docs/OPERATIONAL_LEARNING.md](./docs/OPERATIONAL_LEARNING.md)** — The operational lane, with examples (10 min)

### For Operators & Agents
Running ClawText in production:

- **[AGENT_INSTALL.md](./AGENT_INSTALL.md)** — Agent-specific activation guide
- **[AGENT_ONBOARDING.md](./AGENT_ONBOARDING.md)** — Onboarding checklist (first-run questions)
- **[docs/INGEST.md](./docs/INGEST.md)** — How to import sources (repos, Discord, docs, JSON)
- **[docs/MEMORY_SCHEMA.md](./docs/MEMORY_SCHEMA.md)** — YAML format, field reference, examples
- **[docs/CURATION.md](./docs/CURATION.md)** — Maintenance workflows: review, dedupe, archival
- **[RISK.md](./RISK.md)** — Operational risk register and mitigations
- **[SECURITY.md](./SECURITY.md)** — Threat model, controls, trust boundaries

### For Deep Dives
Advanced topics and design decisions:

- **[docs/ME-001_DURABILITY_CLASSIFIER.md](./docs/ME-001_DURABILITY_CLASSIFIER.md)** — How to score memory durability
- **[docs/ME-002_SCOPE_ISOLATION_HARDENING.md](./docs/ME-002_SCOPE_ISOLATION_HARDENING.md)** — Cross-project contamination prevention
- **[docs/ME-003_CONTEXT_LIBRARIAN_CURATION.md](./docs/ME-003_CONTEXT_LIBRARIAN_CURATION.md)** — Curation patterns and heuristics
- **[docs/ME-004_EVAL_HARNESS.md](./docs/ME-004_EVAL_HARNESS.md)** — Evaluation metrics and quality thresholds
- **[docs/ADOPTION_PLAN_MEMORY_EVOLUTION.md](./docs/ADOPTION_PLAN_MEMORY_EVOLUTION.md)** — Phased rollout strategy
- **[docs/ADOPTION_LOG_MEMORY_EVOLUTION.md](./docs/ADOPTION_LOG_MEMORY_EVOLUTION.md)** — Live adoption log with outcomes
- **[docs/STATE_ROOTS.md](./docs/STATE_ROOTS.md)** — How runtime state is organized
- **[docs/TESTING.md](./docs/TESTING.md)** — Test suite, coverage, and CI/CD integration

### Companion Tools
- **[docs/MULTI_AGENT.md](./docs/MULTI_AGENT.md)** — Multi-agent coordination via memory
- **[ClawBridge](https://github.com/ragesaq/clawbridge)** — Thread handoff and continuity transfer (separate repo)
- **[docs/RESEARCH.md](./docs/RESEARCH.md)** — Background research and prior art

---

## What ClawText Is & Isn't

### ✅ ClawText IS

- A practical, file-based memory system for multi-agent coordination
- Fully auditable (no hidden databases)
- Operationally maintainable (YAML configs, explicit pipelines)
- Safe by default (token budgeting, confidence thresholds, hygiene patterns)
- Deployable without external dependencies (no vector DB required)

### ❌ ClawText IS NOT

- A hidden long-context dump
- A vector-database-first architecture
- A replacement for human review on risky changes
- A license to ingest arbitrary untrusted content without controls
- Self-improving code (v1 focuses on guidance capture, not auto-rewrite)
- A browser-based UI (currently file + CLI based; operator UI planned as future work)

---

## Getting Help

- **Bug reports:** Open an issue on [GitHub](https://github.com/ragesaq/clawtext/issues)
- **Questions:** Check [AGENT_ONBOARDING.md](./AGENT_ONBOARDING.md) and [docs/](./docs/) first
- **Community:** Ask on [OpenClaw Discord](https://discord.com/invite/clawd)

---

## Repository & License

- **Source:** https://github.com/ragesaq/clawtext
- **ClawHub:** https://clawhub.ai/ragesaq/clawtext
- **License:** MIT

**Made for OpenClaw.** Designed to be the memory backbone for workspace-wide agent coordination, research, and operational learning.
