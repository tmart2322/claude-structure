# Phase review templates

Use these as the structure for `docs/phase-reviews/phase-<n>-{entry,exit,operator-steps}.md`. They map 1:1 to the checklists in `docs/REVIEW.md#per-phase-review-gates`. Adapt the wording, but cover every section — each corresponds to a checklist item the per-phase gate requires.

> **Cite tenets and north stars by name, not number.** Per `docs/TENETS.md` ("Cite by name, not number"), every reference in a review doc uses the tenet / north-star **name** with its layer prefix — *north star: Cost efficiency*, *tenet: Prefer battle-tested standards over bespoke* — never a number. Numbers are display order and silently break if the list is reordered; names are stable, so the historical review stays correct.

## Entry review template

```markdown
# Phase <N> entry review

**Phase:** <N> — <phase title>
**Date:** <YYYY-MM-DD>
**Phase doc:** [`docs/phases/phase-<n>-*.md`](../phases/phase-<n>-*.md)
**Operator steps:** [`phase-<n>-operator-steps.md`](phase-<n>-operator-steps.md)

## Tenets re-read

Notes from re-reading the three principle files (`docs/NORTH_STARS.md` + `docs/TENETS.md` + `docs/ENGINEERING_TENETS.md`):

- Tenets this phase is at material risk of bending — and what mitigates that risk.
- Tenets whose meaning has shifted since the prior phase.

## Scope check

For each deliverable in the phase doc, note which north star(s) or tenet(s) it advances (by name). If a deliverable doesn't map to any, justify it or cut it.

| Deliverable | North star(s) / tenet(s) advanced | Notes |
|---|---|---|

## Open questions

Open questions that block starting (from the phase doc or `docs/PLAN.md`). All must be resolved before the build starts.

| Question | Resolution | Source |
|---|---|---|

## Risk register delta

After re-skimming `docs/ARCHITECTURE.md` (risks): new risks introduced by this phase, or existing risks now materially worse.

| Risk | Severity | Mitigation |
|---|---|---|

## Carry-over from previous phase exit

Items explicitly punted from `docs/phase-reviews/phase-<n-1>-exit.md` that this phase must absorb. Update the phase doc if scope shifts.

## Sharpened definition of done

Take the phase doc's "Exit criteria" bullets and tighten anything vague. This list is the contract for the exit review.

- [ ] ...

## Build plan summary

High-level plan from the Plan subagent. Mark which chunks are independent (parallel-eligible) and which serialize behind shared types/migrations. State each new entity's **owner** (→ schema + UI placement) and each capability's **operator entry path**.

## Go / no-go

- **Go:** <signed off by operator>
- **No-go:** <what blocks>
```

## Exit review template

```markdown
# Phase <N> exit review

**Phase:** <N> — <phase title>
**Date:** <YYYY-MM-DD>
**Entry review:** [`phase-<n>-entry.md`](phase-<n>-entry.md)
**Operator steps:** [`phase-<n>-operator-steps.md`](phase-<n>-operator-steps.md)
**Status:** DRAFT — build in progress _(→ COMPLETE on merge; the closeout commit that lifts this marker is staged IN the PR, not a follow-up PR)_

> This review is **gated, resumable, and iterative**, created as a **DRAFT skeleton at entry** (gate ledger all ⬜, *Validation* table seeded from the phase doc) then filled through the phase. The *Exit gate ledger* is the durable, resumable home for gate + validation state — a crash or token-out resumes at the first non-✅ gate. Each pass appends to *Review iterations*. **Gates are not task-ledger tasks** — only operator feedback creates tasks.

## Exit gate ledger

State per gate: ⬜ pending · 🟦 in progress · ✅ pass · ⛔ blocked (name the operator/external dep) · ➖ waived (with reason). **Resume = the first gate not ✅/➖.** Every gate (G1–G11) must be ✅ or ➖ before the operator merges. **G11 is the terminal ledger row — there is no "PR merged" checkbox; the operator's merge of the PR completes the phase and the merge commit is the record.**

| #   | Gate | State | Note |
|-----|------|-------|------|
| G1  | Validation scenarios run + pass (see *Validation*) | ⬜ | |
| G2  | Exit-criteria audit complete | ⬜ | |
| G3  | Tenet scorecard done (≤ 2 → tracked) | ⬜ | |
| G4  | Design-tenet violations: none / resolved | ⬜ | |
| G5  | Dogfood / real-use proof captured | ⬜ | |
| G6  | Local-testability proof captured | ⬜ | |
| G7  | Surprises captured + docs synced | ⬜ | |
| G8  | Recurring issues → mechanized or backlogged | ⬜ | |
| G9  | Operator notes/feedback triaged + addressed | ⬜ | |
| G10 | Backlog reconciled (completeness gate) | ⬜ | |
| G11 | PR opened (operator go-ahead) + closeout staged on the PR | ⬜ | |

> **G11 is terminal; closeout is staged IN the PR, never a follow-up PR.** After the PR is open, the closeout commit — lift the DRAFT marker above, mark **G11 ✅** ("PR #M opened; closeout staged"), bump any status doc to its post-merge wording — is pushed onto the **same PR branch** so it lands when the operator merges. Do NOT add a "merged" ✅ or edit DRAFT / status *after* the merge (a protected default branch → that forces a second closeout PR).

## Validation

The phase doc's Verification scenarios live here as **gate G1** — exit items, not task-ledger tasks. State each ✅ pass · ⛔ blocked · ➖ waived (reason). Operator-gated scenarios name the unblocking step in [`phase-<n>-operator-steps.md`](phase-<n>-operator-steps.md).

| ID | Scenario | State | Evidence / blocker |
|---|---|---|---|

## Operator notes & feedback

What the operator flags as not-working — here or inline in operator-steps as `> FEEDBACK: ...`. **The acceptance pass happens at the pre-exit seam**, on the pre-acceptance validation handoff (scenario results + evidence pack), *before* the exit workflow runs. Each note is triaged on the next `/phase-builder <n>` run into a **current-phase task** (`(FB-n)` in the ledger, built *before* re-entering this review), a **backlog item**, or checked off as resolved. This is gate G9.

| FB | Note | Source | Triage → | Status |
|---|---|---|---|---|

## Review iterations

One entry per exit-review pass. Record the date, gate-state deltas, and any feedback turned into tasks/backlog.

- <YYYY-MM-DD> · pass 1 · <gates moved; what's still ⛔/⬜; feedback triaged>

## Exit criteria audit

For each bullet from the phase doc's "Exit criteria", state met / waived / deferred with evidence (file paths, PR links, screenshots).

| Criterion | Status | Evidence |
|---|---|---|

## Tenet scorecard

Score 1–5 per applicable north star with concrete evidence. Anything ≤2 becomes a tracked issue.

```yaml
north_star_scorecard:
  hands_off_automation:    { score: , evidence: "" }
  cost_efficiency:         { score: , evidence: "" }
  comprehensive_testing:   { score: , evidence: "" }
  # …one line per applicable north star, by name…
