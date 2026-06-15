export const meta = {
  name: 'phase-wave',
  description:
    'Build one wave of a phase: build + cover-with-tests + verify each chunk in parallel in isolated git worktrees, then a SINGLE serial integrator cherry-picks each verified chunk onto the phase branch with an atomic code+ledger-flip commit. Idempotent — pass only the still-open chunks; landed chunks are skipped by the caller. Returns per-chunk verdicts + integrated SHAs.',
  phases: [
    { title: 'Build', detail: 'builder / ui-builder per chunk in a worktree' },
    { title: 'Cover', detail: 'tester authors + runs tests for each chunk' },
    { title: 'Verify', detail: 'verifier runs typecheck + lint + tests per chunk' },
    { title: 'Integrate', detail: 'serial cherry-pick onto the phase branch + ledger flip' },
  ],
}

// args: { phase, wave, branch, chunks: [{ id, brief, files:[], ui?, hard?, needsTests? }] }
const phaseId = args.phase
const wave = args.wave
const branch = args.branch || `phase/${phaseId}`
const chunks = args.chunks || []

// Compact structured return from a builder/test agent working in a worktree.
const CHUNK_RESULT = {
  type: 'object',
  required: ['id', 'status', 'sha', 'filesTouched', 'verify', 'blockers'],
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['built', 'failed'] },
    sha: { type: 'string', description: 'commit SHA in the worktree (empty if failed)' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    verify: { type: 'string', description: 'verification commands run + their result' },
    blockers: { type: 'string', description: 'tenet conflict / decision-needed / empty' },
  },
}

log(`Wave ${wave}: ${chunks.length} chunk(s)`)

phase('Build')
// Each chunk flows build -> cover -> verify INDEPENDENTLY (pipeline, no barrier).
const built = await pipeline(
  chunks,
  // 1. BUILD in an isolated worktree branched from the phase branch; the builder commits there.
  (chunk) =>
    agent(
      [
        `Build chunk "${chunk.id}" for phase ${phaseId}, in your isolated worktree (branched from ${branch}).`,
        `Brief: ${chunk.brief}`,
        `You own ONLY these files: ${(chunk.files || []).join(', ')} — do not touch any other path.`,
        `Read docs/PROJECT.md for the commands + invariants. Implement it, run your verification (typecheck + lint +`,
        `the affected tests), then COMMIT just your files in this worktree with a lightweight message`,
        `("${chunk.id}: <what>"). Report status, the commit SHA, the files touched, the verification commands +`,
        `result, and any blocker. Do NOT touch ${branch} or cherry-pick anything — integration is a separate serial step.`,
      ].join(' '),
      {
        agentType: chunk.ui ? 'ui-builder' : 'builder',
        model: chunk.hard ? 'opus' : undefined,
        isolation: 'worktree',
        label: `build:${chunk.id}`,
        phase: 'Build',
        schema: CHUNK_RESULT,
      },
    ),
  // 2. COVER with tests in the same worktree (skip if the chunk is pure docs/config).
  (result, chunk) =>
    result && result.status === 'built' && chunk.needsTests !== false
      ? agent(
          `Author + run tests for chunk "${chunk.id}" (files: ${(chunk.files || []).join(', ')}) in the same worktree, ` +
            `then add/amend a commit. Prefer real-boundary integration tests over mocks; note what a mock can't catch. ` +
            `Report the test-run result and the final commit SHA.`,
          { agentType: 'tester', label: `test:${chunk.id}`, phase: 'Cover', schema: CHUNK_RESULT },
        ).then((t) => t || result)
      : result,
  // 3. VERIFY per-chunk (cheap, run-only).
  (result, chunk) =>
    result && result.status === 'built'
      ? agent(
          `Run per-chunk verification for "${chunk.id}" in its worktree: typecheck + lint + the affected tests ` +
            `(commands in docs/PROJECT.md). Report pass/fail per check + the failing output for any red. Do not fix anything; report.`,
          {
            agentType: 'verifier',
            label: `verify:${chunk.id}`,
            phase: 'Verify',
            schema: {
              type: 'object',
              required: ['id', 'pass', 'detail'],
              properties: {
                id: { type: 'string' },
                pass: { type: 'boolean' },
                detail: { type: 'string' },
              },
            },
          },
        ).then((v) => ({ ...result, verifyPass: !!(v && v.pass), verifyDetail: v ? v.detail : 'verify agent died' }))
      : result,
)

const ok = built.filter((r) => r && r.status === 'built' && r.verifyPass)
const bad = built.filter((r) => !r || r.status !== 'built' || !r.verifyPass)
log(`Built + verified ${ok.length}/${chunks.length}; ${bad.length} need attention`)

phase('Integrate')
// A SINGLE serial integrator (no git-index race) runs while the worktrees are still alive.
// It cherry-picks each verified chunk's FULL commit range (build + tests, not just the tip)
// onto the phase branch, combining the chunk's code and its ledger flip into ONE atomic commit
// (the crash-recovery checkpoint), then prunes the worktrees.
const integration = ok.length
  ? await agent(
      [
        `Integrate ${ok.length} verified phase-${phaseId} wave-${wave} chunks onto branch ${branch}, in the main worktree.`,
        `Chunks (cherry-pick in this order, serially):`,
        ...ok.map((r) => `  - ${r.id}: worktree commit ${r.sha}, files ${(r.filesTouched || []).join(', ')}`),
        ``,
        `For EACH chunk, on ${branch} (a chunk's worktree branch may hold MULTIPLE commits — the build commit AND a separate test commit — so you MUST cherry-pick the FULL range, never just the tip <sha>, or impl lands without tests / tests land without impl):`,
        `  1. BASE=$(git merge-base ${branch} <sha>)     # the wave-start point this chunk's worktree branched from`,
        `     git cherry-pick -n "$BASE"..<sha>           # stage ALL the chunk's commits (build + tests) WITHOUT committing`,
        `     # (if BASE..<sha> is a single commit this equals cherry-picking that one commit; if the range is EMPTY, STOP and report — the chunk produced no commits)`,
        `  2. edit docs/phase-reviews/phase-${phaseId}-tasks.md: flip that chunk's line from [>] (or [ ]) to [x]`,
        `  3. git add -A && git commit            # message: "<chunk-id>: <what> (wave ${wave})"`,
        `     -> code + ledger flip land in ONE atomic commit (the recovery checkpoint).`,
        `Then run: git worktree prune  (clean the integrated worktrees).`,
        ``,
        `NEVER run 'git reset --hard' with uncommitted work present. Files are disjoint so cherry-picks should not`,
        `conflict; if one does, STOP and report which chunk conflicted rather than forcing it.`,
        `Report each chunk's final integrated SHA on ${branch}, or which failed and why.`,
      ].join('\n'),
      {
        label: 'integrate',
        phase: 'Integrate',
        schema: {
          type: 'object',
          required: ['integrated', 'failed'],
          properties: {
            integrated: {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: { type: 'string' }, sha: { type: 'string' } },
              },
            },
            failed: {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: { type: 'string' }, reason: { type: 'string' } },
              },
            },
          },
        },
      },
    )
  : { integrated: [], failed: [] }

return {
  phase: phaseId,
  wave,
  chunkCount: chunks.length,
  integrated: integration.integrated,
  integrationFailed: integration.failed,
  needsAttention: bad.map((r) =>
    r
      ? { id: r.id, verify: r.verifyDetail || r.verify, blockers: r.blockers }
      : { id: 'unknown', blockers: 'build agent died — re-dispatch from ledger' },
  ),
}
