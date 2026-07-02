# Ideas inbox

A lightweight capture point for stray ideas — the pre-backlog funnel. When a thought lands mid-phase ("we should X someday"), it goes here as one small file instead of derailing the phase, getting lost in a chat scrollback, or prematurely becoming a backlog row nobody vetted.

**How it works**

- One idea = one file: `docs/ideas/<slug>.md` (slug-named, no shared counter — safe to write from any session, even mid-phase, with zero collision risk).
- Capture via the `submit-idea` skill ("/submit-idea", "note an idea: …") or by hand. Shape: a title, 2–5 sentences of what/why, and an optional "smells like phase N" hint.
- **Never auto-promoted.** Ideas graduate only when a human reviews them — typically at a phase boundary: promote to a [`BACKLOG.md`](../BACKLOG.md) row (with a real target phase), fold into an upcoming phase doc, or close with a one-line reason (edit the file; don't delete it — the trail is the point).
- The inbox is allowed to be messy. The backlog is not — that's the difference between them.

**Template**

```markdown
# <Idea title>

**Captured:** <date> · **Context:** <what prompted it>

<2–5 sentences: what it is, why it might matter, any constraint worth remembering.>

**Maybe:** <phase N / post-MVP / someday>
```
