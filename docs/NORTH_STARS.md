# North stars

> **This is a starter file. Edit it to fit your project.** North stars are **priorities, ordered** — what to optimize *for*, used to break ties when two good things pull in different directions. **Lower-numbered wins a conflict.** Re-order, rewrite, cut, and add to match what your project actually optimizes for. The invariants that enforce them live in [`TENETS.md`](TENETS.md) (your product's own) and [`ENGINEERING_TENETS.md`](ENGINEERING_TENETS.md) (the transferable engineering set); how the layers interact is defined in [`TENETS.md`](TENETS.md#the-principle-system). A few entries are marked **[load-bearing]** because the phase-builder process assumes them — keep those (or an equivalent).

**Cite by name, not number** (*north star: Cost efficiency*) — numbers are display/priority order and silently break if the list is reordered; names are stable.

---

## The north stars (priority order — edit freely)

1. **Hands-off automation.** Once a unit of work is human-approved, execution runs to completion on its own and escalates only a genuine decision — the human is never the turn-by-turn babysitter of a running build. Design intent is captured *up front* (in refinement/planning) so that after a single approval the system runs itself.
2. **Cost efficiency.** Be deliberate about what work costs — compute, paid API/AI minutes, human time. Cheaper paths are preferred where they don't sacrifice a higher star; expensive paths are a visible, deliberate choice, never a silent default.
3. **Comprehensive testing.** Every change ships with the tests that prove it — and prefer tests that cross a *real* boundary over mocks that only prove the mock.
4. **Modularity & extensibility.** New capabilities plug in as small, single-purpose units; reuse over duplication. Adding a thing shouldn't mean editing the core.
5. **Iteration as first-class.** Every cycle produces a reviewable record of what worked and what didn't; recurring patterns become permanent improvements (a gate, a skill, a runbook entry).
6. **CI/CD maturity from day one.** Automated checks and a repeatable path to "shipped" exist from the first commit, not bolted on later.
7. **Self-validation.** The system validates every change itself — to green — *before* a human is asked to look. [load-bearing: the exit-review gates + the pre-UAT validation seam assume this]
8. **Visible operations.** The current and historical state of the system is observable without spelunking — logs, runs, status, all surfaced.
9. **Local-first testability.** Everything is exercisable end-to-end on a laptop before it deploys. Deploy-only gates ship a local bypass that can't be enabled in production. [load-bearing: the exit review's local-first validation]
10. **Reproducible operations.** The deployed system is rebuildable from scratch from committed code plus a short, *documented* set of human gestures and out-of-band secrets — nothing tribal.

When two stars conflict, the lower-numbered one wins. Example (with the ordering above): a feature that would buy more automation by skipping a test trades a #1 win for a #3 loss — and since these are *priorities not vetoes*, you weigh them; but if "ships with tests" is also a tenet, the tenet vetoes the option regardless.
