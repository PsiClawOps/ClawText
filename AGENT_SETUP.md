# ClawText Agent-Assisted Setup

This guide is for **agents installing and configuring ClawText** in an OpenClaw workspace. The agent talks you through it, handles the mechanics, and explains what you might want to know.

---

## Phase 1: Install (Automatic)

Agent runs:

```bash
# Install via OpenClaw plugin system
openclaw plugins install @openclaw/clawtext

# Verify installation
openclaw plugins list | grep clawtext
```

**Agent reports to user:**
> "ClawText is now installed and registered as an OpenClaw plugin. You can check the installation with `openclaw plugins list`. Ready to configure."

**What happened automatically:**
- ✅ Downloaded from npm
- ✅ Extracted to `~/.openclaw/extensions/clawtext/`
- ✅ Dependencies installed
- ✅ Registered in plugin config
- ✅ Ready to enable

---

## Phase 2: Configure Plugin (Agent-Assisted)

Agent edits `~/.openclaw/openclaw.json` and asks key questions:

### Step 2a: Configure Memory Behavior

The plugin is already registered. Agent asks about tuning:

**Agent asks user:**

> "ClawText automatically injects the most relevant memories into your prompts. I can configure three things:
>
> 1. **How many memories per query?** (default: 5, range: 1-10)
> 2. **How strict on relevance?** (default: 0.70, range: 0.50-0.85, higher = stricter)
> 3. **Max injection tokens?** (default: 2000, range: 1000-8000)
>
> These defaults work for most workflows. Do you want to keep them, or customize?"

**If keep defaults:**
- Agent adds minimal config:
```json
"plugins": {
  "entries": {
    "clawtext": {
      "enabled": true,
      "memorySearch": {
        "sync": { "onSessionStart": true },
        "maxMemories": 5,
        "minConfidence": 0.70
      },
      "clusters": {
        "rebuildInterval": "0 2 * * *",
        "validationThreshold": 0.70
      }
    }
  }
}
```

- Agent reports: "✅ Using defaults. RAG will inject 5 memories with 0.70 confidence threshold."

**If customize:**
- Agent asks each question individually and fills in values
- Agent reports back what was set and why it matters

### Step 2b: Gateway Restart

---

## Phase 3: Gateway Restart (Agent-Assisted)

Agent tells user:

> "Now I need to restart the OpenClaw gateway to load ClawText. This will take ~5-10 seconds."

Agent runs:

```bash
openclaw gateway restart
```

Waits for success, then reports:

> "✅ Gateway restarted. ClawText is now active."

---

## Phase 4: Validate Installation (Agent-Assisted)

Agent validates the installation:

```bash
# Check plugin loaded
openclaw plugins list | grep clawtext

# Check gateway status
openclaw gateway status

# Validate memory system health
openclaw plugins run clawtext validate-rag
```

**Agent reports findings to user:**

If all pass:
> "✅ All systems green. ClawText is installed and working:
> - Plugin loaded and enabled
> - RAG injection ready
> - Memory extraction active
> - Operational learning pipeline ready"

If any fail:
> "⚠️ One or more checks failed. Here's what I found: [details]. Let me fix this..."
> [Agent troubleshoots or asks user for help]

---

## Phase 5: Onboarding Conversation (Agent-Assisted)

Agent talks through next steps with user:

### Question 1: Cluster Rebuild Strategy

> "ClawText clusters update automatically every night at 2am UTC. When you add a lot of new knowledge (docs, repos, Discord history), we can rebuild sooner.
>
> Would you like me to:
> - **Option A:** Let the nightly rebuild handle it (most common)
> - **Option B:** Set up a weekly rebuild on [day] at [time] for heavy ingestion workloads
> - **Option C:** Set up manual on-demand rebuild (you tell me when)"

**Agent documents user's choice** in a local setup notes file.

### Question 2: What Knowledge Should We Ingest?

> "ClawText can pull knowledge from:
> - GitHub repos (your projects, dependencies)
> - Discord channels (chat history, decisions)
> - Markdown docs (READMEs, guides, specifications)
> - JSON exports (structured data)
>
> Do you have any of these you'd like me to ingest to bootstrap the system? If so, I can handle it now or you can point me to them anytime."

**If user provides sources:**
- Agent runs ingest and validates deduplication
- Agent reports: "✅ Imported [N] memories from [source]. No duplicates detected."

