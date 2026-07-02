# Tenets — the principle front door

> **This is a starter file. Edit it to fit your project.** The *framework* (the three-file principle system, how the layers resolve, the citation rule, the review cadence) is the reusable part and should stay. The content you write here — your **product tenets**, the invariants unique to what you're building — is yours.

The principles that shape every decision in this repo. **Read all three files before starting a phase; re-read after.**

## The principle system

Three files, two layers:

| File | Layer | What it holds |
|---|---|---|
| [`NORTH_STARS.md`](NORTH_STARS.md) | **Priorities** (ordered) | What to optimize *for* — used to break ties. Lower-numbered wins a conflict. |
| **`TENETS.md`** (this file) | **Invariants** — product | What *your product* never violates without an explicit conversation. Unique to each project. |
| [`ENGINEERING_TENETS.md`](ENGINEERING_TENETS.md) | **Invariants** — engineering | The transferable build/operate disciplines. Ports between projects nearly verbatim. |

When something pulls in conflicting directions: **north stars choose the winner; tenets (either file) veto options.**

These files are the **source of truth** for the principles (*tenet: Single-source documentation*). Everywhere else — the README, entry/exit reviews, PR descriptions, code comments — carries at most a short, clearly-marked *index* that links back here, never a second copy. If an index ever diverges, fix the index to match.

## Cite by name, not number

Everywhere outside these files, reference a principle by its **name**, prefixed with its layer: *north star: Cost efficiency*, *tenet: Prefer battle-tested standards over bespoke*. The numbers are display order (and, for north stars, priority — lower wins); they are **not** stable identifiers and silently break if a list is reordered. Names are stable, so name-based references survive any reordering. A tenet is a tenet whichever file it lives in; the layer prefix matters when a name deliberately appears in both layers (e.g. *Local-first testability* is both a north star and the tenet that enforces it). Reviews (the G3 scorecard + G4 violations — [`REVIEW.md`](REVIEW.md)) **read all three files** — scoring stars from one file or checking violations from only one tenet file is a named failure mode.

---

## Product tenets (yours — write them)

> The invariants that encode *this* project's architecture, domain, and constraints. A good product tenet **names the invariant**, says **why** (ideally the incident or stake that motivates it), and is **checkable** — ideally by a mechanical gate (see [`REVIEW.md`](REVIEW.md)). Examples of the *shape* (don't copy verbatim):
>
> - **Multi-tenant from day one** — every persisted row carries a `tenant_id`; isolation is enforced at the data layer, not in app checks that can be forgotten. (Only if you're multi-tenant.)
> - **<Your users'> data is sacred** — the sensitive class of data in *your* domain (children's records, health data, financial history, private messages) is never logged, sent to third parties, or shown where it doesn't belong — by construction.
> - **A single identity/auth model** — e.g. "all external repo access goes through one app installation, never shared keys."
> - **A boundary rule** — e.g. "the engine never contains application-specific code; that lives in the project repo."
> - **A central design system** — every color/spacing/radius comes from one token source; no component hardcodes a literal. (Only if you ship a UI.)
> - **A house data-access rule** — e.g. "all DB access goes through the ORM; raw SQL only in migrations."
> - **Who does the sensitive thing** — e.g. "AI drafts; a human sends" for any surface your users would assume came from a person.

1. **<Your first product tenet.>** <The invariant, the why, and how it's checked.>
2. **<Your second.>** …

---

## Review cadence

Principles are worthless if nothing checks against them. The cadences (per-change mechanical gates + AI review; per-phase entry/exit with the `G1–G11` ledger) are defined once in [`REVIEW.md`](REVIEW.md) and driven by the [`phase-builder`](../.claude/skills/phase-builder/SKILL.md) skill. The per-phase review is a **required** gate — do not start or declare a phase complete without it.

## Editing the principle files

These are load-bearing. Don't change one without:

1. Naming a specific incident, retrospective finding, or learning that motivates the change.
2. Considering whether the change should be a phase deliverable instead (often it should).
3. Recording the rationale in the next phase's exit review or a retrospective.

A change that bypasses these steps is a re-review trigger for the whole phase.
