---
name: clawbridge
description: Create structured continuity packets and transfer active work across threads, posts, and sessions without losing context.
metadata:
  clawdbot:
    emoji: "🌉"
    requires:
      env: []
      bins: []
    files:
      - templates/full-continuity-packet.md
      - templates/short-handoff-summary.md
      - templates/next-agent-bootstrap.md
---

# ClawBridge

**Carry active work forward with its working state intact.**

ClawBridge is the continuity + transfer layer of the ecosystem.

- **ClawText** remembers durable knowledge
- **ClawBridge** preserves continuity across active work
- **ClawDash** shows and organizes the big picture
- **ClawTask** coordinates products, lanes, and dependencies

## When to use

Use ClawBridge when:
- a thread is getting long and needs a clean continuation
- work is moving to a new forum post, channel, or lane
- a new agent/session needs maximum context delivery
- you want a structured handoff instead of a vague recap
- you want a next-agent bootstrap doc
- you want to separate continuity artifacts from long-term memory

## Do not use it by default for

- tiny conversations that don’t need transfer
- durable memory capture only
- one-line status updates
- generic note taking

## Core modes

### 1. Continuity mode
Use when the primary goal is to keep active work moving.

Output usually includes:
- full continuity packet
- short handoff summary
- next-agent bootstrap

### 2. Memory-promotion mode
Use when the output is primarily a durable architecture/decision artifact.

Output usually includes:
- distilled artifact suitable for ClawText ingest

### 3. Dual-output mode
Use when the conversation produced both:
- active continuity needs now
- durable knowledge worth preserving later

This is the preferred mode for large architecture threads.

## Required outputs

ClawBridge Phase 1 supports these three outputs via CLI automation, with agent-led manual overrides when needed.

### A. Short handoff summary
Purpose: quick re-entry in a destination thread/channel/post.

Read template:
`templates/short-handoff-summary.md`

### B. Full continuity packet
Purpose: maximum context delivery for the next session/agent.

Read template:
`templates/full-continuity-packet.md`

### C. Next-agent bootstrap
Purpose: deterministic startup instructions for the next agent/session.

Read template:
`templates/next-agent-bootstrap.md`

## Recommended workflow

1. **Identify the transfer target**
   - same lane, refreshed thread?
   - new product/lane?
   - new session?

2. **Choose the mode**
   - continuity
   - memory-promotion
   - dual-output

3. **Write the artifacts**
   Recommended locations:
   - `docs/handoffs/`
   - `docs/bootstrap/`
   - `docs/continuity/`

4. **Capture the essentials**
   Always include:
   - current objective
   - settled decisions
   - open questions
   - lane/product context
   - relevant files/docs/posts
   - immediate next steps
   - what not to re-litigate

5. **Optionally promote to ClawText**
   Only if the artifact contains durable knowledge worth retaining long-term.

## CLI command (Phase 1)

```bash
clawbridge extract-discord-thread \
  --source-thread <thread-id> \
  --target-forum <forum-id> \
  --title "<new thread title>" \
  --mode dual \
  --ingest
```

### Agent-led overrides (manual where needed)

- `--objective "..."`
- `--established "..."` (repeatable)
- `--open "..."` (repeatable)
- `--next "..."` (repeatable)
- `--product "..."`
- `--lane "..."`

This follows the design philosophy:
- automatic where sensible
- agent-guided where quality/judgment matter

## Natural language mappings

| User says | What to produce |
|---|---|
| “give me a handoff” | Full continuity packet |
| “make a clean handoff for the next session” | Full packet + bootstrap |
| “sum this up for the next agent” | Bootstrap + short summary |
| “move this to a new thread and keep the context” | Short summary + full packet |
| “capture this so we can continue later” | Full packet |
| “make this durable too” | Dual-output mode |

## Quality bar

A good ClawBridge handoff should let the next agent/session answer immediately:
- what are we doing?
- what is already decided?
- what is still open?
- what should I read first?
- what lane does this belong to?
- what should I do next?
- what should I not waste time re-deriving?

If it cannot do that, the handoff is incomplete.

## Phase 1 boundaries

Phase 1 is a **structured manual workflow skill**, not a full automation package yet.

Phase 1 includes:
- naming and boundary definition
- templates
- standard output structure
- file location conventions
- explicit distinction between continuity and memory

Phase 2 can later add:
- tighter integration with thread-bridge mechanics
- optional automatic ClawText promotion
- helper scripts / exported functions
- richer lane-aware transfer behavior
