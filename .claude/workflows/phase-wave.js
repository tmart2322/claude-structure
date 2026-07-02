export const meta = {
  name: 'phase-wave',
  description:
    'Build one wave of a phase: build + cover-with-tests + verify each chunk in isolated git worktrees (batched — maxParallel, default 2, caps how many are in flight; full fan-out can crash the operator machine), then a SINGLE serial integrator merges each verified chunk onto the phase branch and flips its ledger line in an immediately-paired commit. The integrator ends with the project gate sweep + lint on the branch tip (merges skip pre-commit hooks), and reviewFirst/hard chunks get a targeted post-integrate security + correctness spot-review. Idempotent — pass only the still-open chunks; landed chunks are skipped by the caller. Returns per-chunk verdicts + merged SHAs + spotFindings.',
  phases: [
    { title: 'Build', detail: 'builder / ui-builder per chunk in a worktree' },
    { title: 'Cover', detail: 'tester authors + runs tests for each chunk' },
    { title: 'Verify', detail: 'verifier runs typecheck + lint + tests per chunk' },
    { title: 'Integrate', detail: 'serial merge of each verified chunk onto the phase branch + ledger flip + gate sweep' },
    { title: 'Spot-review', detail: 'targeted security + correctness pass on reviewFirst/hard chunks' },
  ],
}

// args: { phase, wave, branch, maxParallel?, chunks: [{ id, brief, files:[], ui?, hard?, reviewFirst?, needsTests? }] }
//   maxParallel (default 2) caps how many chunks are in flight at once — run longer, not hotter.
//   reviewFirst marks a chunk for the post-integrate spot-review (security/integrity-critical chunks).
// Some harness paths deliver `args` as a JSON string — normalize before reading.
const A = typeof args === 'string' ? JSON.parse(args) : args || {}
const phaseId = A.phase
const wave = A.wave
const branch = A.branch || `phase/${phaseId}`
const chunks = A.chunks || []

// Compact structured return from a builder/test agent working in a worktree.
const CHUNK_RESULT = {
  type: 'object',
  required: ['id', 'status', 'sha', 'filesTouched', 'verify', 'blockers', 'worktreePath'],
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['built', 'failed'] },
    sha: { type: 'string', description: 'commit SHA in the worktree (empty if failed)' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    verify: { type: 'string', description: 'verification commands run + their result' },
    blockers: { type: 'string', description: 'tenet conflict / decision-needed / empty' },
    worktreePath: {
      type: 'string',
      description: 'absolute path of this build worktree (`git rev-parse --show-toplevel`); cover + verify reuse it',
    },
  },
}

const maxParallel = A.maxParallel || 2
log(`Wave ${wave}: ${chunks.length} chunk(s), max ${maxParallel} in flight`)

