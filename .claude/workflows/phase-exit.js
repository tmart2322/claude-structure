export const meta = {
  name: 'phase-exit',
  description:
    'Run the automatable exit-review gates for a phase in parallel: full-suite CI-mirroring verify (G2/G4-mechanical), live validation + dogfood (G1/G5), the tenet scorecard + design-tenet violations (G3/G4), correctness + security review lenses, and docs reconcile (G7). Returns structured verdicts; the orchestrator records them into the exit review and drives the operator gates (G9-G11). Deploy a fresh build (deployer) BEFORE invoking this if the phase changed deployable code — validator assumes the target is current.',
  phases: [{ title: 'Gates', detail: 'verify / validate / tenets / review / security / docs in parallel' }],
}

// args: { phase, base?, head? }
const phaseId = args.phase
const base = args.base || 'main'
const head = args.head || `phase/${phaseId}`
const range = `${base}..${head}`

phase('Gates')
const [verify, validate, tenets, review, security, docs] = await parallel([
  // G2 + G4-mechanical: the full CI-mirroring sweep.
  () =>
    agent(
      `Run the full CI-mirroring gate sweep for phase ${phaseId} via the gate-check skill (typecheck, lint, test, ` +
        `contract-verify if any, the project's check-* gates — commands in docs/PROJECT.md). Report each check pass/fail ` +
        `+ failing output, and name any CI-only check (boot-smoke, deployed e2e) you could not run locally.`,
      {
        agentType: 'verifier',
        model: 'sonnet',
        label: 'gate:verify',
        phase: 'Gates',
        schema: {
          type: 'object',
          required: ['allPass', 'checks', 'ciOnly'],
          properties: {
            allPass: { type: 'boolean' },
            checks: {
              type: 'array',
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, pass: { type: 'boolean' }, detail: { type: 'string' } },
              },
            },
            ciOnly: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    ),
  // G1 + G5: live validation + dogfood, local-first then the real target.
  () =>
    agent(
      `Run gate G1 (validation scenarios) + G5 (dogfood / real-use) for phase ${phaseId}: drive every Verification ` +
        `scenario from docs/phases/phase-${phaseId}-*.md you can — locally first (the boot command in docs/PROJECT.md) ` +
        `and then on the real target — including the real end-to-end loop and headless browser flows. Drive through the ` +
        `operator's own entry point to TERMINAL SUCCESS, not a mock or a seed-around. Diagnose + capture any failure as a ` +
        `finding; reserve blocked for irreducibly-human gestures only.`,
      {
        agentType: 'validator',
        label: 'gate:validate',
        phase: 'Gates',
        schema: {
          type: 'object',
          required: ['scenarios', 'findings', 'blocked'],
          properties: {
            scenarios: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  state: { type: 'string', enum: ['pass', 'blocked', 'na'] },
                  evidence: { type: 'string' },
                },
              },
            },
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: { rootCause: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string' } },
              },
            },
            blocked: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    ),
  // G3 + G4: tenet scorecard + design-tenet violations, on the actual diff.
  () =>
    agent(
      `Run gate G3 (north-star scorecard) + G4 (design-tenet violations) on git diff ${range} via the tenet-check ` +
        `skill. Score 1-5 per applicable north star BY NAME with evidence; list every design-tenet violation or ` +
        `"none"; ≤2 scores and partial-incompletes become backlog proposals.`,
      {
        agentType: 'reviewer-tenets',
        label: 'gate:tenets',
        phase: 'Gates',
        schema: {
          type: 'object',
          required: ['scorecard', 'violations', 'tracked'],
          properties: {
            scorecard: {
              type: 'array',
              items: {
                type: 'object',
                properties: { northStar: { type: 'string' }, score: { type: 'number' }, evidence: { type: 'string' } },
              },
            },
            violations: {
              type: 'array',
              items: {
                type: 'object',
                properties: { tenet: { type: 'string' }, kind: { type: 'string' }, detail: { type: 'string' } },
              },
            },
            tracked: {
              type: 'array',
              items: {
                type: 'object',
                properties: { title: { type: 'string' }, phase: { type: 'string' }, severity: { type: 'string' } },
              },
            },
          },
        },
      },
    ),
  // Correctness + simplification lens.
  () =>
    agent(
      `Review git diff ${range} for correctness bugs then simplification, via the code-review + simplify skills. ` +
        `Watch the repo gotchas in docs/PROJECT.md (serialization across boundaries, retry idempotency, data-scoping).`,
      {
        agentType: 'reviewer-code',
        label: 'gate:review',
        phase: 'Gates',
        schema: {
          type: 'object',
          required: ['findings'],
          properties: {
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  loc: { type: 'string' },
                  desc: { type: 'string' },
                  severity: { type: 'string' },
                  confidence: { type: 'string' },
                },
              },
            },
          },
        },
      },
    ),
  // Security lens.
  () =>
    agent(
      `Security-review git diff ${range} via the security-review skill + the project's secret-scan: auth/session, ` +
        `data-isolation, webhook/signature verification, secrets, injection/SSRF.`,
      {
        agentType: 'reviewer-security',
        label: 'gate:security',
        phase: 'Gates',
        schema: {
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
        },
      },
    ),
  // G7: docs reconcile (+ contract versioning if the contract changed).
  () =>
    agent(
      `Run gate G7 for phase ${phaseId}: reconcile docs (status / architecture / future work) and, if a versioned ` +
        `contract/spec exists and changed, version it. Edit docs only; report what changed.`,
      {
        agentType: 'doc-syncer',
        label: 'gate:docs',
        phase: 'Gates',
        schema: {
          type: 'object',
          required: ['docsChanged', 'specBump'],
          properties: {
            docsChanged: { type: 'array', items: { type: 'string' } },
            specBump: { type: 'string' },
          },
        },
      },
    ),
])

return { phase: phaseId, range, verify, validate, tenets, review, security, docs }
