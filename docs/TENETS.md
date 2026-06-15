# Tenets

> **This is a starter file. Edit it to fit your project.** The *framework* (two layers, how they resolve, the citation rule, the review cadence) is the reusable part and should stay. The *specific* north stars and design tenets below are a curated, project-agnostic starting set — keep the ones that fit, reword them in your own voice, delete the ones that don't, and add the ones unique to your project. A few are marked **[load-bearing]** because the phase-builder process itself assumes them; don't drop those without reading the note.

The principles that shape every decision in this repo. **Read before starting a phase; re-read after.**

There are two layers:

- **North stars** — priorities, *ordered*. What to optimize *for*. Use them to break ties.
- **Design tenets** — invariants. What not to violate without an explicit conversation.

When something pulls in conflicting directions, **north stars choose the winner; design tenets veto options.** When two north stars conflict on a specific decision, the **lower-numbered one wins** (that is the entire point of ordering them).

This document is the **source of truth** for the principles (see the *Single-source documentation* tenet). Everywhere else — the README, entry/exit reviews, PR descriptions, code comments — carries at most a short, clearly-marked *index* that links back here, never a second copy. If an index ever diverges from this file, fix the index to match.

## Cite by name, not number

Everywhere outside this file, reference a north star or design tenet by its **name**, prefixed with its layer: *north star: Cost efficiency*, *tenet: Prefer battle-tested standards over bespoke*. The numbers here are display order (and, for north stars, priority — lower wins); they are **not** stable identifiers and silently break if the list is reordered. Names are stable, so name-based references survive any reordering. The layer prefix matters when a name appears in both layers on purpose (e.g. *Local-first testability* is both a north star and the design tenet that enforces it).

---

## North stars (priority order — edit freely)

> Ordered by priority: lower number wins when two conflict. Re-order, rewrite, cut, and add to match what your project actually optimizes for.

1. **Hands-off automation.** Once a unit of work is human-approved, execution runs to completion on its own and escalates only a genuine decision — the human is never the turn-by-turn babysitter of a running build. Design intent is captured *up front* (in refinement/planning) so that after a single approval the system runs itself.
2. **Cost efficiency.** Be deliberate about what work costs — compute, paid API/AI minutes, human time. Cheaper paths are preferred where they don't sacrifice a higher star; expensive paths are a visible, deliberate choice, never a silent default.
3. **Comprehensive testing.** Every change ships with the tests that prove it — and prefer tests that cross a *real* boundary over mocks that only prove the mock.
4. **Modularity & extensibility.** New capabilities plug in as small, single-purpose units; reuse over duplication. Adding a thing shouldn't mean editing the core.
5. **Iteration as first-class.** Every cycle produces a reviewable record of what worked and what didn't; recurring patterns become permanent improvements (a gate, a skill, a runbook entry).
6. **CI/CD maturity from day one.** Automated checks and a repeatable path to "shipped" exist from the first commit, not bolted on later.
7. **Self-validation.** The system validates every change itself — to green — *before* a human is asked to look. [load-bearing: the exit-review gates assume this]
8. **Visible operations.** The current and historical state of the system is observable without spelunking — logs, runs, status, all surfaced.
9. **Local-first testability.** Everything is exercisable end-to-end on a laptop before it deploys. Deploy-only gates ship a local bypass that can't be enabled in production. [load-bearing: the exit review's local-first validation]
10. **Reproducible operations.** The deployed system is rebuildable from scratch from committed code plus a short, *documented* set of human gestures and out-of-band secrets — nothing tribal.

When two stars conflict, the lower-numbered one wins. Example (with the ordering above): a feature that would buy more automation by skipping a test trades a #1 win for a #3 loss — and since these are *priorities not vetoes*, you weigh them; but if "ships with tests" is also a design tenet, the tenet vetoes the option regardless.

---

## Design tenets (invariants — edit freely)

> Invariants: things you don't violate without an explicit, recorded conversation. The ones marked **[load-bearing]** are assumed by the phase-builder process — keep them (or keep an equivalent) or the orchestration loses its footing.

