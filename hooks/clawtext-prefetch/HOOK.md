---
name: clawtext-prefetch
description: "Lightweight Discord cold-start prefetch. Pulls recent channel history into journal when prefetch state is stale."
metadata: { "openclaw": { "emoji": "📥", "events": ["agent:bootstrap", "session:start"] } }
---

# ClawText Discord Prefetch Hook

Runs early in bootstrap and performs a non-blocking Discord prefetch.

## Behavior

- Triggered on `agent:bootstrap` / `session:start`.
- Checks `~/.openclaw/workspace/state/clawtext/prod/prefetch-state.json`.
- If missing or older than 1 hour, fires prefetch asynchronously.
- Never blocks or crashes bootstrap.

## Prefetch source

Uses `scripts/discord-prefetch.mjs` and writes:

- `discord_prefetch` records to journal (`~/.openclaw/workspace/journal/*.jsonl`)
- state summary to `prefetch-state.json`

## Manual run

```bash
npm run prefetch
node scripts/discord-prefetch.mjs --dry-run
```
