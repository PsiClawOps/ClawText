# ClawText

**Version:** 1.2.0 | **Status:** Production — Active

**Context-Layer Augmentation with Text** — Automatic retrieval-augmented generation (RAG) for OpenClaw. Searches your memory clusters and injects relevant context into every prompt before your agent sees it.

---

## What It Does

Every time you send a prompt, ClawText:

1. Extracts keywords from your message
2. Runs BM25 search across your indexed memory clusters
3. Filters results to high-confidence matches (≥70%)
4. Injects relevant context into the prompt before your model receives it

You don't do anything. It just works.

---

## How the Full System Works

ClawText is one piece of a three-part pipeline:

```
 Discord / Files / Web
         │
         ▼
 ┌──────────────────┐
 │ clawtext-ingest  │  Fetches messages, filters text-only,
 │ (ingest-all.mjs) │  deduplicates via SHA1, writes cluster
 └────────┬─────────┘  .md files to ~/memory/clusters/
          │
          ▼
 ┌──────────────────┐
 │ build-clusters.js│  Reads all .md files, splits into
 │ (cron: */30 min) │  ~600-char chunks, writes _index.json
 └────────┬─────────┘
          │
          ▼
 ┌──────────────────┐
 │  ClawText RAG    │  On every prompt: BM25 search over
 │ (before_prompt   │  _index.json → inject top matches
 │  _build hook)    │  → model receives enriched prompt
 └──────────────────┘
```

**Memory grows automatically:**
- Nightly cron pulls new Discord messages (deduped — only new content)
- 30-minute cron rebuilds the chunk index
- Every prompt gets fresh, relevant context injected

---

## Installation

### Prerequisites

- OpenClaw installed and running
- Node.js ≥ 18
- Git

### Install ClawText Extension

```bash
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/extensions/clawtext
cd ~/.openclaw/extensions/clawtext
npm install
npm run build
openclaw plugins enable clawtext
```

Verify hooks are active:

```bash
openclaw plugins list
# Should show: session_start, after_tool_call, before_prompt_build, session_end, before_compaction
```

### Install ClawText-Ingest

```bash
# Already bundled at:
~/.openclaw/workspace/skills/clawtext-ingest/
```

Or clone separately:

```bash
git clone https://github.com/ragesaq/clawtext-ingest.git \
  ~/.openclaw/workspace/skills/clawtext-ingest
cd ~/.openclaw/workspace/skills/clawtext-ingest
npm install
```

---

## Making Memory Automatic

This is the key configuration step. Two components need to be set up:

### 1. The Master Ingest Script

Copy or create `~/.openclaw/workspace/scripts/ingest-all.mjs`. This script:
- Fetches all threads from your Discord forums via the bot API
- Filters text-only (no attachments or embeds)
- Deduplicates every message via SHA1 hash
- Writes per-thread cluster `.md` files to `~/memory/clusters/`
- Triggers a cluster index rebuild

Configure your channels at the top of the script:

```javascript
const SOURCES = [
  { id: '1476018965284261908', type: 'forum', name: 'rgcs-dev' },
  { id: '1475021817168134144', type: 'forum', name: 'ai-projects' },
  { id: '1477543809905721365', type: 'forum', name: 'moltmud-projects' },
  { id: '1474997928056590339', type: 'channel', name: 'general' },
  { id: '1475019186563448852', type: 'channel', name: 'status' },
];
```

The script uses the bot token already stored by OpenClaw at:
`~/.openclaw/credentials/discord.token.json`

No separate token setup needed.

### 2. The Cluster Builder

`~/.openclaw/workspace/hooks/build-clusters.js` reads all `.md` files in `~/memory/clusters/`, splits them into ~600-character chunks, and writes `_index.json` — the file ClawText's RAG searches at query time.

### 3. Cron Jobs

Add both crons to keep memory fresh:

```bash
crontab -e
```

```cron
# Rebuild RAG index every 30 minutes
*/30 * * * * /usr/bin/node ~/.openclaw/workspace/hooks/build-clusters.js \
  >> ~/memory/.cluster-rebuild.log 2>&1

# Full Discord re-ingest nightly at 3 AM
0 3 * * * /usr/bin/node ~/.openclaw/workspace/scripts/ingest-all.mjs \
  >> ~/memory/.ingest-nightly.log 2>&1
```

After this setup, memory grows automatically from your Discord activity with no manual steps.

---

## File Layout

