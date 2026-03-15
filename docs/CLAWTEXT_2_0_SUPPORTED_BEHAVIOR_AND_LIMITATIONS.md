# ClawText 2.0 Supported Behavior & Known Limitations

**Status:** Internal release-readiness note  
**Purpose:** Record the supported behavior we are comfortable claiming for ClawText 2.0, especially around context creation and delivery, and list the limitations that remain acceptable for the release.

---

## Release-critical conclusion

ClawText 2.0 is in a good state to claim:
- reliable rich context creation
- reliable document/file artifact output
- operational learning that is working in practice
- bounded continuity/bridge behavior
- Discord delivery support for supported destination paths

The remaining limitations are now narrow enough to document rather than treat as open-ended blockers.

---

## Supported behavior

### 1. Rich context artifact creation

ClawText can generate structured context artifacts suitable for handoff, continuity, and recovery workflows.

Supported artifacts include:
- short handoff
- full continuity packet
- next-agent bootstrap packet
- backup/source snapshot
- machine-readable manifest/summary metadata

These are the main payload classes needed for moving rich context across surfaces.

---

### 2. Document / file output

ClawText reliably writes context artifacts to files, including:
- `docs/handoffs/...`
- `docs/bootstrap/...`
- `memory/bridge/backups/...`

This means document/file-oriented context export is a supported 2.0 capability.

---

### 3. Working memory cycle

The core memory cycle is functioning and release-usable:
- plugin loads correctly
- hooks are active
- cron jobs are present and runnable
- extraction state uses canonical state-root paths
- extraction writes to daily memory
- cluster rebuild works
- RAG validation works
- retrieval/injection works in runtime

---

### 4. Operational learning lane

The operational lane is functioning and can be treated as a real product pillar in 2.0.

Supported operational behavior includes:
- capture of repeated failures and successful workflows
- recurrence aggregation
- candidate review flow
- promotion flow
- retrieval visibility for both reviewed and promoted patterns
- migrated legacy operational corpus visible from canonical state root

---

### 5. Bounded continuity / bridge behavior

ClawText continuity tooling now behaves safely and predictably.

Supported safety behavior includes:
- estimate-first preflight
- chunk budget calculation
- blocking oversized live runs unless explicitly overridden
- summary-first output instead of dumping huge artifact bodies by default
- backup manifest creation
- source snapshot creation
- explicit failure behavior instead of silent fallback

This is a supported 2.0 claim.

---

### 6. Discord delivery: supported paths

Discord is a supported delivery surface for 2.0 in the following cases:

#### Supported
- create a new destination thread/post in a target forum
- recreate context into a new Discord destination thread
- append to an existing **valid writable/readable thread**
- estimate-first safety checks before Discord posting
- bounded failure when a destination is invalid or unsafe

#### Verified in current release validation
- create-new-thread continuity run succeeded
- attach to a freshly created valid destination thread succeeded
- direct read/send to that valid thread succeeded with:
  - raw thread id
  - `channel:<id>` form

This is enough to treat Discord context delivery as supported in 2.0.

---

## Known limitations acceptable in 2.0

### 1. Existing-thread attach requires a valid current destination thread

Not every historical or user-supplied Discord thread id is guaranteed to be writable/readable in the execution layer.

Observed behavior:
- some existing thread ids return `Unknown Channel`
- stale/non-resolvable/invalid targets fail early
- valid current threads work correctly

### What this means
ClawText 2.0 should claim:
- append to an existing **valid** destination thread works

ClawText 2.0 should **not** claim:
- arbitrary old Discord thread ids will always be attachable

This is treated as an execution-layer limitation, not a ClawText-core design failure.

---

### 2. Discord transport semantics are not fully owned by ClawText

ClawText should not be considered the authority on:
- Discord target resolution rules
- forum registry semantics
- permission probing
- destination execution semantics

Those belong to the dedicated ops/execution layer.

ClawText's responsibility is:
- context creation
- continuity packaging
- safe bounded delivery behavior
- learning from the outcomes

---

### 3. Relationship tracking remains lightweight

`relationships.yaml` support is useful and real, but still lightweight compared with a deeply integrated graph retrieval system.

This is acceptable for 2.0 as long as we do not overclaim it.

---

### 4. Retrieval quality can continue improving

Operational retrieval is functional and useful, but ranking quality may still be tuned over time.

This is not a release blocker so long as:
- reviewed/promoted patterns remain visible
- high-value operational guidance remains retrievable

---

## Practical 2.0 claim boundary

### Safe claim
ClawText 2.0 can:
- create rich, useful context bundles
- export them reliably to files/documents
- preserve backups and manifests
- support safe/bounded Discord context delivery
- append into an existing valid Discord thread
- learn operationally from repeated workflow outcomes

### Overclaim to avoid
ClawText 2.0 should not claim:
- perfect arbitrary Discord thread attach behavior
- ownership of Discord/forum execution semantics
- fully graph-native relationship retrieval

---

## Decision rule for operators

If a context-moving workflow needs maximum reliability:
- prefer create/recreate flows into a fresh destination thread
- use preflight/estimate-first behavior
- keep backup and manifest output enabled

If appending to an existing thread:
- use a current known-valid destination thread
- expect early failure if the execution layer cannot resolve it

---

## Short summary

**ClawText 2.0 is ready to claim rich context creation and safe bounded context delivery.**

The remaining Discord-related limitation is narrow:
- valid existing-thread attach works
- invalid/stale/non-resolvable thread ids fail visibly

That is acceptable as a documented 2.0 limitation rather than a release blocker.