```

## Design tenet violations

Design tenets are invariants. List every violation, or "None". Each one is blocking.

- [ ] ...

## Dogfood / real-use proof

What did this phase's capability actually do on a real target? If nothing material — that is itself a finding.

## Surprises

What did we learn this phase that wasn't in the plan? Update the relevant doc and link the change here so the knowledge persists.

## Recurring issues → mechanizations

Patterns that bit repeatedly this phase. Each is a candidate to convert into a mechanical CI gate, a skill, or a runbook entry.

## Proposed backlog items

Every item this phase surfaced but didn't finish, as a table with a **Phase** column (target phase, or `N/A`). Operator-approved, then appended to [`BACKLOG.md`](../BACKLOG.md) as `accepted` — this is gate G10. Nothing stays only in this review's prose. **Phase must be a real, still-upcoming phase or `N/A` — never free text or a finished phase** (the round-trip pulls by exact match; anything else is silently orphaned).

| ID | Item | Phase | Severity | Status |
|---|---|---|---|---|

## Sign-off

- **Phase complete:** the operator's merge of the PR (with the closeout staged in it) completes the phase — the merge commit is the record (no G12 checkbox). State <yes / conditional — what blocks>.
```

## Operator-steps template

Lives at `docs/phase-reviews/phase-<n>-operator-steps.md` — the operator's at-a-glance "what do I have to do." Generated at entry from the phase doc's operator-gated deliverables + the Plan subagent's manual gestures, kept current as the build surfaces new ones. Each step says whether it's irreducibly human or agent-assisted, and links the validation(s) it unblocks.

```markdown
# Phase <N> — operator steps

> Your manual gestures for this phase, in order. ✅ a step when done. Leave feedback inline as `> FEEDBACK: ...` against any step — `/phase-builder <n>` triages it on the next run. Irreducibly-human steps can't be automated; agent-assisted ones the agent does once you've done your part.

## Before — do before the build / deploy can proceed
| ID | Step | Human? | Unblocks | Status |
|---|---|---|---|---|

## During — mid-build gestures
| ID | Step | Human? | Unblocks | Status |
|---|---|---|---|---|

## Validation — gestures you perform to unblock validations (exit gate G1)
> The pass/fail *result* of each scenario lives once in the exit review's *Validation* table (gate G1) — not here. This section is only the operator gesture (sign in, install the app, create the trigger) that lets the agent run the scenario.
| ID | Gesture | Unblocks (V#) | Done? |
|---|---|---|---|

## After — post-build → phase complete
| ID | Step | Human? | Status |
|---|---|---|---|
| — | **Accept the pre-exit validation handoff** (scenario results + evidence pack) + give "what's not working" notes (gate G9 — this happens *before* the exit workflow runs) | yes | |
| — | Review the exit review's gate ledger; approve the proposed backlog rows (gate G10) | yes | |
| — | Approve / open the phase PR (exit gate G11) | yes | |
| — | Merge the PR (closeout already staged in it) → phase complete; the merge commit is the record (no follow-up PR) | yes | |
```
