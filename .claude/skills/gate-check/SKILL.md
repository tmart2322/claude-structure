---
name: gate-check
description: Runs the canonical per-PR mechanical-gate sweep for this repo as one command set, mirroring CI exactly (typecheck, lint, test, contract-verify, and the project's gate scripts). docs/REVIEW.md is the spec for WHAT the gates are; docs/PROJECT.md holds the concrete commands; this skill is the runner. Use to verify a change is CI-green before opening a PR, at a phase's verify/exit step, or ad-hoc ("run the gates", "/gate-check", "is this CI-green", "check the mechanical gates"). Crucially includes lint, which an aggregate "gates" command often omits.
---

# Gate check

Run the full mechanical-gate sweep locally so a change is **CI-green before the PR opens**, not red on the first CI run. `docs/REVIEW.md#mechanical-ci-gates` is the **spec** for what the gates are and why; `docs/PROJECT.md#commands` holds this project's **exact commands**; this skill is the **runner** that mirrors CI. When the gate set changes, update `PROJECT.md` — it is the single source for the command list.

## Why this exists

It's common to validate a change with "run the tests" + the sandbox, while the **CI jobs themselves don't run until PR-open** — and then find reds. The most common one is **lint**: an aggregate `gates`/`check` command often does **not** run the formatter/linter, so a formatting slip reaches CI at PR-open. **Lint is in this sweep on purpose.**

## The sweep (mirror your CI config)

Read the command table in **`docs/PROJECT.md`** and run, in order, collecting **every** result (don't stop at the first red — report them all):

1. **Typecheck**
2. **Lint / format check**  ← the one an aggregate gate command often omits
3. **Tests** (the full suite, including real-boundary integration tests)
4. **Contract/spec verify** (regenerate + diff against committed) — if the project has a versioned contract
5. **The project's gate scripts** (the static `check-*` gates listed in `PROJECT.md` — tests-required, secret-scan, the project's invariant gates, …)

## CI-only checks (name them; don't imply they passed)

Some CI jobs need a deployed-mode env and can't be faithfully reproduced from a clean local checkout — call these out explicitly rather than implying coverage:

- **Boot smoke** + **end-to-end / UI tests** that need deployed-mode env vars; a missing var fails them closed (correct) but only surfaces in CI. If you can't run them locally, say so — they're the live-validation surface (`validator` / the deploy target).
- **Release build** job.

## Output

A pass/fail line per check, the failing output (trimmed) for any red, and an explicit list of the CI-only checks you could not reproduce locally.
