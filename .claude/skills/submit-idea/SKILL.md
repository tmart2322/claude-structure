---
name: submit-idea
description: Capture a stray idea into the docs/ideas/ inbox as one slug-named file — without derailing the current phase or prematurely creating a backlog row. Use when the user says "/submit-idea", "note an idea", "capture this thought", "add to the ideas list", or drops a "we should X someday" mid-task. NOT for work already scoped to the current phase (that's a ledger/backlog concern) and NOT for bugs found in built code (those are findings/FB-n).
---

# Submit idea

Capture one idea into `docs/ideas/<slug>.md` (see [`docs/ideas/README.md`](../../../docs/ideas/README.md)), then get back to whatever was happening. This is a **capture** tool, not a triage tool.

## Procedure

1. **Distill** the idea from what the user said: a title, 2–5 sentences of what/why (keep their intent, tighten the prose), any constraint they mentioned, and — only if they said or strongly implied one — a "maybe phase" hint.
2. **Slug it** — short kebab-case from the title (`parent-referral-codes.md`). If the file exists, the idea probably isn't new: append a dated addendum to the existing file instead of creating a near-duplicate.
3. **Write the file** using the template in `docs/ideas/README.md`. One idea per file; if the user dumped three ideas, that's three files.
4. **Commit is optional** — mid-phase, leave it uncommitted-safe (slug files never collide) or fold it into the next natural commit; don't create a dedicated commit ceremony for a two-line idea unless asked.
5. **Confirm in one line** ("captured → docs/ideas/<slug>.md") and return to the interrupted work. Do **not** start designing the feature, do not add a backlog row, do not touch the roadmap — promotion is a human decision at a phase boundary.
