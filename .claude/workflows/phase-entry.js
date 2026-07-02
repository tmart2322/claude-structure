export const meta = {
  name: 'phase-entry',
  description:
    'Entry review for a phase: map the repo + plan the build in parallel, then synthesize the entry review, task ledger, exit skeleton, operator-steps, and backlog pull, and commit the Stage-1 checkpoint on the phase branch. Returns a compact summary for the orchestrator to present to the operator for go/no-go.',
  phases: [
    { title: 'Survey', detail: 'Explore the repo + Plan the build in parallel' },
    { title: 'Synthesize', detail: 'write + commit the Stage-1 entry checkpoint', model: 'opus' },
  ],
}

// args: { phase: "2", phaseDocPath: "docs/phases/phase-2-*.md", branch: "phase/2" }
// Some harness paths deliver `args` as a JSON string — normalize before reading.
const A = typeof args === 'string' ? JSON.parse(args) : args || {}
const phaseId = A.phase
const phaseDocPath = A.phaseDocPath
const branch = A.branch || `phase/${phaseId}`

phase('Survey')
const [repoMap, plan] = await parallel([
  () =>
    agent(
      `Map the current state of the repo for phase ${phaseId}. Read docs/PROJECT.md for the layout, then survey: ` +
        `what modules/packages/apps exist, what the recent commits did, and which prior-phase deliverables are ` +
        `already in place. Tight ~300-word summary keyed to what phase ${phaseId} (${phaseDocPath}) will introduce.`,
      { agentType: 'Explore', label: 'survey:repo', phase: 'Survey' },
    ),
  () =>
    agent(
      `Read ${phaseDocPath} + docs/NORTH_STARS.md + docs/TENETS.md + docs/ENGINEERING_TENETS.md + docs/PROJECT.md ` +
        `and produce a build plan tailored to phase ${phaseId}. ` +
        `Frame it as discrete, mostly-independent build chunks suitable for parallel subagent delegation, grouped into ` +
        `waves that serialize where data forces it (schema/migrations/shared types land first). For each chunk give: a ` +
        `one-line brief, a tight NON-overlapping files: glob, whether it is UI, whether it is architecturally hard ` +
        `(hard: true — runs on a stronger model), and whether it is security-/integrity-critical enough to warrant a ` +
        `targeted post-integrate spot-review (reviewFirst: true — auth/session, data isolation, money/safety paths, ` +
        `public endpoints). ` +
        `Enumerate every data-model change (tables/columns/fields) this phase introduces so the schema can be recorded.\n\n` +
        `OWNERSHIP-FIRST (do this BEFORE writing any route/file glob): for every new entity AND every new operator ` +
        `surface this phase introduces, answer one question — WHO OWNS IT? That single answer drives THREE things that ` +
        `must agree: (1) the schema — an owned entity carries its owner's foreign key; (2) the UI placement — a ` +
        `top-level entity earns a top-level route, but a child entity (one carrying a parent FK) belongs UNDER its ` +
        `parent, NOT as a global top-level tab (the exception is a genuinely cross-cutting surface; if you can't name ` +
        `the cross-cutting job, it's child-scoped); and (3) the OPERATOR ENTRY PATH — for every capability, name the ` +
        `route AND the action a human takes to start it from a fresh state (the "create/trigger/begin" affordance is ` +
        `part of the deliverable, not an afterthought). Write each chunk's files: glob to the correct path from the ` +
        `start, and make sure any nav-link chunk only links to routes that will exist. State each entity's owner and ` +
        `each capability's entry path explicitly in the plan.`,
      { agentType: 'Plan', label: 'survey:plan', phase: 'Survey' },
    ),
])

phase('Synthesize')
const result = await agent(
  [
    `Write + commit the Stage-1 entry checkpoint for phase ${phaseId} on branch ${branch}.`,
    `Follow .claude/skills/phase-builder/references/review-templates.md and docs/REVIEW.md's entry checklist.`,
    `These are documentation artifacts only — do not change source code.`,
    ``,
    `--- REPO MAP ---`,
    repoMap || '(survey agent produced nothing)',
    ``,
    `--- BUILD PLAN ---`,
    plan || '(plan agent produced nothing)',
    ``,
    `Produce these artifacts and commit them together as ONE atomic Stage-1 checkpoint:`,
    `  1. docs/phase-reviews/phase-${phaseId}-entry.md — tenets re-read (at-risk tenets BY NAME), scope check`,
    `     (every deliverable maps to a north star by name), open questions, risk-register delta, prior-phase`,
    `     exit findings carried in, and a sharpened definition-of-done from the phase's Exit criteria.`,
    `  2. docs/phase-reviews/phase-${phaseId}-tasks.md — one [ ] line per build chunk (brief + files: glob),`,
    `     grouped by wave, with a trailing \` · hard\` and/or \` · review-first\` marker where the plan flags it`,
    `     (the flags must survive a crash: the orchestrator rebuilds wave dispatches FROM THE LEDGER, so a flag`,
    `     only in prose is a flag lost). NO validation scenarios here — those are exit gate G1.`,
    `  3. docs/phase-reviews/phase-${phaseId}-exit.md — DRAFT skeleton: gate ledger G1-G11 all ⬜ + the`,
    `     Validation table seeded from the phase doc's Verification scenarios (each ⬜). Empty analysis headers.`,
    `  4. docs/phase-reviews/phase-${phaseId}-operator-steps.md — Before/During/Validation/After gestures.`,
    `  5. docs/BACKLOG.md — pull every accepted row with Phase=${phaseId} into the ledger as [ ] lines (keep`,
    `     the backlog id + severity) and move those rows to the Pulled table. (If a living schema/ops doc exists,`,
    `     add this phase's planned data-model changes to it.)`,
    ``,
    `Cite tenets/north stars BY NAME, not number. Commit all artifacts together (the atomic Stage-1 checkpoint) and`,
    `report the checkpoint SHA, the entry-review path, the count of planned chunks vs backlog-pulled rows, the`,
    `open questions, and the top risks — the orchestrator presents these to the operator for go/no-go.`,
  ].join('\n'),
  {
    label: 'synthesize:entry',
    phase: 'Synthesize',
    model: 'opus',
    schema: {
      type: 'object',
      required: ['reviewPath', 'plannedChunks', 'backlogPulled', 'openQuestions', 'risks'],
      properties: {
        reviewPath: { type: 'string' },
        plannedChunks: { type: 'number' },
        backlogPulled: { type: 'number' },
        openQuestions: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        checkpointSha: { type: 'string' },
      },
    },
  },
)

return result
