# Phase <N> — <theme>

> **Phase review required.** Complete the [entry review](../REVIEW.md#entry-review-do-before-starting-a-phase) before starting and the [exit review](../REVIEW.md#exit-review-do-before-declaring-a-phase-complete) before declaring this phase done. The exit review is gated/resumable/iterative — `/phase-builder <N>` creates `phase-<N>-{entry,exit,tasks,operator-steps}.md` per [`REVIEW.md`](../REVIEW.md#per-phase-review-gates).

**Estimated: ~<1–2 weeks>**

## Scope

<What this phase is about, in a paragraph or two. The *one themed capability* it delivers. Name its dependencies — which earlier phases must be done first — and what later phases depend on it. Be concrete about what is IN scope and, where useful, what is explicitly OUT (deferred to a later phase or the backlog). A phase should map to a single coherent PR; if the scope here reads like two unrelated capabilities, split it into two phases.>

## Deliverables

> The concrete things this phase builds. Each should advance at least one north star (the entry review's scope check verifies this). Keep them at the "what", not the "how" — the build plan (chunks/waves) is derived at entry, not written here.

- **<deliverable>** — <one line>
- **<deliverable>** — <one line>
- **<deliverable>** — <one line>

## Verification (AI-run where possible — tenet *AI-first validation*)

> The scenarios that prove the phase works, written as **AI-run harnesses**, not operator to-do lists. These become the exit review's gate G1. Each must be drivable end-to-end through the real surface to **terminal success** — see the "what validated must mean" rules in [`REVIEW.md`](../REVIEW.md#ai-first-validation--operator-as-final-uat). For any operator capability, include the scenario that exercises its **entry path from a fresh state** (the *Operator-reachable end-to-end path* check). Mark the few irreducibly-human gestures explicitly.

- <scenario — exercised through the real entry point, to terminal success>
- <scenario>
- <scenario>

## Exit criteria

> The contract for "phase complete." Each bullet must be verifiably met (or waived/deferred with a reason) at the exit review (gate G2). Sharpen anything vague at the entry review.

- <criterion>
- <criterion>
- Docs synced; entry + exit reviews written.

## Tenets advanced

> Which north stars / design tenets this phase moves forward, **by name**. Used by the entry review's scope check.

*<tenet name>* · *<tenet name>* · *<tenet name>*.
