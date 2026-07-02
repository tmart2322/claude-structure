export const meta = {
  name: 'phase-exit',
  description:
    'Run the automatable exit-review gates for a phase: full-suite CI-mirroring verify (G2/G4-mechanical) THEN live validation + dogfood (G1/G5) — serialized because two concurrent test/stack runs contend on the same local resources (DB, ports) — while the tenet scorecard (G3/G4), correctness + security review lenses, and docs reconcile (G7) run in parallel alongside. Returns structured verdicts; the orchestrator records them into the exit review and drives the operator gates (G9-G11). Deploy a fresh build (deployer) BEFORE invoking this if the phase changed deployable code — validator assumes the target is current.',
  phases: [{ title: 'Gates', detail: 'verify→validate serialized; tenets / review / security / docs parallel' }],
}

// args: { phase, base?, head?, skipValidate? }
//   skipValidate: pass true when a green pre-UAT validation run already covered G1/G5 and the branch
//   tip is UNCHANGED since — the validate lane is skipped and its evidence carried forward. Any commit
//   after that run (FB fixes, remediation) invalidates the carry: re-run with skipValidate absent.
// Some harness paths deliver `args` as a JSON string — normalize before reading.
const A = typeof args === 'string' ? JSON.parse(args) : args || {}
const phaseId = A.phase
const base = A.base || 'main'
const head = A.head || `phase/${phaseId}`
const skipValidate = !!A.skipValidate
const range = `${base}..${head}`

phase('Gates')
const [verifyValidate, tenets, review, security, docs] = await parallel([
  // G2 + G4-mechanical THEN G1 + G5 — serialized in one lane: the full verify sweep and the
  // validator's booted stack contend on the same local resources (DB, ports); two concurrent
  // test runs can deadlock. The four read-only lenses run alongside.
  async () => {
    const verify = await agent(
      `Run the full CI-mirroring gate sweep for phase ${phaseId} via the gate-check skill (typecheck, lint, test, ` +
        `contract-verify if any, the project's check-* gates — commands in docs/PROJECT.md). Report each check pass/fail ` +
        `+ failing output, and name any CI-only check (boot-smoke, deployed e2e) you could not run locally. FAIL FAST: ` +
        `one clean run per check — never loop a check or wait out a hang (bound commands with a timeout); report and return.`,
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
    )
    // G1 + G5: live validation + dogfood, local-first then the real target.
    const validate = skipValidate
      ? {
          carried: true,
          note:
            'G1/G5 evidence carried from the green pre-UAT validation run — branch tip unchanged since. ' +
            'The orchestrator already holds those scenario results; do not mark G1 from this stub alone.',
        }
      : await agent(
          `Run gate G1 (validation scenarios) + G5 (dogfood / real-use) for phase ${phaseId}: drive every scenario ` +
            `in the Validation table of docs/phase-reviews/phase-${phaseId}-exit.md (seeded from the phase doc — read ` +
            `both) you can — locally first (the boot command in docs/PROJECT.md) and then on the real target — ` +
            `including the real end-to-end loop and headless browser flows for every UI surface this phase touched. ` +
            `Drive through the operator's own entry point to TERMINAL SUCCESS, not a mock or a seed-around. Diagnose + ` +
            `capture any failure as a finding; reserve blocked for irreducibly-human gestures only. The verify sweep ` +
            `has already finished — the local stack/DB is free. FAIL FAST: time-box each scenario — if one won't run ` +
            `or root-cause after bounded effort, capture it as a finding (best-guess cause + file) and move on; don't grind.`,
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
        )
    return { verify, validate }
  },
  // G3 + G4: tenet scorecard + design-tenet violations, on the actual diff.
  () =>
    agent(
      `Run gate G3 (north-star scorecard) + G4 (tenet violations) on git diff ${range} via the tenet-check skill. ` +
        `Read ALL the principle files: docs/NORTH_STARS.md (score 1-5 per applicable star BY NAME with evidence), ` +
        `docs/TENETS.md AND docs/ENGINEERING_TENETS.md (list every violation or "none" — checking only one tenet ` +
        `file is a named failure mode); ≤2 scores and partial-incompletes become backlog proposals.`,
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

const vv = verifyValidate || {}
return { phase: phaseId, range, verify: vv.verify, validate: vv.validate, tenets, review, security, docs }
