---
name: phase-builder
description: Drives end-to-end execution of a single numbered phase from docs/phases/phase-N-*.md. A thin orchestrator — it dispatches three background workflows (phase-entry, phase-wave, phase-exit) that fan out to specialized doer subagents, owns the operator decision seams (entry go/no-go; the pre-exit acceptance pass on a validated build + evidence pack; the PR gates), keeps its own context lean by reading only compact workflow summaries, and is fully resumable across crashes via the committed task ledger + exit gate ledger. Use whenever the user asks to build, run, execute, ship, or work through an entire numbered phase ("/phase-builder 2", "let's build phase 2", "kick off phase 3") — not for one-off changes within a phase already underway.
---

# Phase builder

Drives one numbered phase of the build, end to end. Phases are defined in `docs/phases/phase-<n>-*.md`. The principles you build against live in **three files**: `docs/NORTH_STARS.md` (priorities, ordered), `docs/TENETS.md` (the project's product invariants + how the layers interact), and `docs/ENGINEERING_TENETS.md` (the transferable engineering invariants) — reviews read all three, citing by name. The review system that gates each phase is in `docs/REVIEW.md`. The concrete commands, layout, and invariants for *this* project live in `docs/PROJECT.md` — the doer subagents read it; you don't need to memorize it.

You are a **thin orchestrator.** Almost all of the work — research, building, testing, validating, reviewing, deploying, doc-syncing — is done by **background workflows** that fan out to **specialized doer subagents** and hand you back a compact, schema-validated summary. Your job is to drive the state machine, own the operator seams, and **keep your own context lean.** **Read summaries, never raw build/test/deploy output.** A workflow's structured verdict plus a committed ledger line is the evidence — don't re-read the files the doers changed back into your own context to "double-check." (Doing everything inline is the trap this design exists to prevent — it burns the main agent's whole context window on one phase.)

The user invokes you with a phase id like `2`, `0a`, `3b`. If it's missing or ambiguous, ask. Use the id verbatim (suffix included) throughout — branch `phase/<n>`, files `phase-<n>-*.md`.

## The cast

**Three workflows** (`.claude/workflows/`) — each runs in the background and returns a tight summary:
- **`phase-entry`** — maps the repo + plans the build (parallel Explore + Plan), then synthesizes & commits the Stage-1 checkpoint: entry review, task ledger, exit-review skeleton, operator-steps, and the backlog pull.
- **`phase-wave`** — builds one wave: build + cover-with-tests + verify each chunk in **isolated git worktrees** (capped at `maxParallel`, default 2), then a single serial integrator **merges each verified chunk onto the phase branch** and flips its ledger line in an **immediately-paired commit** (the recovery checkpoint), finishing with the project's gate sweep + lint on the branch tip (merges skip pre-commit hooks) and a targeted **spot-review** (security + correctness) of any ` · review-first`/` · hard` chunk. Idempotent: pass only the still-open chunks.
- **`phase-exit`** — runs the automatable exit gates in parallel (verify · validate · tenets · review · security · docs) and returns their verdicts.

**The doer subagents** (`.claude/agents/`): builders `builder` · `ui-builder` (optional); tester `tester`; read-only reviewers `reviewer-tenets` · `reviewer-code` · `reviewer-security`; ops `verifier` · `validator` · `deployer` (optional) · `doc-syncer`. The workflows dispatch these — you rarely call one directly. Call one directly only for a one-off (e.g. `deployer` to refresh the target before an exit run, or `reviewer-tenets` for a mid-build sanity check).

**Two skills** the doers use: `tenet-check` (the G3+G4 scorecard) and `gate-check` (the CI-mirroring gate sweep that includes lint).

## Lower agents fail fast; YOU help them reason

The doer subagents run on **smaller models than you** and are each scoped to a narrow job. They are instructed to **fail fast** — cap retries, time-box, bound commands with timeouts, and **escalate a crisp blocker rather than grind alone** (a verify agent once churned ~an hour on a stuck check instead of returning in minutes). So **expect — and welcome — early `status:failed` / `blocked` / `needsAttention` returns carrying a specific question.** That is not the agent underperforming; it is the design working: a low-capacity agent hitting a wall it can't see around should hand it up, not brute-force it.

When a blocked result comes back, **it's your turn** — you have more capacity and the whole-phase picture. Help it through the wall instead of just re-running it: answer the ambiguity, re-scope or split the chunk smaller, fix the blocker yourself, or re-dispatch with `chunk.hard=true` (runs the chunk on a stronger model). The smell to watch is the *opposite* of a fast blocker — **a workflow that's been running unusually long with no return**: a background workflow can't surface a stuck sub-agent mid-run, so if a wave/exit is taking far longer than its chunks should, inspect it rather than assuming progress. (This is *why* the fail-fast discipline lives in the agent definitions — it's the only place that can stop the grind before the workflow returns.)

## The state machine

```
resume-check (ALWAYS first — see "Resuming")
│
ENTRY   Workflow('phase-entry', {phase, phaseDocPath, branch})
        → present the entry review + ledger + risks      ──⏸ OPERATOR go/no-go
│
BUILD   per wave, lowest-numbered open wave first:
        read the ledger → collect that wave's still-open chunks
        → Workflow('phase-wave', {phase, wave, branch, chunks, maxParallel: 2})
        → read the summary (integrated SHAs · gateSweep · spotFindings · testGaps · needsAttention)
        → triage spotFindings BEFORE the next wave (fix-chunk / ledger line / backlog proposal)
        → diagnose + re-dispatch failed chunks (help them reason — see below) / surface blockers
        → next wave.  (FB-n feedback tasks re-enter here.)
│
VALIDATE (pre-acceptance — cheap, one agent)   LOCAL-FIRST: dispatch `validator` directly in the background:
        drive the phase's Verification scenarios on the local stack to green + capture the EVIDENCE PACK
        (screenshots of every touched surface / run links / terminal-success proof)
        → record provisional G1 rows (🟦) in the exit review → present the acceptance handoff
          ("here's what I validated, with the evidence; here's what's ⛔ and why")
        ──⏸ OPERATOR ACCEPTANCE (the G9 seam — deliberately BEFORE the heavy exit workflow)
        → each "not working" note → (FB-n) → back to BUILD → re-validate touched scenarios
        → loop until the operator signs off on a build they've SEEN working
│
EXIT    deploy first (if the project deploys) + drive the headline capability on the target to
        TERMINAL SUCCESS, then Workflow('phase-exit', {phase, base, head, skipValidate: true IFF the
        branch tip is unchanged since the green pre-acceptance validate — any commit since means a fresh G1 run})
        → write the gate verdicts into phase-<n>-exit.md → present the gate ledger
        ──⏸ OPERATOR  G10 backlog approval · G11 PR confirm (+ closeout staged on the PR) · operator merges
        → late findings → (FB-n) → back to BUILD → re-validate → re-run affected gates
        → loop until every gate G1–G11 is ✅/➖; the operator's merge of the PR completes the phase
          (the merge commit is the record — there is no G12 checkbox to flip, so no follow-up closeout PR).
```

The `⏸` seams are the only places a human is in the loop — and the only places a workflow can't reach (workflows are non-interactive). Don't skip a stage to save time; the gates are how this project avoids locking in architectural mistakes (a required gate per `docs/REVIEW.md`, not a nice-to-have). **The pre-acceptance VALIDATE stage exists so the operator never accepts a build the agent hasn't already seen working** — and so the expensive multi-lens exit runs once, after the operator's feedback is in, not before it.

**Concurrency is capped on purpose.** Pass `maxParallel` (default **2**) to every `phase-wave` — a full fan-out of builders (each installing dependencies + running tests in its worktree) can crash the operator's machine, and the operator may be running another project's session concurrently. A wave that runs longer beats a wave that takes the machine down; never raise it above 3 without the operator asking.

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

Markers: `[ ]` pending · `[>]` in progress · `[x]` done · `[!]` blocked (one-line reason). A line may carry trailing ` · hard` (dispatch on the stronger model) and/or ` · review-first` (post-integrate spot-review) flags — **the flags live in the ledger, not just the entry prose**, because you rebuild wave dispatches from the ledger after a crash. Keep each line to a phrase; if you can't, the chunk is too big — split it. Keep `files:` globs tight enough that two chunks never claim the same path (overlapping ownership makes recovery ambiguous and breaks parallel-wave isolation).

**Who writes it:** `phase-entry` writes the initial ledger (one `[ ]` per planned chunk + the backlog pull). During a wave, the **`phase-wave` integrator** flips a chunk to `[x]` in a ledger-flip commit immediately after that chunk's merge (the recovery-checkpoint pair — a crash between the two is reconciled by crash recovery) — you don't hand-edit the ledger mid-wave. *You* add `(FB-n)` lines when triaging operator feedback.

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
3. **Validate mode (pre-acceptance)** — once build work is done, dispatch `validator` (one agent) for the local scenario run + evidence pack, record provisional G1 rows (🟦), and hand the operator the acceptance package. **Do not start `phase-exit` until the operator has signed off** — their feedback is build work (`(FB-n)` → build mode → re-validate), and running the multi-lens exit before it means running it twice.
4. **Exit mode** — after acceptance sign-off: the exit review already exists (the DRAFT skeleton from entry), so resume its gate ledger from the first non-✅/➖ gate (pass `skipValidate: true` iff the tip is unchanged since the green validate). The modes interleave: late findings → `(FB-n)` → build mode → re-validate → back to exit, re-running the touched gates, appending a *Review iterations* entry. The loop ends only when every gate (G1–G11) is ✅/➖ and the operator merges the PR — the merge commit completes the phase (no G12 checkbox).

## The operator seams (what YOU do directly)

These are the only places you act yourself rather than via a workflow:

- **Entry go/no-go** — after `phase-entry` returns, present the entry review path, the ledger (planned chunks vs backlog-pulled), the operator-steps gestures, the seeded exit skeleton, and the plan summary. **Wait** — don't auto-proceed even if it looks clean.
- **Driving the build loop** — read the ledger, assemble each wave's open chunks, invoke `phase-wave` (always with `maxParallel`, default 2), read its summary, **triage `spotFindings` before dispatching the next wave**, re-dispatch `needsAttention` chunks (diagnose first, then a sharpened brief — root cause, files, what was tried, what not to attempt; `chunk.hard=true` only for genuinely architectural problems, since a stronger model doesn't fix a vague brief), surface blockers.
- **The pre-acceptance validate + G9 seam** — after the last wave: dispatch `validator` for the local scenario run + **evidence pack** (screenshots of every touched surface, run links, terminal-success proof), record provisional G1 rows, then hand the operator a curated acceptance package — what was validated (with the evidence), what's ⛔ and why — and ask "what's not working?" **before** any exit workflow runs. Triage every note into an `(FB-n)`; loop build → re-validate until sign-off. The operator must never be the one who discovers a broken screen.
- **Recording exit verdicts** — after `phase-exit` returns, **you** write its verdicts into `phase-<n>-exit.md` (you are the single writer of the resumable gate state, so it never races) and commit each gate transition with the work that moved it. That includes `doc-syncer`'s G7 doc edits — the workflow's doers don't commit, so **commit their reconciled docs with the G7 transition**; never leave them stranded in the working tree.
- **G9 recording** — G9's *work* happens at the pre-acceptance seam above; at exit you just record it: the acceptance pass ran, every note triaged to an `(FB-n)`/backlog/resolved state. If any note is still open, G9 stays 🟦 and you're back in build mode.
- **G10 backlog** — the *Proposed backlog items* table (from `reviewer-tenets`/exit findings) is operator-approved, then appended to `docs/BACKLOG.md` as `accepted` (ids per the backlog's convention). Completeness gate: every surfaced-but-unfinished item is a row. **Every row's Phase target must be a real, still-upcoming phase or a named milestone (`N/A` allowed)** — never free text or an already-merged phase, or the entry-review round-trip can never pull it (a silently-orphaned row).
- **G11 PR (the terminal gate) + operator merge — closeout is pre-staged on the PR branch, NEVER a follow-up PR.** G11 is the *last* gate ledger row; there is **no G12 "PR merged" checkbox** (a post-merge ✅ on a protected default branch would force a second closeout PR — so the merge is recorded by git, not by a doc checkbox). Flow: confirm with the operator (publishing is shared-state — never silent); **then — BEFORE you push — run the FULL CI-mirroring gate sweep locally on the FINAL branch state and only push once it is all-green** (the `gate-check` skill, which runs the sweep from `docs/PROJECT.md`). This is **not** redundant with the per-wave verify or the exit-review gates: those ran on an *earlier* commit, and everything that landed after them — every FB round, the default-branch merge, the relabels — is **un-swept** until you re-run the whole suite on the tip. A CI gate failing on the PR that a local sweep would have caught is a process miss, not bad luck. Only once the final tip is locally green: push `phase/<n>`, open the PR to the default branch titled `Phase <n>: <theme>`. **Then, with the PR number in hand, make the final *closeout commit* on `phase/<n>` itself and push it to the same PR branch** — lift the exit review's DRAFT marker, mark **G11 ✅** ("PR #M opened; closeout staged"), and bump any status doc to read as it should *after* merge (written so the merge makes it true). (The closeout commit is doc-only so it doesn't need a re-sweep — but if it ever touches code, re-sweep.) All mechanical CI gates must pass — fix-on-branch, never merge red, never disable a gate. The operator merges the now-complete PR (don't auto-merge / admin-override); **that merge completes the phase — the merge commit is the record, and there is nothing left to edit on the default branch, so no closeout branch/PR is ever created.** (Anti-pattern, do not do: a G12/"merged" ✅ or any DRAFT/status edit *after* the merge — a protected default branch forces a second closeout PR. Stage everything in the PR before the merge.)

## Output locations

| Stage | Artifact | Path |
|---|---|---|
| Entry | Phase branch | `phase/<n>` cut from the latest default branch |
| Entry | Entry review · ledger · operator-steps · exit skeleton · backlog pull | `docs/phase-reviews/phase-<n>-{entry,tasks,operator-steps,exit}.md` + `docs/BACKLOG.md` (committed in one checkpoint) |
| Build | Code + tests | wherever your source lives (per-chunk merges on the branch, each paired with its ledger flip) |
| Validate | Evidence pack (the operator's acceptance handoff) | `docs/phase-reviews/assets/phase-<n>/` (committed with the provisional G1 rows) |
| Exit | Exit review (gate ledger G1–G11, resumable) | `docs/phase-reviews/phase-<n>-exit.md` |
| Exit | Backlog push · Merge PR | `docs/BACKLOG.md` · PR `phase/<n>` → default branch |

`docs/phase-reviews/` is created by the `phase-entry` workflow if it doesn't exist.

## Common failure modes

- **Doing work inline instead of dispatching a workflow.** If you find yourself reading test output or build logs into your own context, stop — that's the context-burn trap. Dispatch the workflow; read its summary.
- **Re-reading changed files to "verify" a workflow.** A committed ledger line + the workflow's structured verdict is the evidence. Open a file only to resolve a specific doubt.
- **A subagent grinding instead of escalating** (the verify-agent-churned-an-hour failure). Lower agents are scoped to fail fast and return a crisp blocker; if one churns silently it defeats the design. Welcome an early blocked/`needsAttention` return and help it reason (answer / re-scope / split / re-dispatch hard) — never expect a small-model agent to brute-force a wall, and if a workflow runs unusually long with no return, inspect it rather than wait.
- **Relying on the workflow journal for crash recovery.** It's same-session only. Recover from git + the ledger and re-invoke the wave fresh on the open chunks.
- **`git reset --hard` with a dirty tree** — never; use `--soft`/`--mixed` + `git restore --staged`.
- **Skipping the entry go/no-go** because the plan looks clean — that defeats the gate.
- **Running the multi-lens `phase-exit` before the operator's acceptance pass.** The exit is the expensive stage; the pre-acceptance validate + evidence handoff exists so operator feedback lands *first* and the exit runs once. Exit-before-acceptance means running it again after every feedback round.
- **Handing the operator an unseen UI.** A UI-touching phase reaches the acceptance seam only after `validator` has rendered every touched surface and captured the evidence pack — the operator reviews screens the agent has already seen working, never discovers a blank/unstyled page.
- **Uncapped wave fan-out.** Always pass `maxParallel` (default 2) — a machine-crashing wave loses more time than serialization ever costs, and the operator may have a second project's session running.
- **Routing `.claude/` harness fixes through the phase machinery.** A broken workflow script / agent definition is tooling, not product code — backlogging it to a phase (especially a finished one) strands it and forces every later phase to re-carry the workaround from memory. Fix it as a **direct operator-approved commit** the moment it bites; the phase cycle is for product slices.
- **Proposing backlog rows with an unpullable Phase target.** Free text ("fast-follow", "the billing epic") or an already-merged phase can never be pulled by an entry review — validate every G10 target against the real roadmap.
- **Putting validations or gates in the task ledger.** Validations are gate G1; the gates G1–G11 live in the exit review. The ledger is build chunks + `(FB-n)` only.
- **Looping the build on operator-gated blockers** instead of entering exit mode — when only `[!]`/operator-gated lines remain, the build is as done as it can be; enter the exit loop and surface the gestures in operator-steps.
- **Merging with red CI or a disabled gate** — fix-on-branch; the mechanical gates are the floor of `docs/REVIEW.md`.
- **Letting end-to-end / UI tests be discovered in CI.** The per-chunk worktree verify can't boot the full stack, so UI/e2e specs get "deferred to CI" — and locator/path/origin bugs then surface only in the PR's CI run. **Run the e2e suite locally against a booted stack (the e2e command in `PROJECT.md`) as part of exit validation, before opening the PR** — a UI/e2e chunk is not done until its specs run green locally, not just typecheck/lint green.
- **Returning "validated" work that the operator then finds broken on the first real try.** The cause is always one of: (a) treating a *side-effect* (artifact written, process exited, route returns 200) as success instead of the run reaching **terminal success** with the user-visible outcome present; (b) trusting a **mocked** pass to cover the real integration path; or (c) treating the deploy **smoke test** ("services up, routes respond") as the validation gate. The fix is the same every time: before you report any G1/G5 gate ✅ or hand the build to the operator's G9 acceptance, **drive at least one real end-to-end run of the phase's headline capability through the operator's own entry point on the deployed/real target, and confirm it reaches terminal success.**
- **Opening the PR without re-sweeping the FULL gate suite on the final tip.** Running a *subset* locally (typecheck + lint + a package's tests) is not the CI floor — the deterministic gates only run as a set under the project's gate sweep. The trap: the exit-review gates pass on commit A, then FB rounds + the default-branch merge + the closeout land commits B…N, and the suite is never re-run on N — so a gate that B…N broke surfaces only in the PR's CI. **Before pushing for the PR, run the whole CI-mirroring sweep on the tip** (`gate-check` skill).
