---
name: dont-report-peer-sessions
description: "Don't narrate what other concurrent Claude sessions are doing — raise it only when it actually blocks or changes the current work"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f78efb96-7578-4f4b-963e-2c10c8edd0e0
  modified: 2026-08-19T07:44:42.792Z
---

Oliver often runs several Claude sessions against `/home/runner/workspace` at once.
Do not report on what the other sessions are working on, and do not offer to
coordinate with them as a routine step. Stay on the assigned task.

Raise a peer session **only** when it materially impacts the work in hand — a
genuine file/index collision, or a decision of theirs that changes what I should
build. A one-line mention is enough; then carry on.

**Why:** told directly on 2026-08-19 — *"dont concern yourself with the other
things claude is doing. only bring it up if it will impact the work you are
doing."* Status reports on peer sessions are noise that displaces the actual
deliverable.

**How to apply:** it is still worth *checking* for collisions before staging or
committing (never `git add -A`; stage explicit paths, since the git index is
shared between sessions). Just don't turn the check into commentary.

Related: [[mobile-44px-rule]].