1. **Review against the tenets at every cadence.** [load-bearing] Per-change (mechanical CI + a review pass), per-feature (a retrospective), and per-phase (entry + exit reviews). Reviewing only at PR time is too late — architectural mistakes are locked in long before then. See *Review cadence* below and [`REVIEW.md`](REVIEW.md).
2. **Phase work is a living task ledger.** [load-bearing] Every phase's work is an explicit, *additively-maintained* task list (`docs/phase-reviews/phase-<n>-tasks.md`): when execution forces a task to change, split, appear, or be cut, the ledger is updated in place (cut tasks marked *cut* with a reason, not deleted) so it stays a correct map of what was actually done. This is the resumability backbone of `/phase-builder`.
3. **AI-first validation.** [load-bearing] Prefer validation the system performs itself over manual human steps. If a check *can* be automated, it is — and its result is reported. A step stays manual only when it genuinely needs a human (an external sign-in, an approval gesture, a hardware key); those are called out explicitly with justification.
4. **The agent validates first; the human does final acceptance.** [load-bearing] The system runs every check it can to green — including driving the real UI / real integrations — and when something fails it *diagnoses, fixes, and captures a follow-up task* autonomously, reporting afterward. The human is the **final acceptance pass on an already-green build**, never an in-loop debugger.
5. **Single-source documentation.** [load-bearing] Every fact lives in exactly one canonical place; everywhere else *links* to it. A summary that must exist for context-loading reasons is a clearly-marked, non-canonical *pointer*, never a parallel definition that can drift. This is why the doc tree is intentional and creating a new doc is a deliberate decision.
6. **Local-first testability.** [load-bearing] The invariant behind the north star of the same name. A single command brings the whole stack up locally; every capability is exercised on the laptop before any deploy. Deploy-only gates ship a bypass that is *impossible to enable in production* (gated by an env/compile flag), never deleted. **Validate locally first — deploy is the final confirm, never the verification loop.**
7. **Reproducible operations.** The invariant behind the north star of the same name. No undocumented manual state: anything a human did by hand to make the system work is either scripted or written into the operator runbook. The test: *could you lose the host and stand up an equivalent from only the repo, the runbook, and the out-of-band secrets?*
8. **No plaintext secrets in version control.** Secrets live only encrypted (e.g. SOPS-encrypted env files), decrypted at deploy. Plaintext credentials, private keys, and scratch `*.dec`/`*.unencrypted` files are gitignored and never committed; a mechanical gate blocks any change that introduces an unencrypted credential.
9. **Reusability + small surface area.** When the same logic appears in more than one place, extract it. Modules, functions, and components stay narrow — one concern each, sized so a reader can hold the whole file in their head. Avoid sprawling optional-flag APIs; split instead of growing a god-function. *Counter-pressure:* don't pre-abstract on the first occurrence — duplication is cheaper than the wrong abstraction. Extract on the second or third hit, when the shape is clear.
10. **Prefer battle-tested standards over bespoke.** When a well-documented, widely-used, actively-maintained tool solves the problem, adopt it before writing your own — even at the cost of a dependency. Bespoke is justified only when no standard tool fits. The payoff is docs, communities, and security patches you don't have to maintain.
11. **Wrap third-party deps when a swap is realistic.** Three-condition test: a realistic chance you'd swap it *and* a portable API shape *and* a small wrapper. Wrap when all three hold; use directly otherwise. (The swap dimension of *Reusability + small surface area*.)
12. **Observable from day one.** The operator's window into the system exists from the start, not deferred. Live state and history are visible without SSHing the host. As that surface grows from a dashboard into a working cockpit, hold it to real UX/accessibility standards — "easier to ship it rough" is never a reason to leave friction in.
13. **Error reporting + correlation, everywhere.** Every layer reports errors through one standard pipeline, and a single correlation id propagates across layers and into logs so a failure is traceable end-to-end. Errors are severity-routed: client errors recorded-but-not-escalated; server errors and failed jobs notify the operator. Built on standards, not a bespoke error store.
14. **Privacy-safe logging.** Logging covers any structured signal useful for debugging — leveled, correlation- and context-tagged — but **PII/sensitive data is never written to logs, traces, or error sinks, by construction**. Log identifiers, status, timings, metadata; never raw request/response bodies or user-record contents. Redaction is enforced at the logger (a field allowlist) and again before any external send; a mechanical gate flags risky call sites.
15. **Work is a re-orderable portfolio.** Planned work lives as first-class, *rank-ordered* data — a roadmap (what's planned, in priority order) over a backlog (surfaced-but-unscheduled work). Re-prioritizing is cheap and local (move one rank / re-attribute one parent), not a cascade of renumbering. Work surfaced *during* a build is never lost to prose — it becomes a backlog row. This repo's own exit-review → backlog round-trip ([`BACKLOG.md`](BACKLOG.md)) is the reference implementation.

> ### Add your project-specific tenets here
>
> The set above is deliberately generic. Most projects need a handful of their own — the invariants that encode *this* project's architecture and constraints. Examples of the *shape* (don't copy verbatim; these are illustrative of what a project-specific tenet looks like):
>
> - **Multi-tenant from day one** — every persisted row carries a `tenant_id`; isolation is enforced at the data layer. (Only if you're multi-tenant.)
> - **A single identity/auth model** — e.g. "all external repo access goes through one app installation, never shared keys."
> - **A boundary rule** — e.g. "the engine never contains application-specific code; that lives in the project repo."
> - **A central design system** — every color/spacing/radius comes from one token source; no component hardcodes a literal. (Only if you ship a UI.)
> - **A house data-access rule** — e.g. "all DB access goes through the ORM; raw SQL only in migrations."
>
> A good project-specific tenet names the invariant, says *why* (ideally an incident that motivated it), and is checkable — ideally by a mechanical gate (see [`REVIEW.md`](REVIEW.md)).

---

## Review cadence

Reviewing only at PR time is not enough — architectural decisions are locked in long before then. Review against these tenets at multiple cadences:

| Cadence | Mechanism | Owner | Output |
|---|---|---|---|
| **Per-change (PR)** | Mechanical CI gates + an AI review pass | Automated | Status check, PR comments |
| **Per-feature** | A retrospective with a scorecard (1–5 per applicable north star, with evidence) | Automated / you | A retrospective record |
| **Per-phase** | Entry review + exit review against this doc | You (the operator) + the agent | `docs/phase-reviews/phase-<n>-{entry,exit}.md` |

Full checklists in [`REVIEW.md`](REVIEW.md). The per-phase review is a **required** gate — do not start or declare a phase complete without it.

## Editing this doc

These are load-bearing. Don't change one without:

1. Naming a specific incident, retrospective finding, or learning that motivates the change.
2. Considering whether the change should be a phase deliverable instead (often it should).
3. Recording the rationale in the next phase's exit review or a retrospective.

A change that bypasses these steps is a re-review trigger for the whole phase.
