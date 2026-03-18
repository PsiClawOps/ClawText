# ClawText — Recency & Continuity Slot Spec

**Status:** Proposed design note  
**Date:** 2026-03-18  
**Scope:** ClawText prompt compositor / slot architecture only

---

## Why this exists

ClawText already handles **durable memory** well enough to recover prior decisions, docs, and operational patterns.

But recent debugging exposed a different failure mode:

> The system can know the right thing in storage and still feel amnesic in-thread because the prompt compositor drops recent continuity clues before they influence the turn.

Example symptom:
- user says "we talked about this earlier in the thread"
- includes a concrete anchor like `dfree` or a Discord message ID
- data exists in journal / memory / clusters
- compositor drops the clue at scoring time (`0.198 < minScore 0.25`)
- agent answers as if continuity is weak or absent

This is not primarily a durable-memory problem. It is a **recency continuity problem**.

The fix should be architectural, not just a global threshold tweak.

---

## Core design idea

Recency should not be treated as a single scalar freshness signal.

ClawText should distinguish between at least **three different kinds of recent continuity**:

1. **Operator recall anchors** — explicit user-authored rescue clues
2. **Recent thread focus** — the live thematic center of the current thread/session
3. **Unresolved now** — active open loops that should persist until closure

These are not the same thing as:
- durable memory
- deep history
- topic anchor
- generic history scoring

They deserve first-class slot treatment.

---

## Design goals

### Goal 1 — Preserve conversational feel, not just correctness
The agent should feel like it is carrying forward the active work, not just searching history and reconstructing it after the fact.

### Goal 2 — Avoid global context bloat
We do **not** want to loosen the whole compositor by lowering global `minScore` just to save a few high-value continuity cues.

### Goal 3 — Make continuity cues auditable
If a continuity slot fires, its inclusion/exclusion should be visible in `optimization-log.jsonl`.

### Goal 4 — Keep retrieval layered
Durable memory still owns long-term knowledge. These new slots should complement it, not replace it.

---

## Proposed new slots

### 1. `operator-recall-anchor`

**Purpose:**
Preserve explicit operator cues that say, in effect, *"you should remember this from earlier in the thread/session"*.

**Why it matters:**
This is the most direct rescue path when the user is telling the agent exactly where continuity is breaking.

**Trigger examples:**
- "you forgot"
- "we talked about this earlier"
- "in the thread we were posting in"
- "it mentioned dfree"
- explicit Discord/message/thread IDs (snowflakes)
- quoted config keys, command paths, filenames, or other sharp anchors

**Suggested policy:**
- `always-include-if-triggered`
- ignore normal `minScore` threshold once triggered

**Suggested budget:**
- **1–2%** of total budget
- or hard floor around **512–1200 bytes**

**Content shape:**
- exact operator hint, lightly normalized
- preserve IDs, terms, commands, paths, filenames
- avoid summarizing away the clue

**Example output:**
```markdown
## Operator Recall Anchor
- User explicitly referenced earlier thread context
- Anchor terms: `dfree`, `/usr/local/bin/dfree`
- Referenced message/thread ID: `1483734121892020307`
- Cue: "it talked about dfree and some other things i feel like it should have kept"
```

**Failure mode it fixes:**
Prevents the compositor from dropping the very clue that should guide recall.

---

### 2. `recent-thread-focus`

**Purpose:**
Preserve the live thematic center of the current thread/session so the agent feels present in the ongoing work.

**Why it matters:**
Even when durable memory can recover facts, the interaction still feels wrong if the active thread focus is missing.

This slot is about *what we are currently in the middle of*.

**Input sources:**
- recent substantive thread messages
- recent user-authored topic shifts
- repeated nouns/commands/files/hosts/issues in the last N turns
- recent topic-anchor updates if available

**Suggested policy:**
- `high-priority include`
- can still be pruned under extreme pressure, but later than generic mid-history

**Suggested budget:**
- **4–6%** of total budget

**Shape:**
Compact, structured summary of recent focus, not raw transcript replay.

**Example output:**
```markdown
## Recent Thread Focus
- Active issue: Samba / Time Machine restore troubleshooting
- Repeated anchor terms: `dfree`, `fruit:time machine`, `mount failed`
- Current thread energy: continuity debugging + recent thread recall quality
- Most recent continuity concern: agent failed to retain in-thread `dfree` context
```

**Failure mode it fixes:**
Prevents the agent from technically knowing enough while still sounding like it lost the shape of the conversation.

---

### 3. `unresolved-now`

**Purpose:**
Persist active open loops until they are closed.

**Why it matters:**
One of the most human forms of continuity is remembering what is still unresolved.

An unresolved item should not disappear just because it was only mentioned a few turns ago or because another slot scored slightly higher.

