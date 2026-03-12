# ClawText Clean Repo Migration Report

Date: 2026-03-12
Status: staging complete (non-destructive)

## Goal
Create a clean canonical repo root for ClawText outside the polluted mixed-workspace git root.

## New canonical path
- `/home/lumadmin/.openclaw/workspace/repos/clawtext`

## Source path audited
- `/home/lumadmin/.openclaw/workspace/skills/clawtext`

## Included in clean staging repo

### Core package/runtime
- `package.json`, `package-lock.json`
- `openclaw.plugin.json`
- `plugin.js`, `index.ts`, `cli.mjs`, `install.js`, `tsconfig.json`
- `src/`
- `dist/`
- `bin/`
- `scripts/`
- `schemas/`
- `hooks/`

### Documentation and packaging
- `README.md`, `SKILL.md`
- `docs/`
- `clawhub.json`, `.clawhubignore`
- `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `RISK.md`, `TROUBLESHOOTING.md`
- `AGENT_INSTALL.md`, `AGENT_ONBOARDING.md`
- `CLAWTEXT_*` docs
- `CLAWHUB_PUBLICATION_READY.md`

### Bundled continuity companion
- `skills/clawbridge/`

## Explicitly excluded from clean staging repo

### Workspace / personal / non-product files
- `AGENTS.md`, `CURRENT_WORK.md`, `DECISION_LOG.md`, `HEARTBEAT.md`, `HOW_THINGS_WORK.md`
- `IDENTITY.md`, `MEMORY.md`, `SOUL.md`, `TOOLS.md`, `USER.md`
- `.openclaw/workspace-state.json`, `.tmp`
- `memory/`, `memory-backup-*`

### Unrelated projects / artifacts / binaries
- image batches and generated art (`batman_*`, `generated-images/`, assorted pngs)
- unrelated project trees (`moltmud`, `rgcs`, `projects`, `orcaslicer_research`, `wbtrv32`)
- search/tool experiments (`hybrid-search`, `cognee`, `exa-tool`)
- archived extensions not needed in core repo
- logs and exported thread dumps

## Notes
- This migration has not modified the original repo root.
- This migration has not rewritten remote git history.
- This migration has not changed the live skill path yet.

## Next likely steps
1. initialize/verify clean git state in the new canonical repo root
2. compare package behavior from new root
3. decide whether to:
   - swap `skills/clawtext` to point at `repos/clawtext`
   - rewrite the existing GitHub repo to this clean tree
   - or publish a new clean remote and retire the old one later

## Decision still required later
How to handle remote history / GitHub canonical source:
- preserve polluted history and clean only current tree
- force-rewrite existing remote history
- create a new clean remote and migrate consumers
