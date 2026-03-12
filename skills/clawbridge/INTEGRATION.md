# ClawBridge Integration Guide

## Command

```bash
clawbridge extract-discord-thread [options]
```

## Required options

- `--source-thread <id>`
- `--target-forum <id>`
- `--title "..."`

## Optional options

- `--mode continuity|memory|dual` (default `continuity`)
- `--limit <n>` (default `80`)
- `--workspace <path>` (default `~/.openclaw/workspace`)

### Agent-led override options

- `--objective "..."`
- `--established "..."` (repeatable)
- `--open "..."` (repeatable)
- `--next "..."` (repeatable)
- `--product "..."`
- `--lane "..."`

### Memory promotion options

- `--ingest`
- `--project <name>`
- `--source <label>`
- `--no-rebuild`

## Modes

### continuity
Posts all continuity artifacts to destination thread:
- short handoff
- full continuity packet
- next-agent bootstrap

### memory
Posts only memory-promotion candidate (full packet).

### dual
Same as continuity, with optional memory promotion.

## Suggested operational pattern

### Pattern A: transfer only
Use for active lane moves where memory durability is not yet required.

### Pattern B: transfer + memory promotion
Use when the continuity packet contains durable architecture decisions.

### Pattern C: curated transfer
Use manual overrides for high-value board/architecture handoffs.

## Integration with thread-bridge

Current Phase 1:
- ClawBridge runs as standalone continuity extractor/poster.

Recommended Phase 2:
- call ClawBridge from thread-bridge split/refresh paths
- attach generated short/full/bootstrap outputs during transfer
- optionally trigger memory promotion policy

## Error handling guidance

If provider/API calls fail:
- retry command once
- keep generated local artifacts (docs/handoffs + docs/bootstrap)
- manually post artifacts if needed
- if `--ingest` failed, rerun with `--ingest` only after checking ClawText availability

## Quality guidance for agents

For major transfers:
- always provide `--objective`
- provide at least 2 `--established` lines
- provide at least 1 `--open` and 1 `--next`
- use `--mode dual --ingest` when architecture decisions are durable

This keeps automation high while preserving agent judgment where it matters.
