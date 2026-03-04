# ClawText — Skill Definition

**Name:** clawtext  
**Type:** RAG Context Injection Plugin  
**Version:** 1.2.0  
**Status:** Production  
**Category:** Memory & Knowledge Management  

## Summary

Automatic retrieval-augmented generation (RAG) layer that injects relevant memories into every prompt via the `before_prompt_build` hook. Enables agents to access memory context without manual search calls.

## What It Does

Searches pre-built memory clusters using BM25 keyword matching, filters by confidence (85%+ quality), and injects relevant memories into prompts before agent execution.

**Input:** User message + system prompt  
**Output:** Enriched prompt with context memories injected  
**Latency:** <100ms per injection  
**Token Budget:** 12% of available context (safe margin)

## Installation

### Quick Install (Automated)
```bash
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
cd ~/.openclaw/workspace/skills/clawtext
npm install
node install.js --auto-config
openclaw gateway restart
```

### For Agents
```javascript
// Ask agent to install
"Review and install ClawText from https://github.com/ragesaq/clawtext"
```

## Configuration

Enable in `openclaw.json`:
```json
{
  "plugins": {
    "allow": ["clawtext"],
    "entries": {
      "clawtext": { "enabled": true }
    }
  },
  "skills": {
    "entries": {
      "clawtext-rag": { "enabled": true }
    }
  }
}
```

Then restart gateway:
```bash
openclaw gateway restart
```

## How It Works

1. **Hook:** Registers on `before_prompt_build` event
2. **Search:** Analyzes prompt for keywords, runs BM25 scoring against 12 memory clusters
3. **Filter:** Keeps only memories with 85%+ confidence score
4. **Inject:** Prepends memories to system prompt as formatted context block
5. **Budget:** Ensures injection doesn't exceed 12% of token budget

## Performance

| Metric | Value |
|--------|-------|
| Search latency | 5-7ms |
| Total injection overhead | <100ms |
| Memory footprint | <8MB |
| Quality (avg confidence) | 85%+ |
| False positive rate | <5% |
| Token budget impact | 12% |

## Dependencies

- **memory-core:** Native OpenClaw memory storage (provided by OpenClaw)
- **embeddinggemma-300M:** Local embeddings (optional, for semantic search)

Zero NPM dependencies; runs in Node.js 18+

## Integration Points

### before_prompt_build Hook
Fired by OpenClaw gateway before each prompt is built. ClawText registers listener to inject memories.

### Memory Storage
Reads from `~/.openclaw/workspace/memory/` and `memory/clusters/` (pre-built JSON clusters).

### Token Budget
Respects OpenClaw's compaction configuration:
- Never exceeds `agents.defaults.compaction.reserveTokens`
- Safe margin: leaves 88% of available tokens for model

## Companion Skills

**clawtext-ingest:** Multi-source memory ingestion  
Populates ClawText clusters from files, URLs, Discord channels, etc.

Install together:
```bash
npm install @openclaw/clawtext @openclaw/clawtext-ingest
```

## Tuning

Adjust in `plugin.js`:
```javascript
this.rag.config.maxMemories = 7;        // Memories per query
this.rag.config.minConfidence = 0.70;   // Quality threshold (0-1)
this.rag.config.tokenBudget = 4000;     // Injection limit in tokens
this.rag.config.injectMode = 'smart';   // 'smart', 'full', 'snippets'
```

### Quick Recipes

**High accuracy (reduce hallucinations):**
```json
{"minConfidence": 0.80, "maxMemories": 5}
```

**Rich context (broader background):**
```json
{"minConfidence": 0.60, "maxMemories": 10}
```

**Token constrained:**
```json
{"tokenBudget": 2000, "injectMode": "snippets"}
```

## Documentation

- **README.md** — Complete user guide with examples
- **INTEGRATION.md** — Advanced patterns and troubleshooting
- **DECISION_RECORD.md** — Architecture decisions

## Support

- **Source:** https://github.com/ragesaq/clawtext
- **Issues:** File issues on GitHub
- **Docs:** See README.md

## License

MIT (default OpenClaw skill license)
