# Review system — building against the tenets

Every change is reviewed against the principles in [`TENETS.md`](TENETS.md) (north stars + design tenets) at several cadences, each with a different cost/depth tradeoff. The cheap checks run constantly; the deep ones gate each phase.

| Layer | Mechanism | Cost | Catches |
|---|---|---|---|
| **Mechanical CI gates** | Static checks in CI on every change | Free, fast | Missing tests, missing invariants, contract drift, forbidden patterns |
| **AI review pass** | A reviewer agent runs on the diff (correctness · security · principles) | One pass per change | Subtler bugs, security gaps, design-tenet violations |
| **Retrospective scorecard** | Rate each finished feature 1–5 per applicable north star, with evidence | One pass per feature | Long-arc patterns single PRs don't show |
| **Per-phase entry + exit review** | A gated, resumable review against this doc | Per phase | Architectural mistakes — *before* they're locked in |

## Mechanical CI gates

Cheap to implement, hard to game. Run on every commit; failure blocks merge. **The concrete list for your project lives in [`PROJECT.md`](PROJECT.md#mechanical-gates)** — this section is the rationale.

Each gate maps to a tenet and checks a static signal. The point is to make the invariants in [`TENETS.md`](TENETS.md) *mechanically true* rather than reviewer-dependent: a rule a human has to remember is a rule that eventually slips. Good gates are the form a design tenet takes once it's been violated once.

Common starters (adapt in `PROJECT.md`):

- **Tests exist for new code** — *Comprehensive testing*.
- **No plaintext secrets committed** — *No plaintext secrets in VCS*.
- **Contract in sync with code** — *Versioned contract* (only if you have a public contract/spec).
- **Risky-call-site / PII scan** — *Privacy-safe logging*.
- **Project-specific invariants** — e.g. a new persistence layer without the required isolation column; a forbidden import across a module boundary.

> **Lint is part of the gate sweep.** Whatever your aggregate "gates" command does, make sure `lint` runs alongside it before a PR opens — a formatting slip that only `lint` catches will otherwise reach CI at PR-open instead of being caught locally. See [`PROJECT.md`](PROJECT.md#commands).

## Per-phase review gates

Each phase has **two required gates**: one before, one after. Reviewing only at PR time is not enough — the architectural decisions for a phase are locked in long before the first PR lands.

`/phase-builder <n>` executes both gates through three background workflows (`phase-entry`, `phase-wave`, `phase-exit`) that fan out to specialized doer subagents and return compact verdicts the orchestrator records here. The gate *semantics* below are independent of that execution model — see the `phase-builder` skill for the orchestration + crash-recovery detail.

### AI-first validation & operator as final UAT

The operator is the **final acceptance pass, not an in-loop debugger.** The system validates *itself* end-to-end first — and only when that whole chain is green does it hand off to the operator. This is the operational shape of the *Self-validation* north star and the *AI-first validation* / *agent validates first* tenets; it exists because the alternative (operator and agent debugging together, turn by turn) is exactly the friction those tenets forbid.

Before the operator is asked to look at anything:

1. **The agent runs the full verification suite — LOCAL-FIRST, including the UI, then the deployed target as the final confirm.** The whole stack boots locally with one command (see [`PROJECT.md`](PROJECT.md#commands)); per-iteration validation happens there. Deploying just to verify is the anti-pattern this forbids — the round-trip is slow and re-burns work each iteration; the deployed target is the *last* step, not the loop. UI-touching work is not "validated" until a browser (or the real surface) has actually exercised it. End-to-end specs must run against a **booted local stack before the PR** — "deferred to CI" is not a substitute, because locator/path/origin bugs surface *only* when specs run against a real stack.
2. **Failures are diagnosed, fixed, and captured by the agent — not bounced to the operator.** When the agent finds a broken scenario it owns the loop: diagnose the root cause, fix it, re-run to green, and **capture a task** for any durable follow-up (a `(FB-n)` ledger line if it's this-phase work; a [`BACKLOG.md`](BACKLOG.md) row if it's future-phase). It reports *what it did* afterward; it does not narrate every step and wait.
3. **`⛔ operator-gated` shrinks to the irreducibly human.** A scenario is blocked only when it *genuinely* needs a human the agent cannot stand in for — a hardware key enrollment, an external install/approval click under the operator's own account, a real-payment step. "It's easier to ask the operator" is **not** a reason to mark a scenario blocked — that's the tenet violation this section exists to prevent.
4. **Only then: the operator's acceptance pass (gate G9).** Once G1 is green-or-honestly-blocked, the operator gets a curated handoff — "here's what I validated end-to-end; here's the short list that needs your eyes" — and does real acceptance testing. Their notes become `(FB-n)` tasks the agent builds.

This does **not** weaken any gate. It changes *who validates and in what order*: the agent first and exhaustively, the operator last and for acceptance.

**What "validated" must mean — three hard rules.** A scenario is *not* green until the real end-to-end path ran to **terminal success** with the **user-visible outcome confirmed**:

- **Terminal success, not side-effects.** An async/long-running capability is green only when its run reaches a terminal **success** state *and* the user-visible result is actually present. A run left running/blocked/failed is a FAIL — even if a side artifact exists. Never infer success from "a file was written," "the process exited 0," or "the route returned 200".
- **Real path, not a mock.** A mocked test proves wiring and is necessary, but it cannot prove the real integration path (real credentials, real external calls, real completion signals). The keystone validation is green only after the **real** path completes end-to-end on the **deployed/real target**.
- **The deploy smoke is not the validation.** "Deployed + services up + routes respond" is a precondition, not the gate. After deploying you must drive at least one real end-to-end run of the phase's headline capability through the operator's own entry point, to terminal success, before any validation gate is ✅.

### Entry review (do before starting a phase)

Block the start of a phase on this. ~30 minutes; saved at `docs/phase-reviews/phase-<n>-entry.md`. (Done by phase-builder Stage 1.)

- **Re-read [`TENETS.md`](TENETS.md).** Note any tenet this phase risks bending, and why.
- **Scope check.** Read the phase doc end-to-end. Anything that doesn't move at least one north star forward? Cut it or justify it in writing.
- **Open questions.** Resolve every blocking open question (from the phase doc or [`PLAN.md`](PLAN.md)) before starting.
- **Risk register.** Skim the architecture risks. Any risk materially worse than when written? Add new ones if so.
- **Previous-phase exit findings.** Did the prior phase's exit review surface anything that should adjust this phase's scope? Update the phase doc before starting.
- **Pull the backlog ([`BACKLOG.md`](BACKLOG.md)).** Every `accepted` row whose **Phase** is this phase becomes a `[ ]` line in this phase's task ledger (carry its `B-NNN` id + severity); move those rows to the *Pulled* section in the same commit. See [The backlog round-trip](#the-backlog-round-trip).
- **Definition of done.** Re-read the phase's "Exit criteria." Sharpen anything vague — the bullets are the contract for "phase complete."
- **Open the exit-review skeleton.** Create `docs/phase-reviews/phase-<n>-exit.md` as a DRAFT now — gate ledger (G1–G11) all ⬜, *Validation* table seeded from the phase doc's Verification scenarios. It's the single resumable home for gate state across the whole phase.
- **Local-testability check.** For every deploy-only gate this phase introduces (auth/email verification, webhook signatures, paid-API calls, external sandboxes), confirm there's a local bypass that's off-in-production. If a deliverable can only be verified in production, redesign it or write down the named carve-out before starting.
- **Data ownership → schema + UI (any phase introducing entities or surfaces).** Before planning any table or route, ask for each new entity/surface: **who owns it?** That one answer drives two things that must agree — the **schema** (an owned entity carries its owner's FK) and the **UI placement** (a top-level entity earns a top-level route; a child belongs *under its parent*, never as a global tab unless its job is genuinely cross-cutting). State each entity's owner explicitly and let it set the ledger's `files:` globs from the start.
- **Operator-reachable end-to-end path (any phase delivering a capability).** Name the **entry path** — the route *and* the action a human takes — to exercise the capability end-to-end from a *fresh* state with nothing hand-seeded. The *start* affordance (the "create / trigger / begin" button) is **part of the deliverable**, not an afterthought: a loop you can only enter by seeding a row or hitting an API is an incomplete phase. Make that entry path an explicit G1 verification scenario.

### Exit review (do before declaring a phase complete)

Block declaring the phase complete on this. Written at `docs/phase-reviews/phase-<n>-exit.md` (template in the phase-builder skill's `references/review-templates.md`). The exit review is **gated, resumable, and iterative**: created as a DRAFT skeleton at entry and filled through the phase. Its *Exit gate ledger* (G1–G11) is the durable state from day one — a crash or token-out resumes at the first non-passed gate — and it may take several passes as operator feedback turns into tasks and rebuilds, each logged in *Review iterations*.

**G11 (PR opened + closeout staged in the PR) is the terminal ledger gate — there is no "PR merged" checkbox.** The operator's merge of the PR completes the phase and the merge commit is the record (a post-merge edit on a protected default branch would force a wasteful second closeout PR). **Validation scenarios are exit gates (G1), not task-ledger tasks**; the only thing operator feedback adds to the ledger is `(FB-n)` lines.

The eleven gates:

| #   | Gate | What it certifies |
|-----|------|-------------------|
| G1  | **Validation scenarios run + pass** | Every Verification scenario from the phase doc ran to terminal success (or is honestly blocked on a named human gesture). Driven through the real surface, not a mock or a seed-around. |
| G2  | **Exit-criteria audit** | Every bullet in the phase doc's "Exit criteria" is verifiably met (or waived/deferred with a reason). |
| G3  | **Tenet scorecard** | 1–5 per applicable north star with concrete evidence. Anything ≤2 becomes a tracked backlog row. |
| G4  | **Design-tenet violations** | None, or every one resolved. Each is blocking; a partial-incomplete is tracked → backlog. |
| G5  | **Dogfood / real-use proof** | The capability was actually used on a real target to terminal success. "Nothing material" is itself a finding. |
| G6  | **Local-testability proof** | Every gate shipped this phase was exercised locally before deploy via its bypass. |
| G7  | **Surprises captured + docs synced** | What was learned that wasn't in the plan is written into the right doc; the doc tree reflects what was built. |
| G8  | **Recurring issues → mechanized or backlogged** | Patterns that bit repeatedly became a gate, a skill, or a runbook entry (or a backlog row to build one). |
| G9  | **Operator notes/feedback triaged + addressed** | The operator's final acceptance pass; every note triaged into a task, a backlog row, or a resolved note. |
| G10 | **Backlog reconciled (completeness gate)** | Every item this phase surfaced but didn't finish is a backlog row with a target phase. See below. |
| G11 | **PR opened (operator go-ahead) + closeout staged on the PR** | Terminal gate. The full CI-mirroring sweep is green on the *final* tip; the PR is open; the closeout commit is staged on the PR branch. |

State per gate: ⬜ pending · 🟦 in progress · ✅ pass · ⛔ blocked (name the dep) · ➖ waived (with reason). **Resume = the first gate not ✅/➖.**

### The backlog round-trip

The per-phase ledger holds the *current* phase's tasks and dies with the phase. Work aimed at a *future* phase (or no phase) needs a home that outlives any single phase — [`BACKLOG.md`](BACKLOG.md), the cross-phase registry.

| Direction | When | What happens |
|---|---|---|
| **Exit → backlog** | Exit review | The *Proposed backlog items* table is operator-approved and its rows appended to the backlog as `accepted`, each with a target **Phase**. |
| **Backlog → ledger** | Entry review | `/phase-builder <n>` pulls every `accepted` row whose **Phase** is `<n>` into that phase's task ledger and marks the rows `pulled`. |

This is the mechanism behind *every item the system does is a task somewhere* (the *Phase work is a living task ledger* and *Work is a re-orderable portfolio* tenets): future phases need not be broken into tasks yet — deferred work accumulates in the backlog tagged with its phase, and the phase's entry review converts it into ledger tasks the moment that phase starts.

#### Backlog completeness gate (exit)

A phase **cannot be declared complete** until every item surfaced by its exit review is logged in [`BACKLOG.md`](BACKLOG.md) with a target phase (or `N/A`). This is a hard exit gate (G10), enforced the same way as a fully-`[x]` task ledger: the merge-PR step is blocked on both. An item an exit review names but never lands in the backlog is the exact failure mode this gate prevents — work dropped because the next iteration didn't happen to pick it up.

### How the cadences fit together

| Cadence | Gate | Owner | Output |
|---|---|---|---|
| Per-PR | Mechanical CI + AI review | Automated | Status check; PR comments |
| Per-feature | Retrospective scorecard | Automated / you | A retrospective record |
| **Per-phase** | **Entry + exit review** (exit is gated/resumable/iterative) | **Agent** drives the gates + E2E validation; **operator** does final acceptance (G9) + merges the PR | `docs/phase-reviews/phase-<n>-{entry,exit,operator-steps}.md` |
| **Cross-phase** | **Backlog completeness gate** (exit pushes, entry pulls) | You (the operator) | [`docs/BACKLOG.md`](BACKLOG.md) |

The per-phase review is **required**, not optional. The phase doc's "Exit criteria" is the *what*; this review is the *did-we-actually*.
