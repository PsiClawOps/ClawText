# DECISION_LOG.md

_Key decisions and rationale._

## 2026-03-10: ClawText v1.4.0 Rollout Complete

**Final state:** ClawText v1.4.0 is published and ready for use.

**What was published:**
- **GitHub:** `https://github.com/ragesaq/clawtext` - README, three-lane architecture, bundled ingest, operational learning lane
- **Git tag:** `v1.4.0` - formal release with comprehensive changelog
- **ClawHub:** Updated to v1.4.0 with new features, keywords (operational-learning, self-healing), expanded categories and documentation links
- **Archived:** `clawtext-ingest` repo updated with redirect to ClawText 1.4.0

**Commits in this release:**
1. `1ba7b1e` - Bundle ingest, operational learning lane, README rewrite, version 1.4.0
2. `992cb61` - Refactor README: tighten prose, add LLM primer, clarify MEMORY.md relationship
3. `aa6d8b9` - Add concrete Caesar/Alesia example to context diagram
4. `a4ac6ef` - Clarify "no external services" distinction
5. `06b9cab` - Reframe as "Key Advantages" instead of tech stack
6. `c797019` - Simplify Key Advantages, remove symbol clutter
7. `ce31728` - Clean up and finalize Key Advantages section
8. `725bea9` - Restore 1.4 feature rows to comparison table
9. `39a4f2f` - Built With → Key Advantages reframing
10. `99fe495` - Update clawhub.json to v1.4.0

**Rollout checklist:**
- ✅ Code complete (phases 7A-7D implemented and verified)
- ✅ Documentation complete (README, SKILL.md, AGENT_INSTALL.md, OPERATIONAL_LEARNING.md)
- ✅ README review and refinement completed
- ✅ GitHub pushed with refined README
- ✅ clawhub.json updated to 1.4.0
- ✅ Git tag v1.4.0 created
- ✅ clawtext-ingest archived with redirect

**What comes next:**
- ClawHub publish (manual step)
- User review and feedback
- Optional: ClawText v1.4.0 production review scheduled for 2026-03-16

---



**Problem:** OpenClaw responses taking 10-30 minutes in some cases; Discord listener timeouts.

**Root cause:** Context overflow cascades. Sessions balloons to 80-82k tokens (exceeds GPT-4o 64k limit), compaction fails 3x, timeouts pile up.

**Decision:** Lower `reserveTokensFloor` from 25000 → 15000 (force earlier compaction). Disable `memorySearch.sync.onSessionStart` (disable automatic RAG injection, causing context bloat).

**Rationale:** 25k floor was too high — sessions grew unchecked. Memory injection on every session start added needless overhead and context waste.

**Expected outcome:** Faster responses, fewer context overflow errors. RAG still available on-demand.

**Monitoring:** Watch for response time improvements over next 24-48h. If compaction becomes too aggressive (breaking coherence), we'll dial it back.

---

## 2026-03-05: Thinking Mode Strategy

**Decision:** Keep global `thinkingDefault: "medium"`. Use per-session `/think:adaptive` directives for Sonnet 4.6/Opus 4.6 deep work.

**Rationale:** OpenClaw doesn't support per-model config overrides yet (GitHub #20612). `adaptive` is recommended for Claude 4.6+.

---

## 2026-03-03: Plugin Allowlist

**Decision:** Set `plugins.allow: ["discord", "memory-core"]`.

**Rationale:** Explicit allowlisting. Filter plugin reports to suppress disabled non-allowlisted noise.
