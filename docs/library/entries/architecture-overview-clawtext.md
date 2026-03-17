---
kind: library-entry
project: clawtext
topic: architecture
status: active
curation: reviewed
visibility: shared
last_reviewed: 2026-03-17
source_docs:
  - README.md
  - docs/ARCHITECTURE.md
  - docs/NORTHSTAR.md
  - docs/INGEST.md
summary_confidence: 0.91
---

# ClawText Architecture Overview

## Core idea
ClawText is a layered memory and continuity system for OpenClaw. It is not an execution platform. It owns memory capture, retrieval, curation, and continuity packaging.

## Active product lanes
### 1. Working memory
Purpose:
- retrieve relevant prior context at prompt time
- inject the highest-value context with bounded token usage
- keep agents from re-asking the same questions

### 2. Knowledge ingest
Purpose:
- pull external material into the memory system
- normalize repos, docs, threads, URLs, and exports
- make imported material retrievable through the same broader memory flow

### 3. Operational learning
Purpose:
- capture repeated failures and recovery patterns
- score recurrence
- surface candidates for review
- promote stable guidance into reusable memory

### 4. Continuity / ClawBridge
Purpose:
- package active working state for movement between sessions, threads, or surfaces
- preserve decisions, context, and next steps in structured artifacts

## Memory-layer model
ClawText documentation currently describes a layered memory model that includes:
- hot / prompt-time context
- durable / curated memory
- searchable archive
- intake / staging

The precise implementation surfaces may vary by subsystem, but the architectural point is stable: **memory is layered, not monolithic**.

## Strategic locks
The architecture is constrained by these rules:
- file-first state is non-negotiable
- promotion is review-gated, not autonomous
- ClawText integrates with execution surfaces; it does not become the executor
- lightweight relationships are acceptable; graph-native retrieval is deferred
- visibility and auditability matter as much as automation

## Post-2.0 architectural expansion
The next planned architectural lane is the **Documentation / Library Lane**.

Its job is to hold curated project knowledge that does not fit neatly into:
- transient working context
- raw ingest material
- operational-failure guidance
- continuity handoff packets

## Use this entry for
- "How is ClawText structured?"
- "What are the current lanes?"
- "What architectural boundaries are locked?"
- "What is the next architectural extension after 2.0?"

## Refresh triggers
Refresh when:
- lane structure changes
- retrieval model changes materially
- continuity scope changes
- library lane moves from design draft to implementation
