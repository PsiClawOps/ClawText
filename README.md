# ClawText

Durable memory, continuity, and operational learning for OpenClaw agents.

ClawText helps long-running agents continue with context already in place instead of restarting from zero. It captures what matters, retrieves relevant knowledge at the right time, preserves structured handoffs, and turns repeated workflow failures into reusable guidance.

## The problem
Agent work breaks down when context gets fragmented.

Decisions end up scattered across prior sessions, docs, repos, failures, and handoff artifacts. The result is familiar:
- the same questions get asked again
- the same mistakes get repeated
- useful work has to be reconstructed from scratch
- switching sessions or surfaces feels like starting over

## What ClawText is
ClawText is a layered memory and continuity system for OpenClaw.

It gives agents three practical capabilities:
- **working memory** — retrieve relevant context at prompt time
- **durable memory** — preserve decisions, docs, patterns, and operational history
- **continuity artifacts** — move work across sessions, threads, and recovery flows with structured handoffs

## What you get
With ClawText, agents can:
- remember prior decisions instead of re-deriving them
- surface relevant docs, repos, and prior work automatically
- learn from repeated failures and successful workflows
- preserve structured handoffs so work can continue cleanly on another surface or in another session

This is not just memory search. It is a system for making previously earned context usable again.

## How it works
### 1. Retrieve context when it matters
ClawText injects relevant prior decisions, patterns, and docs into active work so agents continue with context already in place.

### 2. Build durable memory over time
Docs, repos, working notes, and operational patterns become retrievable memory instead of disappearing into logs and old threads.

### 3. Preserve continuity across work surfaces
Structured handoffs, bootstrap packets, manifests, and backups keep work moving when it leaves the current session.

## A quick example
An agent spends an hour debugging a workflow, finds the real fix, and captures the result.

Later, the work resumes in a different session.

Without ClawText, the next session often repeats the same dead ends.
With ClawText, the prior decision path, useful patterns, and handoff context are already available.

## Install
```bash
openclaw plugins install @openclaw/clawtext
```

## Verify
```bash
openclaw plugins list
openclaw hooks list
openclaw cron list
```

## First run
ClawText works automatically from there.

Your first agent run will begin capturing context, building daily memory, and preparing future retrieval without requiring heavy setup.

## Typical use cases
- reduce repetitive questions across long-running work
- preserve continuity across sessions or threads
- make team docs and repos queryable during agent execution
- accumulate operational wisdom from repeated failures and successful workflows

## Who it is for
ClawText is for operators and teams running long-lived OpenClaw agent workflows who want:
- stronger continuity
- better memory reuse
- less repeated re-explanation
- more durable operational learning

## What it is not
ClawText is not:
- a full hidden long-context replacement
- a general-purpose vector database product
- a full identity or secrets platform
- the owner of Discord/forum execution semantics

## Learn more
- `docs/ARCHITECTURE.md` — deeper system design
- `docs/NORTHSTAR.md` — strategic product definition
- `docs/PRD.md` — current product-definition baseline
- `docs/MILESTONES.md` — delivery and value history
- `docs/OPERATIONAL_LEARNING.md` — operational lane details
- `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md` — internal support boundaries

## Version note
ClawText is currently framed as the **2.0 product release** while the published package version remains `@openclaw/clawtext` **1.5.0**.
