---
name: clawtext-prune
description: "Emergency active pruning before compaction: trims low-value context, writes a rich pre-compaction checkpoint, and logs compaction-avoidance signals."
metadata: { "openclaw": { "emoji": "✂️", "events": ["before_compaction"] } }
---

# ClawText Active Pruning Hook

Runs at `before_compaction`.

## What it does

1. Reads current context pressure state (`context-pressure.json`) via `ContextPressureMonitor`.
2. Forces emergency pruning aggressiveness (`>= 0.9`).
3. Builds a rich pre-compaction checkpoint and appends it to today’s journal file.
4. Appends pruning telemetry + decisions to:
   - `~/.openclaw/workspace/state/clawtext/prod/optimization-log.jsonl`
5. Emits a compaction-avoidance signal in logs when enough tokens are freed.

> Note: actual compaction cancellation requires OpenClaw core support. This hook only records the signal.

## Config

Config file (auto-created):

`~/.openclaw/workspace/state/clawtext/prod/active-pruning-config.json`

```json
{
  "enabled": true,
  "preserveLastNTurns": 5,
  "compactionAvoidanceThresholdTokens": 1800
}
```

## Journal checkpoint record

Record type: `pre_compaction_checkpoint`

Includes:
- pressure snapshot
- slot/source breakdown
- extracted context topics
- full pruning decision list
- estimated bytes/tokens freed
