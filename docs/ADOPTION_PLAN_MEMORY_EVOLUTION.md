# ClawText Memory Evolution Adoption Plan

Date: 2026-03-12
Status: Active

## Goal
Adopt high-value memory-system insights (inspired by external systems like Hindsight) **without interfering** with current ClawText workstreams (ClawDash coordination, core memory operation, and existing pillars).

## Non-Interference Rules (Hard Constraints)

1. **Feature-flag everything new**
   - Default state: OFF
   - No behavior change to current production memory path until explicitly enabled.

2. **No breaking schema changes**
   - Existing memory file format and cluster build must continue to work unchanged.

3. **Additive-first implementation**
   - New logic is layered in parallel, not replacing core retrieval/storage immediately.

4. **Explicit impact notes**
   - Every enhancement must include a short "impact on other pillars" note.

5. **Rollback path required**
   - Each enhancement needs a one-step disable/revert path.

---

## Workstreams to adopt

### A) Conflict Consolidation (Temporal Evolution)

**What:** Handle contradictory facts as state transitions ("used to" -> "now") instead of naive overwrite.

**Why:** Preserves history and reduces false memory churn.

**Implementation style:**
- New optional consolidation pass after retain/extract
- Keep original observations + tracked transitions
- Do not alter current core write path unless flag enabled

**Flag:** `memory.consolidation.enabled` (default false)

**Expected impact:**
- Better historical coherence
- Lower contradiction noise
- No effect on ClawDash unless enabled

---

### B) Stronger Scope Isolation

**What:** Improve boundaries by project/user/channel/security scope where appropriate.

**Why:** Prevents cross-context contamination and leakage.

**Implementation style:**
- Add strict-scope filtering option in retrieval/consolidation paths
- Keep current retrieval behavior as default

**Flag:** `memory.scope.strict.enabled` (default false)

**Expected impact:**
- Safer retrieval in mixed contexts
- No default behavior drift

---

### C) Durable vs Ephemeral Classifier

**What:** Add explicit distinction for what should be promoted vs treated as transient context.

**Why:** Keeps memory high-signal; avoids pollution from ephemeral state.

**Implementation style:**
- Add classifier hook in promotion pipeline
- Emit confidence + reason tags
- Manual override supported

**Flag:** `memory.durability.classifier.enabled` (default false)

**Expected impact:**
- Cleaner long-term memory
- Lower curation burden

---

### D) Retrieval Fusion + Optional Rerank

**What:** Introduce optional fused retrieval (BM25 + semantic + structured links), with optional reranking.

**Why:** Better recall quality on hard queries.

**Implementation style:**
- Add a secondary retrieval path behind flag
- Continue existing retrieval path by default

**Flag:** `memory.retrieval.fusion.enabled` (default false)

**Expected impact:**
- Better query precision when enabled
- No production disruption by default

---

### E) Evaluation Harness

**What:** Repeatable memory quality benchmark for regression and improvement tracking.

**Why:** Move memory changes from opinion-driven to metric-driven.

**Implementation style:**
- Fixed eval dataset + scoring scripts
- Compare baseline vs flagged variants

**Expected impact:**
- Quantified quality changes
- Faster safe iteration

---

## Breadcrumb Strategy (Required)

To ensure changes are discoverable by agents and operators over time, each change emits breadcrumbs in three places:

1. **Design breadcrumb (docs)**
   - Update `docs/ADOPTION_LOG_MEMORY_EVOLUTION.md`
   - Include what changed, why, flag status, and impact note.

2. **Operational breadcrumb (memory runtime)**
   - Append JSONL event in runtime memory path:
   - `memory/operational/change-breadcrumbs.jsonl`
   - Fields: `ts`, `changeId`, `feature`, `flag`, `status`, `impact`, `rollback`, `references`
   - Helper command:

```bash
npm run breadcrumb:log -- \
  --changeId ME-001 \
  --feature "Conflict consolidation" \
  --status merged \
  --flag memory.consolidation.enabled \
  --rollback "Set memory.consolidation.enabled=false"
```

3. **Retrieval breadcrumb (human-readable)**
   - Add a short markdown note with frontmatter in daily memory if the change affects agent behavior.

This gives both machine-friendly and human-friendly discoverability.

---

## Impact map requirement

Each merged change must answer:
- Impact on ClawDash? (yes/no + reason)
- Impact on ClawTask? (yes/no + reason)
- Impact on continuity transfer? (yes/no + reason)
- Impact on current memory recall latency? (estimate)
- Rollback steps (exact)

No impact map = no merge.

---

## Execution order (safe)

1. Evaluation harness (baseline first)
2. Durability classifier (low risk)
3. Scope isolation (low-medium risk)
4. Conflict consolidation (medium risk)
5. Retrieval fusion/rerank (medium-high risk)

---

## Success criteria

- No default behavior regressions in production path
- All new capabilities remain optional until validated
- Breadcrumb trail allows any future agent to discover what changed and why
- Measurable quality improvements on eval harness before default enablement

---

## Out of scope for this plan

- ClawDash UI implementation details
- Product marketing copy
- Any forced migration of existing memory schemas

This plan is strictly memory-engine evolution with low operational risk.