**Input sources:**
- explicit user requests not yet satisfied
- open troubleshooting threads
- known blocked validations
- recent "next step" / "still not proven" / "still failing" phrases
- agent-generated open-item summaries from topic-anchor/checkpoint state

**Suggested policy:**
- `include-if-any-open-items`
- prune only under very high pressure

**Suggested budget:**
- **2–4%** of total budget

**Shape:**
Short actionable list of unresolved items.

**Example output:**
```markdown
## Unresolved Now
- Live checkpoint/topic-anchor writer path still not proven in running gateway
- Need final verification of checkpoint diagnostics after restart
- Need deterministic scheduler migration completed for maintenance jobs
```

**Failure mode it fixes:**
Prevents active work from evaporating between turns when it hasn’t yet matured into durable memory.

---

## Relationship to existing slots

### `topic-anchor`
- **topic-anchor** = broader session/project continuity
- **recent-thread-focus** = current live working set inside that broader context

### `memory`
- **memory** = durable retrievable knowledge
- **operator-recall-anchor** = current-turn rescue clue from the operator

### `mid-history`
- **mid-history** = generic historical context, scored and prunable
- **recent-thread-focus** = specialized continuity slice that should be more protected

### `journal`
- **journal** = raw recoverable source of truth
- these new slots = distilled continuity layers built on top of that truth

---

## Why not just lower global `minScore`?

Because that treats a targeted continuity failure as a global threshold problem.

### If we lower global `minScore`
**Pros:**
- near-miss cues like `0.198` might survive

**Cons:**
- more low-value junk survives too
- context gets noisier globally
- scoring becomes less meaningful
- special continuity cues still have to fight with generic low-value content

**Conclusion:**
Do **not** use global threshold relaxation as the primary fix.

Use targeted slot design and explicit triggering instead.

---

## Suggested slot table

| Slot | Role | Budget | Policy | Priority |
|---|---|---:|---|---|
| `operator-recall-anchor` | explicit user continuity cue | 1–2% | always-include-if-triggered | very high |
| `recent-thread-focus` | live thematic center of thread | 4–6% | high-priority include | high |
| `unresolved-now` | active open loops | 2–4% | include-if-open | high |

These should sit alongside:
- `topic-anchor`
- `recent-history`
- `mid-history`
- `deep-history`
- `memory`

---

## Trigger heuristics (initial proposal)

### `operator-recall-anchor` triggers
- presence of Discord/message/thread ID pattern (`\b\d{17,20}\b`)
- phrases like:
  - `you forgot`
  - `we talked about`
  - `earlier in the thread`
  - `it mentioned`
  - `it talked about`
  - `we went over this`
- quoted commands, paths, config keys, filenames
- inline technical anchors like:
  - backtick identifiers
  - `/usr/local/bin/...`
  - `.conf`
  - known command names

### `recent-thread-focus` signals
- repeated nouns/terms in last 10–30 substantive turns
- unresolved troubleshooting terms
- frequent commands/paths/hosts
- recent topic shift markers

### `unresolved-now` signals
- phrases like:
  - `still failing`
  - `not yet`
  - `need to`
  - `next`
  - `remaining`
  - `blocked`
  - `still not proven`
- explicit user asks without closure marker
- open validation loops

---

## Logging expectations

If implemented, `optimization-log.jsonl` should make these visible:
- when a new continuity slot triggered
- what caused it to trigger
- whether it was included or dropped
- why it was pruned, if pruned

This matters because continuity failures are often subtle and vibe-related. We need observable evidence, not guesses.

---

## Recommended implementation order

### Phase 1 — `operator-recall-anchor`
Smallest change, highest immediate value.

Why first:
- directly fixes the `dfree` style miss
- small budget
- easy to reason about
- high user-visible win

### Phase 2 — `recent-thread-focus`
Improves the feeling of thread continuity.

Why second:
- biggest improvement to perceived continuity / "presence"
- likely reduces repeated operator nudges

### Phase 3 — `unresolved-now`
Protects active open loops until closure.

Why third:
- great leverage for longer technical runs
- pairs well with topic anchors and checkpoint state

---

## Open questions

1. Should `recent-thread-focus` be generated from raw recent turns only, or can it consume topic-anchor state too?
2. Should `unresolved-now` be partially generated by the checkpoint/topic-anchor writer path?
3. Should `operator-recall-anchor` preserve the user text exactly, or lightly compress it when very long?
4. Should we allow these slots to borrow unused budget from `mid-history` first?

---

## Recommendation

**Build these as first-class compositor slots, not just scoring tweaks.**

The prompt compositor is now expressive enough to model different kinds of continuity deliberately. That is better than trying to solve every continuity miss with a lower threshold or more generic history.

This is one of the strongest architectural advantages ClawText has: it can encode not just what the system knows, but **how continuity should feel**.
