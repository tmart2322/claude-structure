# Project profile

> **Fill this in once, per project.** This file is the single place the phase-builder system learns the concrete facts about *your* repo — the commands to run, where code lives, and the invariants that must never break. The skills, agents, and workflows are written to be generic; they read the specifics from here. Keeping it accurate is what makes the whole system "just work" against your stack.
>
> Everything in angle brackets `<…>` is a placeholder to replace. Delete sections that don't apply (e.g. the deploy table if you don't deploy, the UI rows if you have no UI).

## What this project is

<One paragraph: what this codebase is, what it does, who/what consumes it. Plain language — no marketing.>

**Stack:** <languages, frameworks, package manager, test runner, DB, infra — the one-liner>

## Repo layout

> Where things live, so a build agent doesn't have to rediscover it. Keep it tight — the directories that matter, one line each.

```
<dir/>          — <what lives here>
<dir/>          — <what lives here>
...
```

## Commands

> **The command table is the most important part of this file.** The verifier, the gate-check skill, and every builder/validator read these to know how to check your code. Use the exact invocations that work in your repo. If a command doesn't exist yet, that's a Phase-1 deliverable — write it down as `<TODO>` so it's visible.

| Purpose | Command | Notes |
|---|---|---|
| **Typecheck** | `<e.g. pnpm typecheck>` | |
| **Lint / format check** | `<e.g. pnpm lint>` | Must be in the gate sweep — see warning below. |
| **Unit + integration tests** | `<e.g. pnpm test>` | Prefer real-boundary integration tests over mocks. |
| **Full CI-mirroring gate sweep** | `<e.g. pnpm gates>` | The deterministic floor — see *Mechanical gates* below. |
| **Boot the whole stack locally** | `<e.g. pnpm dev:all>` | One command → DB + migrate + seed + services. The local-first validation surface. |
| **Local end-to-end / UI tests** | `<e.g. pnpm e2e:local>` | Boots a real stack and drives it; not "deferred to CI". |
| **Build** | `<e.g. pnpm build>` | |
| **Deploy (if any)** | `<e.g. ./scripts/release.sh>` | Delete this row if the project doesn't deploy. |

> ⚠️ **Lint belongs in the gate sweep even if your aggregate `gates` command omits it.** A formatting slip that only `lint` catches will otherwise surface at PR-open in CI instead of locally. When in doubt, the exit sweep is: `typecheck` + `lint` + `test` + `<contract/spec verify>` + `<gates>`.

## Mechanical gates

> Cheap, hard-to-game static checks that run in CI on every change and block merge. List the ones this project has (or wants). Each maps to a tenet — see [`REVIEW.md`](REVIEW.md#mechanical-ci-gates). Common starters:

| Gate | Enforces | Check |
|---|---|---|
| **Tests exist for new code** | *Comprehensive testing* | New source file ⇒ sibling test (or allowlisted). |
| **No plaintext secrets** | *No plaintext secrets in VCS* | Secret-scan blocks unencrypted credentials/keys. |
| **Contract/spec in sync** | *Versioned contract* | Regenerate the contract and diff against committed. (Delete if no public contract.) |
| **<your project-specific gate>** | *<tenet>* | <check> |

## Hard invariants

> The rules a build agent must never violate, even when a quick hack would be easier. These are the checkable, concrete form of your design tenets (see [`TENETS.md`](TENETS.md)). Replace these examples with yours.

1. **<e.g. Every new DB table carries a `tenant_id` and an RLS policy.>**
2. **<e.g. No `*_API_KEY` / provider secrets in committed config; secrets go through SOPS.>**
3. **<e.g. The contract source of truth is `schema/`; generate types from it, don't hand-write them.>**
4. **<e.g. New integrations are packages, not edits to the core service.>**

## Conventions

- **Branch naming:** phase branches are `phase/<n>` (cut from `<default branch, e.g. main>`). <Other branch rules.>
- **PR target:** `<default branch>`. <Branch protection on? merge policy?>
- **Commits:** <e.g. conventional but lightweight — full sentences, why-not-what, no rigid `feat:` prefix.>
- **Tests:** <where they live, naming, the harness to use.>
- **Deploy/sandbox authority:** <If you have a disposable sandbox the agent may deploy/reset freely, say so and name the irreversible ops it must pause before. If not, say "no autonomous deploy — operator deploys.">

## Things that bite (repo-specific gotchas)

> Optional but high-value: the non-obvious traps in this codebase that a reviewer should look for. (In the reference system this list held things like "values returned from one workflow step are JSON-serialized — class instances don't survive the boundary.") Seed it as you discover them; recurring ones become mechanical gates.

- <gotcha + how to avoid it>
