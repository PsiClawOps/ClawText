# ClawText — Memory for AI Agents

**Version:** 1.3.0 | **Status:** Production

---

## What is Agent Memory?

AI models process each conversation in isolation. They have no built-in way to remember what happened yesterday, last week, or even earlier in the same project. This is fundamentally different from how humans work.

**The core problem:**
- A human remembers: "We discussed this architectural decision last week. We decided to use X because of Y."
- An AI agent without memory: "This is our first conversation. What do you want to do?"

For simple, stateless tasks (answering a one-off question, writing a poem), this doesn't matter. But for agents that work on **ongoing projects, maintain code, debug issues, or collaborate with other agents**, the lack of continuity becomes a critical limitation.

---

## Why Memory Matters for Agents

Memory solves three core problems:

**1. Continuity** — Your agent understands the current state of your project without you explaining it every time.

**2. Learning** — After fixing a bug, your agent remembers what went wrong and how you fixed it. It can apply that lesson to similar problems.

**3. Collaboration** — Multiple agents can share context. One agent's work informs the next one's decisions. They build on each other instead of working in isolation.

### Real-World Impact

| Use Case | Without Memory | With Memory |
|----------|---------------|-------------|
| Long-running project | "What are we building?" (every session) | Knows the full project context and current blockers |
| Debugging recurring issues | Suggests the same wrong fix twice | Learns from past fixes and avoids them |
| Team of agents | Each agent reinvents the wheel | Agents share learnings and coordinate work |
| User preferences | Asks "What format do you prefer?" repeatedly | Remembers and applies your style automatically |

---

## How ClawText Works

ClawText implements a **tiered memory architecture** that keeps frequently-needed information fast and searchable, while archiving less-active memories for long-term storage.

The system operates in five stages:

1. **Capture** — Key information is extracted from conversations and tagged with metadata (timestamp, project, importance)
2. **Store** — Memories are placed in the tier that matches their access pattern (hot cache for frequent retrieval, archive for deep searches)
3. **Retrieve** — When your agent needs context, ClawText finds relevant memories instantly
4. **Curate** — Over time, memories are promoted, deprioritized, or archived based on usage patterns
5. **Clean** — Duplicates are removed, stale entries are archived, and the system stays maintainable

The result: Your agent has immediate access to what it needs, without the memory growing into an unmaintainable mess.

---

## Key Features

### 🔥 Hot Memory Cache
High-value memories stay in a fast, in-memory cache. Recent decisions, active projects, and frequently-referenced context are retrieved in microseconds — not seconds.

### 🤖 Multi-Agent Visibility
- **Shared** — Common knowledge visible to all agents (project decisions, architecture notes)
- **Private** — Sensitive context only accessible to you or specific agents
- **Cross-agent** — One agent can leave instructions or context for another

### 🔄 Session Continuity
Your agent tracks sessions with unique IDs. When it reconnects, it knows which past conversation is relevant and can pick up where you left off.

### 💻 CLI for Programmatic Use
Store, search, and manage memories without leaving your terminal:
```bash
npm run memory -- add "Decision: Use PostgreSQL for state persistence"
npm run memory -- search "database architecture"
npm run memory -- list --project myapp --limit 10
```

### 🏥 Observability & Self-Tuning
Monitor your memory system's health:
```bash
npm run health
# Shows: cache hit rate, review queue size, staleness, recommendations
```

The system identifies its own bottlenecks and suggests fixes before they become problems.

---

## Quick Start

```bash
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build
npm test    # Verify installation (should see 15 clusters, 191 memories)
```

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** — How the system is organized (memory tiers, retrieval logic, performance)
- **[Multi-Agent](docs/MULTI_AGENT.md)** — Setting up shared/private memory and agent collaboration
- **[Curation](docs/CURATION.md)** — How memories are promoted, archived, and maintained
- **[Testing](docs/TESTING.md)** — Verifying your setup works correctly

## GitHub

https://github.com/ragesaq/clawtext