**If user defers:**
- Agent notes this for later: "Ingestion is available on request. Just point me to your sources."

### Question 3: What Should We Remember?

> "ClawText will automatically capture your decisions, errors, and system patterns. But you can also tell me what's important:
>
> - Key decisions for this project
> - Known gotchas or gotchas you've hit before
> - Patterns you want the system to remember
>
> Should I set any of these up now, or start fresh?"

**If user provides:**
- Agent adds them to `memory/YYYY-MM-DD.md` and validates
- Agent reports: "✅ Added [N] items to memory. These will be available in future queries."

**If user defers:**
- Agent notes: "Captured. We can add these anytime."

---

## Phase 6: Document Setup (Agent-Assisted)

Agent creates a local setup summary file `memory/clawtext-setup.md`:

```markdown
# ClawText Setup Summary

**Installed:** [date/time]  
**Version:** v1.4.0  
**Configuration:** [defaults/custom]

## RAG Settings
- Max memories: [N]
- Confidence threshold: [0.XX]
- Token budget: [YYYY]

## Cluster Rebuild Strategy
- Schedule: [nightly/weekly/manual]
- Next rebuild: [date]

## Ingested Sources
- [source 1]: [N] memories
- [source 2]: [N] memories

## Initial Knowledge Added
- [item 1]
- [item 2]

## Notes
- [any custom configuration or gotchas]

---

**Setup by:** Agent  
**User confirmed:** Yes
```

Agent reports:
> "✅ Setup complete and documented in `memory/clawtext-setup.md`. You can reference this anytime."

---

## Phase 7: Next Steps (Agent-Assisted)

Agent explains what happens next:

> **What's happening automatically now:**
> - Messages are captured to memory (~1ms overhead)
> - Memories are extracted and clustered (every 20 minutes + nightly validation)
> - Relevant memories are injected into your prompts automatically (~1ms latency)
> - System failures are captured and available for review
>
> **What you might want to do:**
> - Ingest knowledge sources (docs, Discord, repos) — just ask me
> - Review operational learning patterns — I'll surface them when they show up
> - Tune RAG settings if injection feels too broad or too narrow
> - Archive old memories when they're no longer useful
>
> **How to ask for help:**
> - "Inject [topic]" — I'll pull in knowledge about that topic
> - "Show me what you remember about [thing]" — memory search
> - "Rebuild clusters" — force a fresh cluster build
> - "Archive old memories" — move stale stuff to offline storage
>
> Questions?"

---

## Setup Completion Checklist

Agent confirms with user:

- [ ] ClawText installed via `openclaw plugins install @openclaw/clawtext`
- [ ] Plugin registered in `openclaw.json`
- [ ] RAG injection tuning configured (memory count, confidence, tokens)
- [ ] Gateway restarted
- [ ] All validation tests passed
- [ ] Cluster rebuild strategy discussed
- [ ] Initial knowledge ingested (if any)
- [ ] Setup documented in `memory/clawtext-setup.md`
- [ ] User understands next steps

---

## Troubleshooting During Setup

**If plugin fails to install:**
- Agent verifies `@openclaw/clawtext` is available on npm: `npm view @openclaw/clawtext`
- Agent checks network connectivity
- Agent tries again with `openclaw plugins install @openclaw/clawtext --force`

**If plugin fails to load:**
- Agent checks `openclaw plugins list` output
- Agent checks `~/.openclaw/openclaw.json` for syntax errors
- Agent restarts gateway: `openclaw gateway restart`

**If RAG injection test fails:**
- Agent checks plugin enabled in config
- Agent checks configuration syntax
- Agent restarts gateway
- Agent runs validation again

**If user wants to change settings later:**
- Agent explains how to edit `openclaw.json` entries.clawtext config
- Agent runs validation after changes
- Agent restarts gateway
- No need to reinstall

---

## Agent Responsibilities After Setup

Once setup is complete, the agent should:

1. **Respond naturally to memory requests** — "Show me what you remember about X"
2. **Offer ingestion proactively** — If user mentions docs/repos, offer to ingest
3. **Surface operational learning** — When patterns emerge, point them out
4. **Maintain configuration** — Tune RAG settings if injection feels off
5. **Handle archival** — Move old memories when user indicates they're stale

---

**Last Updated:** 2026-03-12  
**Status:** Agent-assisted setup flow  
**Scope:** From git clone to operational system in one flow
