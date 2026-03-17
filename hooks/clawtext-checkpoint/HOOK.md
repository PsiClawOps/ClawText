---
name: clawtext-checkpoint
description: "Writes structured session checkpoints to the journal on session reset and every 25 messages. Enables automatic context recovery after session loss."
metadata: { "openclaw": { "emoji": "📍", "events": ["agent:reset", "agent:new", "message:preprocessed", "message:sent"] } }
---

# ClawText Session Checkpoint Hook

Fires on:
- `agent:reset` / `agent:new` — writes a full checkpoint immediately
- Every 25 messages (in+out combined) — writes a rolling checkpoint

## What a checkpoint contains

```json
{
  "type": "checkpoint",
  "ts": 1234567890,
  "iso": "2026-03-17T05:44:00Z",
  "sessionKey": "agent:channel-mini:discord:channel:1482230722935918672",
  "channel": "1482230722935918672",
  "channelName": "#clawtext-v2-0-project-status",
  "trigger": "reset" | "interval",
  "messagesSinceLastCheckpoint": 25,
  "recentTopics": ["journal system", "session durability", "context restore"],
  "lastSender": "ragesaq",
  "lastMessageTs": 1234567890
}
```

## Recovery

The checkpoint record in the journal tells `restore-context.mjs` exactly where
session boundaries are. When restoring, you can filter to just the messages
*after* the last checkpoint to get the most recent working context.
