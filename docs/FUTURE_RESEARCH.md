# ClawText — Future Research & Considerations

_Ideas extracted from ecosystem review. All local-only compatible. Review periodically._

---

## From: Memori (MemoriLabs/Memori)
**Reviewed:** 2026-03-17
**Repo:** https://github.com/MemoriLabs/Memori
**What it is:** Cloud-hosted SQL + vector DB + knowledge graph memory for LLMs. OpenClaw plugin available.

### 1. Semantic Triple Extraction
**What:** Auto-extract subject-predicate-object relationships from conversations. Example: "My favorite database is PostgreSQL" → `(user, favorite_database, PostgreSQL)`.
**Why it matters:** Our `relationships.yaml` is manual YAML. Triples are queryable, composable, and can be auto-generated. Enables queries like "what does user prefer for X?"
**Local adaptation:** Run extraction via local LLM (or pattern matching for common structures). Store as YAML or lightweight SQLite. No cloud needed.
**Effort:** Medium — needs extraction pipeline + storage format design
**Priority:** Low — our YAML relationships cover 90% of use cases today

### 2. Entity/Process/Session Scoping
**What:** Memories are isolated per user (`entity_id`), per agent (`process_id`), and per session (`session_id`). Prevents cross-user memory bleed.
**Why it matters:** ClawText is currently single-tenant (one workspace, one user). If we ever support multi-user or multi-agent workspaces with privacy boundaries, this is the model.
**Local adaptation:** Add optional `entity` and `process` fields to memory YAML. Filter at query time. No architecture change needed for single-user.
**Effort:** Low to add fields, Medium to enforce isolation
**Priority:** Low — not needed until multi-user scenario

### 3. Mention Counting on Deduplication
**What:** When the same fact appears N times, instead of discarding duplicates, increment a mention count and update timestamp. Frequency becomes an importance signal.
**Why it matters:** Our SHA1 dedup silently drops repeat mentions. But "user mentioned PostgreSQL preference 12 times" is a stronger signal than "mentioned once."
**Local adaptation:** Add `mentionCount` and `lastMentionedAt` fields to memory records. On SHA1 collision, increment count instead of skip. Factor count into BM25 scoring.
**Effort:** Small — field additions + dedup logic tweak + scorer boost
**Priority:** Medium — cheap to implement, improves recall quality

### 4. Structured Extraction Types
**What:** Memori categorizes extractions into: facts, preferences, skills/knowledge, attributes. Each type has different scope (per-entity vs per-process).
**Why it matters:** Our extraction cron produces undifferentiated memory entries. Typed extraction enables better scoring (preferences are high-value, attributes are process-specific).
**Local adaptation:** Extend our content-type classifier to include `preference`, `skill`, `attribute` alongside existing `decision`, `fact`, `discussion`, etc. Already have the classifier infrastructure.
**Effort:** Small — extend existing classifier
**Priority:** Medium — aligns with content-type half-life system we already have

---

## From: snap-memory (furyfrog-agent/snap-memory)
**Reviewed:** 2026-03-17
**Repo:** https://github.com/furyfrog-agent/snap-memory
**What it is:** Compaction-proof topic snapshots. Zero dependencies, pure local markdown. ~450 lines.

### 5. Topic Anchor Snapshots (SlotProvider candidate)
**What:** Structured per-topic markdown files with 4 sections: Meta, Current Status, Key Decisions, History. Session-bound — each Discord channel/thread binds to a topic. Auto-saved before compaction, auto-injected into prompts.
**Why it matters:** This directly addresses the "what are we working on and what did we decide" problem that compaction destroys. Our compositor has named slots — a **topic-anchor slot** would keep project context pinned even as chat history compacts away. Decisions with `halfLife: Infinity` already survive in our system, but there's no structured "project status" that survives.
**Local adaptation:** Build a `TopicAnchorProvider` SlotProvider that:
- Reads `memory/context-{topic}.md` files (or equivalent)
- Binds sessions to topics via session map
- Fills a compositor slot with structured status + decisions + recent history
- Auto-updates before compaction via the prune hook we already have
- Prunes history/decisions to configurable limits
**Effort:** Medium — new SlotProvider + session-topic binding + auto-save hook
**Priority:** HIGH — this is the most directly useful idea. A topic anchor slot would dramatically improve continuity across compactions.