```
~/.openclaw/
├── extensions/
│   └── clawtext/                 ← ClawText RAG plugin
│       ├── src/index.ts          ← Hook registration + RAG logic
│       ├── src/rag.ts            ← BM25 search engine
│       ├── dist/                 ← Compiled output
│       └── package.json
│
└── workspace/
    ├── scripts/
    │   └── ingest-all.mjs        ← Master ingestion script
    ├── hooks/
    │   ├── build-clusters.js     ← Cluster index builder
    │   ├── clawtext-extract      ← Session extraction hook
    │   └── clawtext-flush        ← Session flush hook
    └── skills/
        └── clawtext-ingest/      ← Ingestion library

~/memory/
├── clusters/                     ← Per-thread markdown cluster files
│   ├── rgcs-<id>-<name>.md
│   ├── ai-projects-<id>-<name>.md
│   └── _index.json               ← RAG search index (auto-rebuilt)
├── .ingest_hashes.json           ← Deduplication hashes
├── .ingest-nightly.log           ← Nightly ingest log
└── .cluster-rebuild.log          ← Cluster rebuild log
```

---

## Current Index Status

As of March 5, 2026:

| Metric | Value |
|--------|-------|
| Cluster files | 59 |
| Indexed chunks | 5,879 |
| Forums covered | 5 (rgcs-dev, ai-projects, moltmud-projects, general, status) |
| Total threads | 56+ |
| Total messages | ~9,000+ |

---

## Configuration

Edit in `src/index.ts` or `openclaw.json` plugin config:

```json
{
  "maxMemories": 7,
  "minConfidence": 0.70,
  "tokenBudget": 4000,
  "injectMode": "smart"
}
```

| Option | Default | Effect |
|--------|---------|--------|
| `maxMemories` | 7 | Max chunks injected per prompt |
| `minConfidence` | 0.70 | Minimum BM25 relevance score (0–1) |
| `tokenBudget` | 4000 | Max tokens for injected context |
| `injectMode` | `smart` | `smart` = full text, `snippets` = truncated |

**For stricter results** (less noise): `minConfidence: 0.80, maxMemories: 5`  
**For broader context**: `minConfidence: 0.60, maxMemories: 10`  
**Token-constrained**: `tokenBudget: 2000, injectMode: "snippets"`

---

## How Context Gets Injected

When a prompt arrives, ClawText fires on the `before_prompt_build` hook:

```
User: "What's the current RGCS smoothing algorithm?"

→ ClawText extracts: ["RGCS", "smoothing", "algorithm"]
→ BM25 search over 5,879 chunks
→ Top 5 matches above 70% confidence selected
→ Injected as context block before prompt:

<!-- ClawText Context:
[rgcs-dev] **[2026-03-04] ragesaq:** The smoothing uses a weighted...
[rgcs-dev] **[2026-03-03] lumbot:** v1.2.324 introduced adaptive...
...
-->

User: "What's the current RGCS smoothing algorithm?"
```

Model receives both the context and the question. No manual lookup needed.

---

## Active Hooks

| Hook | Fires | Purpose |
|------|-------|---------|
| `session_start` | On session init | Load cluster index into memory |
| `before_prompt_build` | Every prompt | BM25 search + context injection |
| `after_tool_call` | After each tool | Buffer notable tool results |
| `session_end` | Session close | Flush session buffer |
| `before_compaction` | Pre-compaction | Persist session summary |

---

## Manual Ingest (One-Off)

To ingest immediately without waiting for the nightly cron:

```bash
node ~/.openclaw/workspace/scripts/ingest-all.mjs
```

To add a new channel to the pipeline, add it to the `SOURCES` array in `ingest-all.mjs` and run once manually. Subsequent nightly runs will pick up new messages automatically.

---

## Troubleshooting

**No context being injected:**
1. Check `~/memory/clusters/_index.json` exists and has content
2. Run `node ~/.openclaw/workspace/hooks/build-clusters.js` manually
3. Check `openclaw plugins list` shows clawtext hooks active

**Ingest not picking up new messages:**
1. Check `~/memory/.ingest-nightly.log` for errors
2. Verify bot token: `cat ~/.openclaw/credentials/discord.token.json`
3. Run `node ~/.openclaw/workspace/scripts/ingest-all.mjs` manually

**Clusters stale after ingest:**
1. Run `node ~/.openclaw/workspace/hooks/build-clusters.js`
2. Check the 30-min cron is installed: `crontab -l`

**Plugin not loading:**
```bash
openclaw plugins enable clawtext
openclaw gateway restart
```

---

## Related

- **[clawtext-ingest](../workspace/skills/clawtext-ingest/)** — Ingestion library and Discord fetcher
- **[ingest-all.mjs](../workspace/scripts/ingest-all.mjs)** — Master ingest script (run manually or via cron)
- **[build-clusters.js](../workspace/hooks/build-clusters.js)** — Cluster index builder

---

## License

MIT
