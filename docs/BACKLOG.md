# Backlog — cross-phase task registry

**The single registry of known-but-not-yet-done work.** Every item the system (AI or operator) surfaces but does not finish in the same iteration lands here as a row with a **target Phase** (or `N/A`) *before the surfacing phase can exit*. This is how deferred work survives a phase boundary instead of relying on memory or being buried in an exit review's prose.

> **The principle it enforces:** *every item the system does is a task somewhere.* Exit reviews surface work; the backlog guarantees it is never lost between phases. This operationalizes the tenets *Phase work is a living task ledger* and *Work is a re-orderable portfolio* — the per-phase ledger (`docs/phase-reviews/phase-<n>-tasks.md`) holds the *current* phase's tasks; this backlog holds everything aimed at a *future* phase (or no phase) until that phase's ledger absorbs it. See [`REVIEW.md`](REVIEW.md) for the gates that keep it honest.

## How it flows (the round-trip)

```
exit review  ──proposed items (Phase column)──▶  operator approves/re-assigns  ──▶  BACKLOG (accepted)
                                                                                          │
                                                                          /phase-builder <n> starts phase n
                                                                                          ▼
                                                              accepted rows where Phase == n  ──pulled──▶  phase-<n>-tasks.md  [ ]
```

- **In (exit → backlog).** A phase exit review emits a **Proposed backlog items** table — one row per item it surfaced but didn't finish, each with a proposed **Phase**. The operator approves or re-assigns (minimum human-in-the-loop). On approval the rows are appended to **Active backlog** below as `accepted` with a sequential `B-NNN` id.
- **Out (backlog → phase ledger).** When `/phase-builder <n>` starts phase `<n>` (entry review), it reads this file, takes every `accepted` row whose **Phase** is `<n>`, seeds each as a `[ ]` line in `docs/phase-reviews/phase-<n>-tasks.md` (carrying the `B-NNN` id + severity), and moves the row from **Active** to **Pulled** below. Nothing is pulled silently — the pull lands in the entry-review commit.
- **N/A.** Items deliberately not tied to a phase (do-anytime doc fixes, someday/maybe, ops notes) sit under **Active** with Phase `N/A`. They never auto-pull but stay visible; close them by moving to **Dropped**/**Done** with a note.

## Conventions

- **ID** — sequential `B-NNN`, never reused. New rows take the next number.
- **Phase** — a phase number, or `N/A`. This is the only field the pull mechanism keys on.
- **Severity** — `HIGH` / `MED` / `LOW` (mirrors the per-phase ledger). `—` for items with no risk dimension (pure scope, e.g. a future feature).
- **Status** — `proposed` (awaiting operator approval) · `accepted` (approved, awaiting its phase) · `pulled` (moved into a phase ledger — see Pulled section) · `done` · `dropped` (with a reason).
- **Source** — where the item came from (`phase-1-exit`, an ad-hoc note, etc.) so its provenance is never lost.

---

## Active backlog

| ID | Item | Phase | Sev | Source | Status |
|---|---|---|---|---|---|
| <!-- B-001 | example deferred item | 2 | MED | phase-1-exit | accepted --> | | | | | |

_(Empty to start. Exit reviews append rows here. Delete the commented example once you have real rows.)_

---

## Pulled into a phase

> Rows moved out of *Active* when their phase started (`/phase-builder <n>` pulled them into `phase-<n>-tasks.md`). Kept here so the provenance + canonical detail survive.

| ID | Item | Phase | Sev | Source | Pulled |
|---|---|---|---|---|---|

---

## Done / Dropped

| ID | Item | Resolution |
|---|---|---|
