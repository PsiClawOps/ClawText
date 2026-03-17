---
name: clawtext-restore
description: "On agent bootstrap, checks if this is a fresh or recovered session and automatically injects recent journal context so the agent knows where it left off — without being asked."
metadata: { "openclaw": { "emoji": "🔄", "events": ["agent:bootstrap"] } }
---

# ClawText Auto-Restore Hook

Fires on `agent:bootstrap` (every session start).

## What it does

1. Reads the journal for the current channel/conversation
2. Finds the most recent checkpoint record
3. If there are messages *after* the last checkpoint (indicating a session
   was interrupted without a clean reset), injects a compact context summary
   into the agent's bootstrap files so it already knows the recent thread
4. Silently does nothing if the session is fresh with no prior history

## Result

Instead of the agent starting cold and saying "I don't have context on what
a/b/c refers to" — it wakes up already knowing the last 20 messages of
conversation from the journal.

## Conditions for injection

- Journal file exists for today or yesterday
- At least 3 messages found for this channel
- Most recent message is less than 8 hours old (stale context not injected)