### 6. Session → Topic Binding Map
**What:** `context-session-map.json` maps `sessionKey → topicName`. First checkpoint creates binding, everything after is automatic.
**Why it matters:** We don't have explicit session-to-project mapping. The compositor infers source from content keywords (heuristic). An explicit binding would be more reliable.
**Local adaptation:** Store in `state/clawtext/prod/session-topic-map.json`. Populate from journal channel IDs or explicit agent checkpoint calls. Use in compositor to select relevant topic anchor.
**Effort:** Small — JSON map + lookup in compositor
**Priority:** Medium — enables #5 and improves compositor source inference

### 7. Strip-Before-Compact Pattern
**What:** `stripInjectedContext()` removes snap-memory's own injected content before compaction processes it. Prevents re-ingestion loops where injected context gets compacted back into the summary and then re-injected, growing each cycle.
**Why it matters:** Our `<!-- CLAWPTIMIZATION: optimized context -->` markers could have the same re-ingestion problem. If the compositor injects context, then compaction summarizes it, then the compositor injects it again on top of the summary — context grows.
**Local adaptation:** Add stripping of CLAWPTIMIZATION markers and `<relevant-memories>` tags in our pre-compaction checkpoint hook. We already strip these in `cleanQueryForSearch()` for RAG — extend to compaction input.
**Effort:** Small — add stripping to prune hook
**Priority:** HIGH — prevents a subtle context growth bug

### 8. Heartbeat/Cron/Memory Session Filtering
**What:** Hooks skip heartbeat sessions, cron sessions, and memory-internal sessions. Prevents garbage context files from accumulating.
**Why it matters:** Our hooks fire on all sessions including heartbeats. The extract buffer captures heartbeat polls (visible in today's daily notes — tons of heartbeat messages). Filtering these at the hook level would reduce noise.
**Local adaptation:** Check `ctx.trigger` in our `before_prompt_build` handler. Skip compositor for heartbeat/cron triggers.
**Effort:** Small — 3-line guard clause
**Priority:** Medium — reduces noise, saves compute

### 9. Recency & Continuity Slots
**What:** Add dedicated compositor slots for:
- `operator-recall-anchor` — explicit user continuity rescue cues
- `recent-thread-focus` — live thematic center of the current thread
- `unresolved-now` — active open loops not yet closed
**Why it matters:** Durable memory can be correct but still feel amnesic if the prompt loses the recent shape of the work. Recency is not just a score; it's a first-class continuity layer.
**Local adaptation:** Build as slot providers / protected slot classes inside Clawptimization. Keep global `minScore` stable; use targeted continuity lanes instead of globally lowering thresholds.
**Spec:** `docs/RECENCY_CONTINUITY_SLOT_SPEC.md`
**Effort:** Medium
**Priority:** HIGH — strong fit for ClawText's compositor architecture and directly addresses in-thread continuity failures like dropped `dfree` recall hints.

---

## Research Queue Summary

| # | Idea | Source | Priority | Effort |
|---|------|--------|----------|--------|
| 5 | **Topic anchor snapshots (SlotProvider)** | snap-memory | **HIGH** | Medium |
| 7 | **Strip-before-compact pattern** | snap-memory | **HIGH** | Small |
| 3 | Mention counting on dedup | Memori | Medium | Small |
| 4 | Structured extraction types | Memori | Medium | Small |
| 6 | Session → topic binding map | snap-memory | Medium | Small |
| 8 | Heartbeat/cron session filtering | snap-memory | Medium | Small |
| 1 | Semantic triple extraction | Memori | Low | Medium |
| 2 | Entity/process/session scoping | Memori | Low | Medium |

**Recommended next batch:** #5 + #7 + #6 (topic anchors + strip-before-compact + session binding). These three form a cohesive feature: "compaction-proof project context that the compositor manages automatically."

---

_Last reviewed: 2026-03-17_
_Add new research items as they come up. Review monthly or when planning feature waves._
