# Session Intelligence Rollout Prep

_Last updated: 2026-03-30_

This is the operational rollout prep for moving ClawText Session Intelligence (SI) from a shadow-fed, spec-heavy state to a guarded canary rollout focused on reducing compaction without creating a new outage source.

## Executive call

**Position:** Session Intelligence is **not fully live** as the production context engine. It is partially live in support paths, but the production cutover is still gated.

**Bottom line:**
- Some continuity and compaction-supporting pieces are live now.
- The SI engine itself is built and shadow-fed.
- The main production behavior change still requires explicit cutover and restart.
- **`legacy` remains the gating limiter today.**

---

## 1) Current-state delta

## Live now

### Session durability / recovery support
- `clawtext-checkpoint` is live and writing structured journal checkpoints on reset/new and every 25 messages.
- `clawtext-restore` is live and injects recent journal context on bootstrap when recovery conditions match.
- `clawtext-ingest` tail capture is live and writes a compaction marker so restore can inject:
  - a compaction notice
  - the last 5 raw messages before compaction
- `clawtext-prune` is live as an emergency pre-compaction pruning hook and telemetry writer.

### Session Intelligence shadow path
- `clawtext-si-shadow` is built and deployed.
- It passively feeds message traffic into the SI SQLite path while **legacy remains the active context engine**.
- This is warming the DB path and reducing cold-start risk for future cutover.

### Engine implementation exists
- `src/session-intelligence/*` exists and includes:
  - bootstrap
  - ingest / ingestBatch
  - assemble
  - compact
  - recall helpers (`search`, `describe`, `expand`)
  - pressure signals
  - proactive passes (`runNoiseSweep`, `runToolDecay`)
  - payload externalization and slot/resource association

## Built / designed, but not fully activated in prod

### SI as the active context engine
- The engine is registered as `clawtext-session-intelligence`.
- Production is **not** yet switched from `plugins.slots.contextEngine: "legacy"` to SI.
- Until that switch happens and the process restarts, SI is not assembling the production prompt.

### Proactive compaction reduction by SI
- SI contains pressure evaluation, proactive passes, and compaction orchestration.
- Those code paths are meaningful only when SI owns the active context-engine lifecycle.
- Right now they are not the primary live protection layer in production prompt assembly.

### Checkpoint / restore hardening
- Checkpoint and restore exist and are materially useful now.
- However, explicit corruption-recovery semantics, resume guarantees, and canary validation criteria are not yet fully hardened or documented as production-ready contracts.

## Restart-gated / cutover-gated

The following require explicit visibility and restart/cutover before they can be called live prod behavior:
- SI prompt assembly replacing legacy assembly
- SI-owned compaction behavior becoming the primary compaction-control path
- SI recall tools becoming the canonical live session-history recovery path during normal agent operation
- Validation that system-prompt layering is correct after cutover

---

## 2) Explicit call on `legacy`

**Yes — `legacy` is still the gating limiter.**

Reason:
- Shadow ingest warms the DB only.
- It does **not** replace production assembly while `legacy` remains configured.
- As long as `legacy` owns prompt assembly, the smartest parts of SI stay operationally constrained.

Operational implication:
- We should describe the current state as **pre-cutover operational readiness**, not full rollout.
- Design maturity does not count as production activation.

---

## 3) Guarded Walk 1 / Walk 2 rollout plan

The rollout should happen in two controlled walks.

## Walk 1 — warm-path validation, no production assembly switch

### Objective
Prove the shadow-fed SI state is warm, accurate, and safe enough to canary.

### Actions
1. **Validate per-session DB existence and freshness**
   - Confirm the target canary agent has an SI DB on disk.
   - Confirm new inbound/outbound messages are actually landing.
   - Do not trust hook success alone; verify rows and timestamps.

2. **Validate ACA kernel bootstrap**
   - Confirm `identity_kernel` exists for the target session in SI state slots.
   - Confirm overlay slots are present where expected.

3. **Validate session content quality**
   - Sample a recent session and verify:
     - decisions are classified correctly
     - tool outputs decay candidates look sane
     - active/problem/anchor content is retained
     - noise/resolved content is not over-retained

4. **Validate recall safety**
   - Confirm `search`, `describe`, and `expand` work against the warmed DB.
   - Confirm payload refs recover correctly for externalized content.

5. **Validate prompt-layering risk**
   - Explicitly test for double system prompt behavior.
   - Compare legacy output vs SI-assembled output on the same recent canary session.

