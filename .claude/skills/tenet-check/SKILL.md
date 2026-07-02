---
name: tenet-check
description: Reviews a diff against the three principle files — docs/NORTH_STARS.md (priorities), docs/TENETS.md (product invariants), docs/ENGINEERING_TENETS.md (engineering invariants) — producing the north-star scorecard (1-5 + evidence per applicable star, by name) and the tenet-violations list (the exit-review G3 + G4 gates). Use whenever you need to score a change against the project's principles: at a phase exit review, a mid-build sanity check, or ad-hoc ("tenet check this", "/tenet-check", "score this against the north stars", "any tenet violations"). Reviews the actual diff from a fresh read, never a narrative of what was built.
---

# Tenet check

Score a change against this project's **north stars** (priorities — lower number wins on conflict) and **design tenets** (invariants), exactly as the per-phase exit review's gates **G3** (scorecard) and **G4** (design-tenet violations) require (`docs/REVIEW.md`). The canonical principles live in **three files** — `docs/NORTH_STARS.md` (the stars you score), `docs/TENETS.md` **and** `docs/ENGINEERING_TENETS.md` (the invariants you check) — read all three; **scoring from one file, or checking violations from only one tenet file, is a named failure mode.** This skill is the *procedure*; the principle files are the *source of truth*.

## Inputs

- A **diff range** — default `git diff <default-branch>..HEAD`; accept an explicit base/head or a commit range (a mid-build check may score a subset of commits).
- `docs/NORTH_STARS.md` + `docs/TENETS.md` + `docs/ENGINEERING_TENETS.md`; for an exit gate, also the phase's Exit criteria + entry review for context.

Always review the **actual diff** — read the changed code. Never score from a description of what was built; the whole point of a fresh review is to catch the gap between intent and reality.

## Procedure

1. **Read the diff.** `git diff <base>..<head>` (+ `--stat` for shape). Read the substantive changes, not just filenames.
2. **Score each applicable north star 1-5.** Skip ones the change doesn't touch. Each score is concrete and evidence-backed (file paths / specific code), not a vibe. Honest calibration — a **3 with real evidence beats a 5 with hand-waving**; reserve 5 for genuinely exemplary, 1-2 for a real gap.
3. **List design-tenet violations.** Design tenets are invariants — go through them and list **every** violation, or state "none." For each: is it a **hard violation** (blocks the phase, fix now) or a **partial-incomplete** (acceptable to track → backlog)? Say which.
4. **Cite by name, not number.** Numbers are display order and change on reorder; names are stable.
5. **Anything ≤ 2, and every partial-incomplete, becomes a tracked backlog row** — emit it as a proposed item (title + proposed phase + severity) for the exit review's G10.

## Output

```yaml
north_star_scorecard:
  hands_off_automation:   { score: <1-5>, evidence: "<paths + what>" }
  cost_efficiency:        { score: <1-5>, evidence: "..." }
  # …one line per applicable north star, by name…
design_tenet_violations:
  - tenet: "<name>"
    kind: hard | partial-incomplete
    detail: "<what + where>"
  # …or: []  (none)
tracked:                  # ≤2 scores + partial-incompletes → backlog proposals (G10)
  - title: "..."
    phase: <n | N/A>
    severity: HIGH | MED | LOW
```

Keep it tight and evidence-dense. This is a gate, not a vibe check.