phase('Build')
// Each chunk flows build -> cover -> verify INDEPENDENTLY (pipeline, no barrier) — but chunks ENTER
// in batches of maxParallel (default 2). A full fan-out of builders (each installing deps + running
// typecheck + tests in its worktree) can crash the operator's machine; run longer, not hotter.
const built = []
for (let batchStart = 0; batchStart < chunks.length; batchStart += maxParallel) {
  const batchResults = await pipeline(
    chunks.slice(batchStart, batchStart + maxParallel),
    // 1. BUILD in an isolated worktree; the builder commits there.
    //    NOTE: the harness branches the worktree from the DEFAULT branch, NOT from the phase branch —
    //    the builder MUST sync to ${branch} first or it cannot see prior waves' integrated work.
    (chunk) =>
      agent(
        [
          `Build chunk "${chunk.id}" for phase ${phaseId}, in your isolated git worktree.`,
          `CRITICAL FIRST STEPS — your worktree was branched by the harness from the DEFAULT branch, NOT from`,
          `the phase branch ${branch}, so it does NOT yet contain this phase's prior waves. Before anything else:`,
          `  1. \`git reset --hard ${branch}\` — your worktree is freshly created with NO uncommitted work, so this`,
          `     is safe; it syncs you to the ${branch} tip so prior waves' integrated code is visible.`,
          `  2. Install dependencies in THIS worktree if the project needs them (the install command is in`,
          `     docs/PROJECT.md; dependency dirs are gitignored and absent in a fresh worktree).`,
          `Then build. Brief: ${chunk.brief}`,
          `You own ONLY these files: ${(chunk.files || []).join(', ')} — do not touch any other path.`,
          `Read docs/PROJECT.md for the commands + invariants. Implement it, run your verification (typecheck +`,
          `lint + the affected tests), run the project's formatter/lint-fix on your files, then COMMIT just your`,
          `files in this worktree with a lightweight message ("${chunk.id}: <what>"). Do NOT touch ${branch}, do`,
          `NOT push, do NOT merge/cherry-pick — integration is a separate serial step.`,
          `Report status, the commit SHA, files touched, the verification commands + result, any blocker, and`,
          `worktreePath = the absolute path from \`git rev-parse --show-toplevel\` (cover + verify reuse this exact worktree).`,
          `FAIL FAST: if you hit a wall you can't clear in ~2-3 attempts (an ambiguity, a tenet conflict, a check you`,
          `can't get green, a hang), STOP and return status='failed' with the blocker + your one specific question —`,
          `do not grind. An early, crisp blocker routes to the main agent, which is higher-capacity and can help.`,
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
    // 2. COVER with tests in the BUILD's worktree (skip if the chunk is pure docs/config).
    //    The tester runs WITHOUT its own isolation, so it MUST cd into the build worktree
    //    (result.worktreePath) or it would author tests in the main tree, which never sees the
    //    build's commit (the wrong-tree bug).
    (result, chunk) =>
      result && result.status === 'built' && chunk.needsTests !== false
        ? agent(
            `Author + run tests for chunk "${chunk.id}" (files: ${(chunk.files || []).join(', ')}). ` +
              `FIRST run, as a standalone command, \`cd ${result.worktreePath}\` — that is the build's worktree, which ` +
              `already holds the chunk's code and installed dependencies; do ALL work there (cwd persists between commands). ` +
              `Prefer real-boundary integration tests over mocks; note what a mock can't catch. Run the project's ` +
              `formatter/lint-fix on your files, then add/amend a commit IN THAT WORKTREE. Report the test-run result, ` +
              `the final commit SHA, and worktreePath from \`git rev-parse --show-toplevel\`.`,
            { agentType: 'tester', label: `test:${chunk.id}`, phase: 'Cover', schema: CHUNK_RESULT },
          ).then((t) => {
            // If the test agent dies, the chunk still integrates (verify + the tests gate backstop it),
            // but flag the gap so the orchestrator sees it instead of discovering it at exit.
            if (!t) return { ...result, testsCovered: false }
            // Mechanical wrong-tree guard: if the toplevel the tester reports isn't the build's worktree,
            // its work landed somewhere else — don't adopt it, keep the verified build, surface the gap.
            // (Normalize the macOS /tmp -> /private/tmp symlink so a cosmetic difference isn't a false flag.)
            const norm = (p) => (p || '').replace(/^\/private\//, '/').replace(/\/+$/, '')
            if (t.worktreePath && norm(t.worktreePath) !== norm(result.worktreePath))
              return {
                ...result,
                testsCovered: false,
                blockers: [
                  result.blockers,
                  `tester reported toplevel ${t.worktreePath}, not the build worktree ${result.worktreePath} — its commits were NOT adopted; re-cover this chunk before exit`,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }
            return { ...t, worktreePath: result.worktreePath, testsCovered: true }
          })
        : result,
    // 3. VERIFY per-chunk (cheap, run-only) — also in the build's worktree.
    (result, chunk) =>
      result && result.status === 'built'
        ? agent(
            `Run per-chunk verification for "${chunk.id}". FIRST run, as a standalone command, \`cd ${result.worktreePath}\` ` +
              `— the chunk's worktree (its code + dependencies are present); do ALL work there. Then run: typecheck + lint + ` +
              `the affected tests (commands in docs/PROJECT.md). Report pass/fail per check + the failing output for any red. ` +
              `Do not fix anything; report. FAIL FAST: one clean run per check — never loop a check or wait out a hang ` +
              `(bound commands with a timeout); report the first clear result, including "hung/timed out", rather than grinding.`,
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
  built.push(...batchResults)
}

const ok = built.filter((r) => r && r.status === 'built' && r.verifyPass)
const bad = built.filter((r) => !r || r.status !== 'built' || !r.verifyPass)
log(`Built + verified ${ok.length}/${chunks.length}; ${bad.length} need attention`)

phase('Integrate')
// A SINGLE serial integrator (no git-index race) runs while the worktrees are still alive.
// Each verified chunk is merged onto the phase branch and its ledger line flips to [x] in an
// immediately-paired commit — the crash-recovery checkpoint pairing merged code with its ledger
// line. The integrator ends with the project's gate sweep on the branch tip (git merge skips the
// pre-commit hook, so per-chunk gate violations would otherwise slip through). Then prune worktrees.
const integrationResult = ok.length
  ? await agent(
      [
        `Integrate ${ok.length} verified phase-${phaseId} wave-${wave} chunks onto the phase branch ${branch}, in the main worktree.`,
        `First make sure the main worktree is on ${branch} (\`git switch ${branch}\`). Then, serially:`,
        ...ok.map((r) => `  - chunk "${r.id}": worktree commit ${r.sha}, files ${(r.filesTouched || []).join(', ')}`),
        ``,
        `Each chunk's worktree was synced to ${branch} before building (\`git reset --hard ${branch}\`), so its branch`,
        `SHARES ${branch}'s history and adds the chunk's own commits on top — merging brings only those new commits.`,
        `For EACH chunk (its worktree branch may hold MULTIPLE commits — a build commit AND a separate test commit — bring the WHOLE branch, never just the tip):`,
        `  1. Find the chunk's worktree branch (\`git worktree list\`).`,
        `     (if \`git log ${branch}..<worktree-branch>\` is EMPTY, STOP and report — the chunk produced nothing beyond the sync.)`,
        `  2. Merge its new commits onto ${branch}:  git merge --no-ff <worktree-branch>  (keeps the chunk's build+test commits).`,
        `  3. On ${branch}, edit docs/phase-reviews/phase-${phaseId}-tasks.md to flip that chunk's line from [>] (or [ ]) to [x],`,
        `     and commit the ledger flip immediately — the recovery checkpoint pairing the merged code with its ledger line.`,
        `After ALL chunks are merged, run the project's full gate sweep + lint on the ${branch} tip (commands in`,
        `docs/PROJECT.md; git merge skips the pre-commit hook, so this is the only per-wave enforcement). Report the`,
        `sweep result; if it is red, do NOT fix anything — report which check failed and which chunk's files it maps to.`,
        `Then run: git worktree prune  (clean the integrated worktrees).`,
        ``,
        `Do NOT push, do NOT open/merge any PR, do NOT touch the default branch — integration is LOCAL onto ${branch} only.`,
        `NEVER run 'git reset --hard' with uncommitted work present. Files are disjoint so merges should not conflict;`,
        `if one does, STOP and report which chunk conflicted rather than forcing it.`,
        `Report each chunk's merge SHA on ${branch}, or which failed and why.`,
      ].join('\n'),
      {
        label: 'integrate',
        phase: 'Integrate',
        schema: {
          type: 'object',
          required: ['integrated', 'failed', 'gateSweep'],
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
            gateSweep: {
              type: 'string',
              description: 'gate sweep + lint result on the branch tip: "green" or the failing check(s) + chunk attribution',
            },
          },
        },
      },
    )
  : { integrated: [], failed: [], gateSweep: 'skipped — no verified chunks to integrate' }

// If the integrator AGENT died (returned null), don't crash the workflow — the verified chunks still
// sit in their worktrees; the orchestrator's crash recovery reconciles them from git + the ledger.
const integration = integrationResult || {
  integrated: [],
  failed: ok.map((r) => ({ id: r.id, reason: 'integrator agent died — chunk verified in its worktree; reconcile via crash recovery' })),
  gateSweep: 'integrator agent died before the sweep',
}

// Shift-left review: the exit review-trio sweeps the whole phase diff at EXIT, but a chunk flagged
// reviewFirst/hard (the architecturally lock-in ones the entry plan names) gets a targeted
// security + correctness pass NOW — a HIGH found here surfaces before later waves build on it.
// Read-only agents; findings route to the orchestrator for triage, nothing is auto-fixed.
phase('Spot-review')
const SPOT_FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { loc: { type: 'string' }, issue: { type: 'string' }, severity: { type: 'string' } },
      },
    },
  },
}
const flaggedIds = new Set(chunks.filter((c) => c.reviewFirst || c.hard).map((c) => c.id))
const flaggedMerges = (integration.integrated || []).filter((m) => flaggedIds.has(m.id) && m.sha)
const spotResults = flaggedMerges.length
  ? await parallel(
      flaggedMerges.flatMap((m) => [
        () =>
          agent(
            `Spot-review the just-integrated chunk "${m.id}" of phase ${phaseId} — flagged review-first at entry. ` +
              `The diff is \`git diff ${m.sha}^1..${m.sha}\` on ${branch}. Security lens only: auth/session, data ` +
              `isolation/scoping, secrets, injection, sensitive data in logs (project gotchas in docs/PROJECT.md). ` +
              `This is a TARGETED pass on one chunk, not the phase exit review — be fast and specific; report findings or "none".`,
            { agentType: 'reviewer-security', label: `spot-sec:${m.id}`, phase: 'Spot-review', schema: SPOT_FINDINGS },
          ).then((r) => (r ? r.findings.map((f) => ({ ...f, chunk: m.id, lens: 'security' })) : [])),
        () =>
          agent(
            `Spot-review the just-integrated chunk "${m.id}" of phase ${phaseId} — flagged review-first at entry. ` +
              `The diff is \`git diff ${m.sha}^1..${m.sha}\` on ${branch}. Correctness lens only: logic errors, ` +
              `missed edge cases, broken invariants, error-handling gaps. This is a TARGETED pass on one chunk, ` +
              `not the phase exit review — be fast and specific; report findings or "none".`,
            { agentType: 'reviewer-code', label: `spot-rev:${m.id}`, phase: 'Spot-review', schema: SPOT_FINDINGS },
          ).then((r) => (r ? r.findings.map((f) => ({ ...f, chunk: m.id, lens: 'correctness' })) : [])),
      ]),
    )
  : []
const spotFindings = spotResults.filter(Boolean).flat()
if (flaggedMerges.length) log(`Spot-review: ${spotFindings.length} finding(s) across ${flaggedMerges.length} flagged chunk(s)`)

return {
  phase: phaseId,
  wave,
  chunkCount: chunks.length,
  integrated: integration.integrated,
  integrationFailed: integration.failed,
  gateSweep: integration.gateSweep,
  // Findings from the targeted post-integrate pass on reviewFirst/hard chunks — orchestrator triages
  // each into an immediate fix-chunk, a ledger line, or a backlog proposal BEFORE the next wave.
  spotFindings,
  // Chunks that integrated WITHOUT adopted tests (tester died or worked in the wrong tree) — cover before exit.
  testGaps: ok
    .filter((r) => r.testsCovered === false)
    .map((r) => ({ id: r.id, note: r.blockers || 'test agent died — author tests before exit' })),
  needsAttention: bad.map((r) =>
    r
      ? { id: r.id, verify: r.verifyDetail || r.verify, blockers: r.blockers }
      : { id: 'unknown', blockers: 'build agent died — re-dispatch from ledger' },
  ),
}
