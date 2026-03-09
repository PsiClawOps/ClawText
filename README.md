# ClawText — Memory for AI Agents

**Version:** 1.3.0 | **Status:** Production

---

## The Problem: Agents Without Memory Are Limited

Every time you talk to an AI agent, it processes your message in isolation. It doesn't know:
- What project you were working on yesterday
- What decisions you already made
- What mistakes to avoid
- Your preferences or style
- What other agents have learned

This works fine for one-off questions. But for agents that tackle real work—coding, debugging, managing projects, collaborating with other agents—this lack of continuity is crippling.

**The core issue:** Without memory, every agent interaction starts from zero. You're constantly re-explaining context. The agent can't build on past work. Knowledge is lost between sessions.

---

## How Agent Memory Works

To understand why memory matters, let's look at how agentic systems like OpenClaw actually work, then see where memory fits in.

### The Anatomy of an Agentic System

Every time you interact with an agent (OpenClaw, ChatGPT, Claude, etc.), the same basic flow happens:

```
User Input
    ↓
[System builds a prompt]
    ↓
[Prompt sent to LLM]
    ↓
[LLM generates response]
    ↓
Agent Action/Output
```

The prompt is the critical piece. It contains:
- **System instructions** — "You are a helpful coding assistant"
- **Conversation history** — Recent messages for context
- **Current request** — What the user is asking right now

The LLM processes all of this and generates a response based on what's in the prompt.

### Without a Memory System

```
System instructions
+ Recent conversation
+ User request
       ↓
    [LLM]
       ↓
    Response
```

**Problem:** If your project is old, the LLM only sees recent messages. Important context (past decisions, architectural patterns, lessons learned) is gone.

Example:
```
User: "Fix the authentication bug"
Agent: *searches recent history* "I don't see any architecture notes. What's your auth setup?"
User: *explains the entire architecture again*
```

You're constantly re-explaining things that the agent should already know.

### With a General Memory System

```
System instructions
+ Recent conversation
+ [Memories retrieved from storage] ← NEW
+ User request
       ↓
    [LLM]
       ↓
    Response
```

**Improvement:** Before processing the request, a memory system searches storage and injects relevant context into the prompt.

```
System instructions
+ Recent conversation
+ [Context from memory:
    - Decision: JWT with 24h expiry
    - Bug: Redis cache invalidation issue
    - Pattern: Use async/await]
+ User request: "Fix the authentication bug"
       ↓
    [LLM]
       ↓
    Response: "I see the Redis invalidation problem..."
```

The agent now has background information and can make informed decisions immediately.

### The Memory System Challenge

A basic memory system works, but it creates new problems:

1. **Slow retrieval** — Searching all old memories takes time. Adding latency to every prompt hurts agent responsiveness.
2. **Noise** — Irrelevant memories clutter the prompt, wasting tokens and confusing the LLM.
3. **Duplicate memories** — The same thing gets stored multiple times. Which version is current?
4. **No prioritization** — Old memories get mixed with important ones. The system can't tell what matters.
5. **Grows without bound** — Over months, memory accumulates into an unmaintainable pile.

### Where ClawText Comes In

ClawText solves these problems with a **tiered architecture** and **intelligent curation**:

- **L1 (Hot cache)** — Instant retrieval of high-value memories (microseconds, not milliseconds)
- **L2 (Curated)** — Validated, deduplicated memories ready for injection
- **L3 (Archive)** — Historical context you might need later but don't query often
- **L4 (Staging)** — Raw captures awaiting review and promotion

The result: Your agent gets the right context, fast, without noise or duplicates.

```
System instructions
+ Recent conversation
+ [ClawText: Fast, relevant memories injected here]
+ User request
       ↓
    [LLM]
       ↓
    Better response (context-aware, informed, consistent)
```

---

## What ClawText Does

ClawText is a **tiered memory system** designed specifically for agents. It ensures:

1. **Fast retrieval** — Recent, high-value memories are instantly available (no latency added to prompts)
2. **Relevance** — The system finds memories that actually matter to the current task
3. **Automatic maintenance** — Old or duplicate memories are archived; important ones are promoted
4. **Multi-agent collaboration** — Agents can share context and build on each other's work
5. **Scalability** — Memory grows without becoming unmaintainable

### The Four-Tier Architecture

| Tier | Purpose | Latency | Size |
|------|---------|---------|------|
| **L1: Hot Cache** | Immediate recall for active projects and recent decisions | <1ms | ~50-300 items |
| **L2: Curated** | Important context promoted from staging after validation | ~10ms | Indexed, searchable |
| **L3: Archive** | Historical context, less-accessed but still searchable | ~100ms | Full history |
| **L4: Staging** | Raw captures from conversations, awaiting curation | Write-only | Temporary buffer |

When your agent needs context, it queries L1 first (instant), then L2 if needed. Archive is there if you want deep searches.

---

## Key Features

### 🔥 Sub-Millisecond Retrieval
Recent memories live in a hot cache. Injecting context into prompts adds microseconds, not milliseconds.

### 🤖 Multi-Agent Memory
- **Shared** — All agents can access common decisions and architecture notes
- **Private** — Sensitive context stays isolated
- **Cross-agent** — One agent can leave context for another to pick up

### 🔄 Automatic Continuity
Agents remember which session they were in and can pick up mid-conversation. No more "Wait, who are you? What are we doing?"

### 💻 Programmable API
Add and search memories from code, CLI, or hooks:
```bash
npm run memory -- add "Decision: Use PostgreSQL for state"
npm run memory -- search "database" --project myapp
npm run memory -- inject "current_task"  # Get context for prompt injection
```

### 🏥 Self-Monitoring
The system watches itself and alerts you to problems:
```bash
npm run health
# → Reports: cache hit rate, staleness, review backlog, recommendations
```

---

## How It Fits Into Your Workflow

**Without ClawText:**
```
Agent session 1 → Learns something → Lost after session ends
Agent session 2 → Starts from zero → Relearns same lessons
```

**With ClawText:**
```
Agent session 1 → Learns something → Auto-captured and stored
Agent session 2 → Context injected into prompt → Builds on session 1
```

The memory system runs in the background. Your agents just get smarter over time.

---

## Quick Start

```bash
# Install
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build

# Test
npm test    # Should show: 15 clusters, 191 memories, hot cache ready
```

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** — How memory tiers work, retrieval algorithms, performance tuning
- **[Multi-Agent](docs/MULTI_AGENT.md)** — Shared/private memory, agent collaboration, cross-agent context
- **[Curation](docs/CURATION.md)** — How memories are promoted, archived, deduplicated
- **[Testing](docs/TESTING.md)** — Verify your installation and run integration tests

## GitHub

https://github.com/ragesaq/clawtext
