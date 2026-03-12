# ClawBridge

**Continuity + transfer for active work.**

ClawBridge preserves working context when conversations move across:
- threads
- forum posts
- channels
- sessions
- agents

It is designed to prevent context-loss drift in long architecture/project discussions.

---

## Design philosophy (implemented)

1. **Automatic where it makes sense**
   - CLI auto-reads source thread messages
   - auto-generates all core artifacts (short/full/bootstrap)
   - auto-creates destination forum post
   - auto-posts continuity artifacts into destination thread

2. **Agent-led where manual is needed**
   - optional explicit overrides (`--objective`, `--established`, `--open`, `--next`)
   - lane/product framing can be supplied manually
   - operator decides whether to promote into long-term memory

3. **Easily installable**
   - packaged as a skill with `package.json`, `clawhub.json`, and CLI bin entry

4. **Fully documented**
   - START_HERE, QUICKSTART, INTEGRATION, SKILL, templates, examples

---

## Ecosystem role

- **ClawText** = memory + learning
- **ClawBridge** = continuity + transfer
- **ClawDash** = dashboard / control surface
- **ClawTask** = board / coordination layer

ClawBridge is distinct from long-term memory. Continuity packets can be promoted to memory optionally.

---

## Install

### Local development install

```bash
cd ~/.openclaw/workspace/skills/clawbridge
npm install
npm link
```

Now `clawbridge` is available in shell.

### Run without linking

```bash
node ~/.openclaw/workspace/skills/clawbridge/bin/clawbridge.js help
```

---

## Quick usage

```bash
clawbridge extract-discord-thread \
  --source-thread 1480315446694641664 \
  --target-forum 1475021817168134144 \
  --title "ClawBridge Extract — Test" \
  --mode dual \
  --ingest
```

This command will:
- read source thread messages
- generate 3 artifacts
- create a new forum thread
- post short + full + bootstrap artifacts
- optionally ingest full continuity packet into ClawText

---

## Output artifacts

By default, ClawBridge writes:
- `docs/handoffs/CLAWBRIDGE_SHORT_<timestamp>.md`
- `docs/handoffs/CLAWBRIDGE_FULL_<timestamp>.md`
- `docs/bootstrap/NEXT_AGENT_BOOTSTRAP_CLAWBRIDGE_<timestamp>.md`

Templates used:
- `templates/short-handoff-summary.md`
- `templates/full-continuity-packet.md`
- `templates/next-agent-bootstrap.md`

---

## Documentation map

- `START_HERE.md` — best entry point by role/use case
- `QUICKSTART.md` — copy/paste commands
- `INTEGRATION.md` — architecture, modes, options, and extension patterns
- `SKILL.md` — skill behavior and quality bar
- `examples/README.md` — example scenarios

---

## Current status

**Phase 1 complete:**
- standardized structured continuity workflow
- packaging + CLI + templates + docs
- tested end-to-end against real Discord forum transfer

**Not yet (future phase):**
- tight auto-integration with thread-bridge functions
- richer policy for automatic memory promotion
- advanced lane-aware routing/orchestration
