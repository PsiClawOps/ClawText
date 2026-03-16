---
doc: README_STOREFRONT_AUDIT
version: 0.1.0
status: draft
owner: ClawText project
last_updated: 2026-03-16
---

# ClawText README Storefront Audit (2026-03-16)

## Purpose
Audit the current `README.md` as a storefront page rather than as an internal product wiki.

## Overall result
**Result:** strategically strong, storefront-weak.

The README contains a lot of good product truth, but it currently behaves more like:
- a hybrid explainer/wiki
- an architecture tour
- an internal truth-management surface

than a tight storefront page.

## Main violations

### 1. The page opens with internal release semantics too early
Current issue:
- `Version Semantics` appears immediately after the title and hero.
- this front-loads release-arbitration detail before the reader understands the product.

Why this violates storefront rules:
- storefront pages should lead with problem, promise, and product identity
- internal release/packaging nuance belongs later or elsewhere

### 2. It over-explains structure before selling the product
Current issue:
- layered tables, lane tables, deep architecture sections, and long explanatory blocks appear too early
- the reader is asked to understand the system before they are sold on why they should care

Why this violates storefront rules:
- storefront should move from value → understanding → technical depth
- not from structure → theory → value

### 3. It reads too much like a wiki / long-form explainer
Current issue:
- many sections are individually good, but the page accumulates too much total explanation
- "How It Works: The Three Lanes in Depth" is useful, but too detailed for a storefront page in its current placement and length

Why this violates storefront rules:
- README is the store window, not the whole manual
- deep architecture belongs in linked docs

### 4. Internal lifecycle-control material leaked into the storefront
Current issue:
- `Lifecycle Canon` appears in the main README body
- supporting control docs are listed inline on the storefront page

Why this violates storefront rules:
- lifecycle control is internal operator truth, not user-facing pitch material
- it makes the page feel like an implementation control surface instead of a product landing page

### 5. The install/CTA path arrives too late
Current issue:
- installation starts around line 278 after the reader has already traversed a lot of architecture and theory

Why this violates storefront rules:
- a storefront page should let an interested user understand the value and then quickly see how to try it

### 6. Tone is too explanatory in places where it should be more declarative
Current issue:
- several sections explain carefully instead of landing strong product statements
- some copy reads like it is persuading internally rather than pitching externally

Why this violates storefront rules:
- storefront copy should feel clear, sharp, and intentional
- not like a teaching document trying to justify itself

### 7. Duplicate and noisy internal artifacts weaken polish
Current issue:
- duplicated entries in supporting control docs list
- internal categories and supporting artifacts are too visible in the page

Why this violates storefront rules:
- storefront needs visual discipline and confidence
- duplication or internal clutter lowers perceived product sharpness

### 8. The README is trying to do too many jobs at once
Current issue:
The current page is simultaneously trying to be:
- product pitch
- architecture overview
- lifecycle truth reference
- release semantics note
- getting-started doc
- workflow explainer

Why this violates storefront rules:
- one page can serve multiple jobs, but one job must dominate
- for README, the dominant job should be **storefront / landing page**

## What should remain
These are good and should survive in a better storefront form:
- the core problem: context fragmentation
- the product identity: layered memory and continuity system
- the core value outcomes
- the practical example showing resumed work with prior context
- a concise version of the three-layer model
- installation/getting-started path
- clear boundaries on what ClawText is / is not

## What should move out of the main storefront flow
These belong later on the page, behind links, or in dedicated docs:
- detailed version semantics discussion
- long architecture walkthroughs
- deep lane-by-lane mechanics
- lifecycle canon/control documentation
- internal release-hardening nuance
- internal support/boundary arbitration detail

## Recommended storefront shape
1. title + one-sentence product promise
2. problem
3. what ClawText is
4. what you get / why it matters
5. simple three-layer model
6. quick example
7. install / first run
8. who it is for / what it is not
9. links to deeper docs

## Rewrite goal
Rewrite the README as a **tight storefront page** that:
- sells the product first
- teaches only enough to create clarity and confidence
- defers depth to linked docs
- keeps internal truth-management and lifecycle doctrine out of the main landing narrative