### Exit criteria for Walk 1
- Warm DB exists for canary target.
- New messages are flowing into it.
- ACA kernel slot is present.
- No obvious classification failure on a recent sample.
- No double-system-prompt issue in controlled validation.
- Confidence is high enough to perform one restart-backed canary cutover.

## Walk 2 — single-agent canary cutover

### Objective
Switch exactly one agent from `legacy` to `clawtext-session-intelligence`, restart once, and measure runtime behavior.

### Actions
1. Change only the canary target to use the SI context engine.
2. Restart with explicit visibility.
3. Run a focused observation window under real traffic.
4. Measure compaction, resume quality, summary quality, and restore behavior.
5. Hold the rest of fleet on legacy until the canary is clearly stable.

### Abort / rollback conditions
Rollback immediately if any of the following show up:
- missing or degraded system prompt behavior
- obvious context loss vs legacy baseline
- repeated bad summarization
- restore injection regressions
- runaway compaction or emergency compaction spikes
- broken recall / payload expansion on canary session history

### Exit criteria for Walk 2
- Canary remains stable through real traffic.
- Compaction behavior is same-or-better than legacy baseline.
- Resume quality is acceptable.
- No prompt-layering regression.
- Operators can explain failures and recover cleanly.

Only then widen.

---

## 4) Activation prerequisites

These are the hard prerequisites before cutover.

### Required before canary
- Warm SI DB verified for target canary session(s)
- `identity_kernel` and overlay slots verified
- Double-system-prompt check completed
- Workspace resolution verified for the canary agent
- DB content quality spot-checked against recent real traffic
- Restart window available with operator visibility
- Rollback path defined in advance

### Recommended before canary
- Small script or checklist for per-session DB verification
- Basic before/after measurement worksheet
- One known-good test conversation for side-by-side assembly comparison

---

## 5) Known blockers

## Top blocker
**Warm DB validation + prompt-layering validation are still the gate.**

More specifically:
1. The shadow hook being enabled is not enough; per-session DB state must be verified.
2. `legacy` still owns production assembly.
3. The double-system-prompt risk has to be ruled out before canary cutover.
4. Some checkpoint/restore behavior is operationally useful but still not documented as a hardened recovery contract.

---

## 6) Measurement plan

The canary needs a short, explicit measurement loop.

## A. Compaction rate
Measure:
- number of compactions per session/day
- compaction frequency per 100 turns
- emergency compaction triggers
- whether proactive passes reduce compaction frequency before hard compaction fires

Success signal:
- same or lower compaction rate than legacy baseline, with no quality regression

## B. Resume quality
Measure:
- whether the agent resumes the active problem correctly after restart/new session
- whether recovered context matches the recent thread state
- whether operator has to restate prior decisions manually

Success signal:
- fewer “I lost context” failures
- no obvious hallucinated continuity

## C. Summary quality
Measure:
- factual accuracy of summaries after compaction
- whether decisions and constraints survive compaction
- whether summaries stay useful instead of generic

Success signal:
- summaries preserve decisions, active problem, and current constraints well enough that work continues without restating them

## D. Restore behavior
Measure:
- bootstrap restore injects when it should
- bootstrap restore stays quiet when it should
- compaction notice and tail injection appear correctly after compaction
- no stale restore context leaks into unrelated sessions

Success signal:
- correct recovery when needed, minimal false-positive injection

---

## 7) First canary recommendation

**Recommended first canary agent: Pylon**

### Why Pylon first
- high enough session complexity to stress the system meaningfully
- infrastructure-owned, so validation and rollback stay close to the operator
- active enough to produce useful signal quickly
- narrower blast radius than cutting over Forge first
- easier to observe compaction, restore, and prompt-layer behavior with direct ownership

### Why not Forge first
- higher coordination cost
- greater organizational blast radius if prompt assembly degrades
- more risk while prompt-layering concerns are still open

If a lower-stakes canary is preferred, use a non-council but still high-traffic operator-facing agent with recoverable workflow and good observability. But **do not** start with Forge.

---

## 8) Recommended next move

1. Verify one real Pylon session DB is warm and correct.
2. Run the double-system-prompt check on that same canary path.
3. Switch exactly one agent to `clawtext-session-intelligence`.
4. Restart once with visibility.
5. Measure for one observation window.
6. Only widen if runtime behavior matches design.

That is the correct operational posture:
- no victory language off specs
- one canary
- one controlled cutover
- one measurement loop
- then widen
