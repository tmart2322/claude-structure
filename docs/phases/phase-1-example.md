# Phase 1 — Foundation (worked example)

> **This is an illustrative example, not a real phase.** It shows how a filled-in phase doc reads, using a generic "stand up the foundation" theme. Delete it (or replace it with your real `phase-1-*.md`) once you've written your own. The structure mirrors [`_TEMPLATE.md`](_TEMPLATE.md).
>
> **Phase review required.** Complete the [entry review](../REVIEW.md#entry-review-do-before-starting-a-phase) before starting and the [exit review](../REVIEW.md#exit-review-do-before-declaring-a-phase-complete) before declaring this phase done. `/phase-builder 1` creates `phase-1-{entry,exit,tasks,operator-steps}.md`.

**Estimated: ~1.5 weeks**

## Scope

The first themed milestone: a **deployable, observable skeleton** of the system that proves the core loop end-to-end on the simplest possible vertical slice. Everything later phases build on must exist here in a thin form — the data layer with its isolation model, one service that handles a request, a way to see what happened, and the local-first + CI scaffolding so every subsequent phase can be validated on a laptop and gated in CI.

**In scope:** the project skeleton, the data layer + first migration, one end-to-end request path, structured logging with a correlation id, the local "boot everything" command, and the first mechanical CI gates. **Out of scope (deferred):** the full feature set, auth beyond a local stub, and any multi-environment deploy (those are later phases / backlog rows). No dependency on a prior phase — this is the base.

## Deliverables

- **Project skeleton + `PROJECT.md` filled in** — the repo layout, the command table, and the hard invariants are real and accurate (the rest of the system reads them).
- **Data layer + first migration** — the persistence layer with the project's isolation invariant baked into the schema from the first table.
- **One end-to-end request/job path** — a single vertical slice from entry point → processing → persisted result, proving the wiring.
- **Structured logging + correlation id** — every log line carries a correlation id that propagates across the slice (tenet *Error reporting + correlation*).
- **Local-first boot command** — one command brings the whole stack up against local infra (tenet *Local-first testability*).
- **First mechanical CI gates** — tests-required, secret-scan, and the project's headline invariant gate, wired into CI.

## Verification (AI-run where possible — tenet *AI-first validation*)

- The local boot command brings the entire stack up from a clean checkout; the end-to-end slice runs to terminal success and the result is visible in the observability surface.
- A request through the real entry point produces a persisted result *and* a correlated log trail; a forced failure is reported through the error pipeline, not swallowed.
- The isolation invariant holds: a cross-boundary read is refused (driven against the real data layer, not mocked).
- Each new mechanical gate fails a planted violation and passes clean code (gate self-test).
- CI runs the full sweep green on the branch before the PR opens.

## Exit criteria

- The end-to-end slice runs to terminal success locally and on the deploy target (if this project deploys).
- Every new table carries the isolation invariant; the gate that enforces it is green and has a self-test.
- The local boot command is a one-liner and documented in `PROJECT.md`.
- The first CI gates run on every commit and block merge on failure.
- Docs synced; entry + exit reviews written.

## Tenets advanced

*Local-first testability* · *Observable from day one* · *Error reporting + correlation* · *Comprehensive testing* · *CI/CD maturity from day one*.
