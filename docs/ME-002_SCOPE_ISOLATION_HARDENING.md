# ME-002 — Scope Isolation Hardening (Additive)

Date: 2026-03-12
Change ID: ME-002
Status: merged (flagged)

## Objective
Reduce cross-scope operational retrieval noise by introducing optional strict scope filtering for operational pattern retrieval.

## Non-interference posture
- Additive only
- Default OFF
- No schema migration
- No changes to current default retrieval path unless flag enabled

## Feature flag
- `CLAWTEXT_SCOPE_ISOLATION_ENABLED=true`
- Default: disabled

## Implementation scope
- `src/operational-retrieval.ts`
  - adds optional strict scope gate for retrieved reviewed patterns
  - adds task-type-based allowed scope map
  - exposes `scopeIsolationEnabled` and `allowedScopes` in retrieval result metadata

## Behavior (when enabled)
For operational retrieval:
- classify task type as usual
- derive allowed scopes from task type
- filter both query matches and high-recurrence reviewed patterns by allowed scopes

Default allowed-scope mapping:
- `tool-use` -> `tool, agent, global`
- `command-execution` -> `tool, agent, gateway, global`
- `config-change/deployment/gateway-work/plugin-work` -> `gateway, agent, tool, global`
- `debugging` -> `project, tool, agent, gateway, global`
- `normal-chat/unknown` -> `global`

## Impact map
- ClawDash impact: none (memory-internal retrieval behavior only, flagged)
- ClawTask impact: none
- Continuity transfer impact: none
- Recall latency impact: negligible (simple in-memory filter)

## Rollback
Immediate disable:
- unset flag or set `CLAWTEXT_SCOPE_ISOLATION_ENABLED=false`

Hard rollback:
- revert ME-002 changes in `src/operational-retrieval.ts`

## Why this order
ME-002 follows low-risk additive evolution after ME-001 and before heavier retrieval-fusion/consolidation defaults.