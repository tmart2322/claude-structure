---
name: phase-builder
description: Drives end-to-end execution of a single numbered phase from docs/phases/phase-N-*.md. A thin orchestrator — it dispatches three background workflows (phase-entry, phase-wave, phase-exit) that fan out to specialized doer subagents, owns the operator decision seams (entry go/no-go; exit acceptance + PR gates), keeps its own context lean by reading only compact workflow summaries, and is fully resumable across crashes via the committed task ledger + exit gate ledger. Use whenever the user asks to build, run, execute, ship, or work through an entire numbered phase ("/phase-builder 2", "let's build phase 2", "kick off phase 3") — not for one-off changes within a phase already underway.
---

# Phase builder

Drives one numbered phase of the build, end to end. Phases are defined in `docs/phases/phase-<n>-*.md`. The principles you build against live in `docs/TENETS.md` (north stars are priorities; design tenets are invariants). The review system that gates each phase is in `docs/REVIEW.md`. The concrete commands, layout, and invariants for *this* project live in `docs/PROJECT.md` — the doer subagents read it; you don't need to memorize it.

You are a **thin orchestrator.** Almost all of the work — research, building, testing, validating, reviewing, deploying, doc-syncing — is done by **background workflows** that fan out to **specialized doer subagents** and hand you back a compact, schema-validated summary. Your job is to drive the state machine, own the operator seams, and **keep your own context lean.** **Read summaries, never raw build/test/deploy output.** A workflow's structured verdict plus a committed ledger line is the evidence — don't re-read the files the doers changed back into your own context to "double-check." (Doing everything inline is the trap this design exists to prevent — it burns the main agent's whole context window on one phase.)

The user invokes you with a phase id like `2`, `0a`, `3b`. If it's missing or ambiguous, ask. Use the id verbatim (suffix included) throughout — branch `phase/<n>`, files `phase-<n>-*.md`.

## The cast

**Three workflows** (`.claude/workflows/`) — each runs in the background and returns a tight summary:
- **`phase-entry`** — maps the repo + plans the build (parallel Explore + Plan), then synthesizes & commits the Stage-1 checkpoint: entry review, task ledger, exit-review skeleton, operator-steps, and the backlog pull.
- **`phase-wave`** — builds one wave: build + cover-with-tests + verify each chunk in parallel **isolated git worktrees**, then a single serial integrator cherry-picks each verified chunk onto the phase branch with an **atomic code + ledger-flip commit.** Idempotent: pass only the still-open chunks.
- **`phase-exit`** — runs the automatable exit gates in parallel (verify · validate · tenets · review · security · docs) and returns their verdicts.

**The doer subagents** (`.claude/agents/`): builders `builder` · `ui-builder` (optional); tester `tester`; read-only reviewers `reviewer-tenets` · `reviewer-code` · `reviewer-security`; ops `verifier` · `validator` · `deployer` (optional) · `doc-syncer`. The workflows dispatch these — you rarely call one directly. Call one directly only for a one-off (e.g. `deployer` to refresh the target before an exit run, or `reviewer-tenets` for a mid-build sanity check).

**Two skills** the doers use: `tenet-check` (the G3+G4 scorecard) and `gate-check` (the CI-mirroring gate sweep that includes lint).

## The state machine

```
resume-check (ALWAYS first — see "Resuming")
│
ENTRY   Workflow('phase-entry', {phase, phaseDocPath, branch})
        → present the entry review + ledger + risks      ──⏸ OPERATOR go/no-go
│
BUILD   per wave, lowest-numbered open wave first:
        read the ledger → collect that wave's still-open chunks → Workflow('phase-wave', {phase, wave, branch, chunks})
        → read the summary (integrated SHAs + needsAttention) → re-dispatch failed chunks / surface blockers
        → next wave.  (FB-n feedback tasks re-enter here.)
│
EXIT    LOCAL-FIRST — validate the whole loop on the local stack (the boot command in PROJECT.md) to green;
        only THEN deploy (if the project deploys) AND drive a REAL end-to-end run of the headline capability
        on the target to TERMINAL SUCCESS (not a smoke test)
        → Workflow('phase-exit', {phase, base, head})
        → write the gate verdicts into phase-<n>-exit.md → present the gate ledger
        ──⏸ OPERATOR  G9 acceptance · G10 backlog approval · G11 PR confirm (+ closeout staged on the PR) · operator merges
        → operator feedback → add (FB-n) to ledger → back to BUILD → re-run affected gates
        → loop until every gate G1–G11 is ✅/➖; the operator's merge of the PR completes the phase
          (the merge commit is the record — there is no G12 checkbox to flip, so no follow-up closeout PR).
```

The `⏸` seams are the only places a human is in the loop — and the only places a workflow can't reach (workflows are non-interactive). Don't skip a stage to save time; the gates are how this project avoids locking in architectural mistakes (a required gate per `docs/REVIEW.md`, not a nice-to-have).

**Validation is AI-first AND local-first** (tenets *The agent validates first; the human does final acceptance* + *Local-first testability*). `validator` drives the entire verification surface — code-level tests **and** the acceptance scenarios (gate G1), including the UI driven live and the real-use dogfood — to green **on the local stack first**, and only deploys for the **final confirm** once local is green. **Deploying to verify is the anti-pattern this avoids** — the deploy round-trip is slow and re-burns work each iteration; per-feedback-round verification runs locally, the deploy target is the last step, not the loop. The operator's only *validation* role is the **final acceptance pass at G9**, on an already-green build. (The human *authorization* gates — go/no-go, merge — are by design, not debugging.)

**What "validated" MUST mean — the operator is the final acceptance, never the one who discovers the feature is broken.** A scenario is **not** green until the *real* end-to-end path ran to **terminal success** with the **user-visible outcome confirmed**. Three hard rules, no exceptions:
- **Terminal success, not side-effects.** An async/long-running capability is green ONLY when its run reaches a terminal **success** state AND the user-visible result is actually present (the result renders in the UI; the artifact is actually produced). A run left running/blocked/failed is a **FAIL** — even if a side artifact exists. Never infer success from "a file was written," "the process exited 0," or "the route returns 200."
- **Real path on the target, not a mock.** A mocked test proves wiring and is necessary, but it **cannot** prove the real integration path (real credentials, real external calls, real completion signals). The keystone dogfood (G5) is green only after the **real** path completes end-to-end **on the deployed/real target** to terminal success. If the *local* environment can't complete a real run, that is not a pass — it is a "could not validate locally → must confirm on the target," and that confirm is mandatory, not optional.
- **The deploy confirm is not a smoke test.** "Deployed + services up + routes respond" is necessary but is NOT G1/G5. After deploying you MUST drive at least one real end-to-end run of the phase's headline capability through the operator's own entry point, to terminal success, before any validation/dogfood gate is ✅.

## Invoking a workflow

Call the `Workflow` tool with the workflow `name` and an `args` object (the script reads it as the global `args`). It runs in the background and notifies you on completion. **Wait for completion, then read the returned summary** before starting the next dependent step. Record what you need from it (SHAs, gate states, blockers) into the committed ledger / exit files, then move on. The summaries are small on purpose — that is what keeps your context lean across a whole phase.

## Task ledger (resumable across sessions)

The ledger at `docs/phase-reviews/phase-<n>-tasks.md` (committed on the phase branch) is the **source of truth for "what's left."** The in-session task list dies with the conversation; **the committed file is authoritative.**

**Format** — one terse line per task. Each *build-chunk* line carries a `files:` hint — the paths/globs that chunk owns — so a crashed session can be reconciled mechanically. The ledger holds **only build chunks and `(FB-n)` operator-feedback tasks** — i.e. *what the system builds on this branch.* It does **not** hold validation scenarios, dogfood proof, the PR, or operator gestures — those are gates (G1–G11) in the exit review, not tasks (*tenet: Single-source documentation*).

```md
# Phase <n> — tasks
Updated: <ISO timestamp>

## Wave 0 — serial (schema/migrations/shared types upstream)
- [x] CHUNK-DB · (B-022 HIGH) · files: `migrations/**`, `docs/<schema-doc>.md`
## Wave 1 — parallel
- [x] CHUNK-A · (B-017 HIGH) · files: `src/worktree.ts`
- [>] CHUNK-B · files: `src/logger.ts` · _in progress_
- [ ] CHUNK-C · files: `scripts/check-invariant.ts`
- [ ] (FB-1) raise the iteration cap — exit-review feedback · files: `src/budgets.ts`
```

Markers: `[ ]` pending · `[>]` in progress · `[x]` done · `[!]` blocked (one-line reason). Keep each line to a phrase; if you can't, the chunk is too big — split it. Keep `files:` globs tight enough that two chunks never claim the same path (overlapping ownership makes recovery ambiguous and breaks parallel-wave isolation).

**Who writes it:** `phase-entry` writes the initial ledger (one `[ ]` per planned chunk + the backlog pull). During a wave, the **`phase-wave` integrator** flips a chunk to `[x]` in the *same commit* as that chunk's code (the recovery checkpoint) — you don't hand-edit the ledger mid-wave. *You* add `(FB-n)` lines when triaging operator feedback.

## Resuming a phase + crash recovery

On **every** `/phase-builder <n>` invocation, before anything else:

1. **Guard against an in-flight workflow.** If your *previous* session died while a `phase-wave`/`phase-exit` workflow was still running in the background, check the task list for a live phase workflow and **stop (or await) it before reconciling** — never let two waves run against the same branch. After a hard crash / app restart no background workflow survives, so this is a no-op there; it only matters when the same process kept running.

2. **Detect phase state from git** (not from the conversation or any workflow journal):
   - Branch `phase/<n>` exists? Is the **Stage-1 checkpoint committed** (`git log` shows the entry-review commit and `git ls-files` tracks `phase-<n>-tasks.md`)?
   - **Branch + committed checkpoint → resume.** Read the ledger + entry review + the exit review's gate ledger + operator-steps. Report build done/in-progress/pending counts, the gate the exit will resume at, the last-updated timestamp, and the branch tip. Run **crash recovery** (below) *before* continuing. Skip Stage 1.
   - **Branch exists but the checkpoint isn't committed →** Stage 1 crashed mid-way; the `phase-entry` workflow commits everything atomically, so a crash before it leaves a clean-to-finish set — re-run `phase-entry` (idempotent on a fresh checkpoint) or finish + commit the partial set, then proceed.
   - **No branch and no files →** fresh start: cut `phase/<n>` from a clean, up-to-date default branch (pre-flight: working tree clean, on the default branch pulled to origin tip, the prior phase's PR merged — if it's still open, stop and surface that), then run `phase-entry`.

3. **Crash recovery (automatic — reconcile from git, never from a journal).** A session can die between "a chunk finished in its worktree" and "the integrator committed it onto the branch." The **workflow journal does not help across sessions** (resume is same-session only) — so recover from git + the ledger, then **re-invoke `phase-wave` fresh with only the still-open chunks** (it's idempotent; landed chunks are `[x]` and skipped). Specifically:
   - **Reconcile leftover worktrees.** `git worktree list` → for each phase worktree from the dead run: does it hold a chunk commit, and does that chunk verify green (the project's typecheck/test/lint scoped to its `files:`)? **Verifies →** cherry-pick it onto `phase/<n>`, flip its ledger line to `[x]`, commit the two together (the checkpoint the dead session never made) — adopt, don't rebuild. **Doesn't verify / absent →** discard it and leave the line `[ ]` for re-dispatch. Then **`git worktree prune`** the stragglers. Never silently keep or delete a worktree you didn't reconcile.
   - **Reconcile the main tree.** For any `[>]` line with uncommitted artifacts under its `files:`, apply the same adopt-or-reset test. **Attribute failures to the chunk's own `files:`, not the whole package** — a package-level red can come from committed code or another chunk; if no error maps to this chunk's files, adopt it and record the unrelated red as a separate finding.
   - **Orphans** — uncommitted files mapping to no `[>]` task: don't silently delete or fold them in; attribute each to its owner, or `git stash push -m "phase-<n> recovery: <desc>"` and surface the stash.
   - **Never `git reset --hard` with uncommitted work present.** It silently discards uncommitted changes. To drop a commit while keeping the tree, use `git reset --soft`/`--mixed` + `git restore --staged`.
   - **Report and continue:** what was adopted, reset, stashed — then resume from the first non-`[x]` line.

### Build mode vs. exit mode (after recovery)

1. **Triage operator feedback first** (always). Scan `phase-<n>-operator-steps.md` + the exit review's *Operator notes & feedback* for un-triaged `> FEEDBACK:` notes. Convert each (with the operator) into a current-phase `(FB-n)` ledger line, a backlog item, or a checked-off resolution. New `(FB-n)` lines are build work.
2. **Build mode** — if any build / `(FB-n)` line is open and not purely operator-blocked, run the next wave (collect its open chunks → `phase-wave`).
3. **Exit mode** — once build work is done (or only operator-gated lines remain), enter the exit loop: the exit review already exists (the DRAFT skeleton from entry), so resume its gate ledger from the first non-✅/➖ gate. The modes interleave: exit feedback → `(FB-n)` → build mode → back to exit, re-running the touched gates, appending a *Review iterations* entry. The loop ends only when every gate (G1–G11) is ✅/➖ and the operator merges the PR — the merge commit completes the phase (no G12 checkbox).

## The operator seams (what YOU do directly)

These are the only places you act yourself rather than via a workflow:

- **Entry go/no-go** — after `phase-entry` returns, present the entry review path, the ledger (planned chunks vs backlog-pulled), the operator-steps gestures, the seeded exit skeleton, and the plan summary. **Wait** — don't auto-proceed even if it looks clean.
- **Driving the build loop** — read the ledger, assemble each wave's open chunks, invoke `phase-wave`, read its summary, re-dispatch `needsAttention` chunks (route a genuinely hard one with `chunk.hard=true` so the wave runs it on a stronger model), surface blockers.
- **Recording exit verdicts** — after `phase-exit` returns, **you** write its verdicts into `phase-<n>-exit.md` (you are the single writer of the resumable gate state, so it never races) and commit each gate transition with the work that moved it.
- **G9 acceptance** — show the operator the green gate ledger and ask "what's not working" *before* sign-off; triage each note (re-entry step 1).
- **G10 backlog** — the *Proposed backlog items* table (from `reviewer-tenets`/exit findings) is operator-approved, then appended to `docs/BACKLOG.md` as `accepted` (next `B-NNN` ids). Completeness gate: every surfaced-but-unfinished item is a row.
- **G11 PR (the terminal gate) + operator merge — closeout is pre-staged on the PR branch, NEVER a follow-up PR.** G11 is the *last* gate ledger row; there is **no G12 "PR merged" checkbox** (a post-merge ✅ on a protected default branch would force a second closeout PR — so the merge is recorded by git, not by a doc checkbox). Flow: confirm with the operator (publishing is shared-state — never silent); **then — BEFORE you push — run the FULL CI-mirroring gate sweep locally on the FINAL branch state and only push once it is all-green** (the `gate-check` skill, which runs the sweep from `docs/PROJECT.md`). This is **not** redundant with the per-wave verify or the exit-review gates: those ran on an *earlier* commit, and everything that landed after them — every FB round, the default-branch merge, the relabels — is **un-swept** until you re-run the whole suite on the tip. A CI gate failing on the PR that a local sweep would have caught is a process miss, not bad luck. Only once the final tip is locally green: push `phase/<n>`, open the PR to the default branch titled `Phase <n>: <theme>`. **Then, with the PR number in hand, make the final *closeout commit* on `phase/<n>` itself and push it to the same PR branch** — lift the exit review's DRAFT marker, mark **G11 ✅** ("PR #M opened; closeout staged"), and bump any status doc to read as it should *after* merge (written so the merge makes it true). (The closeout commit is doc-only so it doesn't need a re-sweep — but if it ever touches code, re-sweep.) All mechanical CI gates must pass — fix-on-branch, never merge red, never disable a gate. The operator merges the now-complete PR (don't auto-merge / admin-override); **that merge completes the phase — the merge commit is the record, and there is nothing left to edit on the default branch, so no closeout branch/PR is ever created.** (Anti-pattern, do not do: a G12/"merged" ✅ or any DRAFT/status edit *after* the merge — a protected default branch forces a second closeout PR. Stage everything in the PR before the merge.)

## Output locations

| Stage | Artifact | Path |
|---|---|---|
| Entry | Phase branch | `phase/<n>` cut from the latest default branch |
| Entry | Entry review · ledger · operator-steps · exit skeleton · backlog pull | `docs/phase-reviews/phase-<n>-{entry,tasks,operator-steps,exit}.md` + `docs/BACKLOG.md` (committed in one checkpoint) |
| Build | Code + tests | wherever your source lives (atomic per-chunk commits on the branch) |
| Exit | Exit review (gate ledger G1–G11, resumable) | `docs/phase-reviews/phase-<n>-exit.md` |
| Exit | Backlog push · Merge PR | `docs/BACKLOG.md` · PR `phase/<n>` → default branch |

`docs/phase-reviews/` is created by the `phase-entry` workflow if it doesn't exist.

## Common failure modes

- **Doing work inline instead of dispatching a workflow.** If you find yourself reading test output or build logs into your own context, stop — that's the context-burn trap. Dispatch the workflow; read its summary.
- **Re-reading changed files to "verify" a workflow.** A committed ledger line + the workflow's structured verdict is the evidence. Open a file only to resolve a specific doubt.
- **Relying on the workflow journal for crash recovery.** It's same-session only. Recover from git + the ledger and re-invoke the wave fresh on the open chunks.
- **`git reset --hard` with a dirty tree** — never; use `--soft`/`--mixed` + `git restore --staged`.
- **Skipping the entry go/no-go** because the plan looks clean — that defeats the gate.
- **Putting validations or gates in the task ledger.** Validations are gate G1; the gates G1–G11 live in the exit review. The ledger is build chunks + `(FB-n)` only.
- **Looping the build on operator-gated blockers** instead of entering exit mode — when only `[!]`/operator-gated lines remain, the build is as done as it can be; enter the exit loop and surface the gestures in operator-steps.
- **Merging with red CI or a disabled gate** — fix-on-branch; the mechanical gates are the floor of `docs/REVIEW.md`.
- **Letting end-to-end / UI tests be discovered in CI.** The per-chunk worktree verify can't boot the full stack, so UI/e2e specs get "deferred to CI" — and locator/path/origin bugs then surface only in the PR's CI run. **Run the e2e suite locally against a booted stack (the e2e command in `PROJECT.md`) as part of exit validation, before opening the PR** — a UI/e2e chunk is not done until its specs run green locally, not just typecheck/lint green.
- **Returning "validated" work that the operator then finds broken on the first real try.** The cause is always one of: (a) treating a *side-effect* (artifact written, process exited, route returns 200) as success instead of the run reaching **terminal success** with the user-visible outcome present; (b) trusting a **mocked** pass to cover the real integration path; or (c) treating the deploy **smoke test** ("services up, routes respond") as the validation gate. The fix is the same every time: before you report any G1/G5 gate ✅ or hand the build to the operator's G9 acceptance, **drive at least one real end-to-end run of the phase's headline capability through the operator's own entry point on the deployed/real target, and confirm it reaches terminal success.**
- **Opening the PR without re-sweeping the FULL gate suite on the final tip.** Running a *subset* locally (typecheck + lint + a package's tests) is not the CI floor — the deterministic gates only run as a set under the project's gate sweep. The trap: the exit-review gates pass on commit A, then FB rounds + the default-branch merge + the closeout land commits B…N, and the suite is never re-run on N — so a gate that B…N broke surfaces only in the PR's CI. **Before pushing for the PR, run the whole CI-mirroring sweep on the tip** (`gate-check` skill).
