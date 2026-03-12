# ME-004 — Memory Evolution Evaluation Harness

Date: 2026-03-12
Change ID: ME-004
Status: merged

## Objective
Add a repeatable benchmark harness to compare baseline ClawText behavior vs flagged memory-evolution features (ME-001/002/003) without changing default runtime behavior.

## Non-interference posture
- Evaluation-only addition
- No runtime behavior changes
- No schema migration
- Safe to run in parallel with other pillar work

## Implementation scope
- `scripts/eval-memory-evolution.mjs`
- `package.json` script: `eval:memory-evolution`

## What it measures
For multiple scenarios (`baseline`, `me001_only`, `me002_only`, `me003_only`, `all_flags`):

1. **RAG injection profile**
   - total injected memories
   - total tokens
   - average injected/tokens per query

2. **Operational retrieval profile**
   - pattern counts per task context
   - scope-isolation metadata visibility

3. **Promotion proposal sample**
   - confidence/rationale sampling for reviewed patterns (when available)

4. **Comparison vs baseline**
   - injected delta
   - token delta
   - percent changes

## Output
Writes timestamped report artifacts to:
- `docs/evals/ME-004_eval_<timestamp>.json`
- `docs/evals/ME-004_eval_<timestamp>.md`

## Usage

```bash
npm run eval:memory-evolution
```

Optional custom output dir:

```bash
node scripts/eval-memory-evolution.mjs --out ./docs/evals
```

## Impact map
- ClawDash impact: none
- ClawTask impact: none
- Continuity transfer impact: none
- Runtime latency impact: none (offline eval script)

## Rollback
- Remove `scripts/eval-memory-evolution.mjs`
- Remove `eval:memory-evolution` script entry from `package.json`

## Why this matters
This adds a concrete measurement loop so future memory changes can be evaluated before defaults are changed, reducing regressions and keeping evolution evidence-based.