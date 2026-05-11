# Terminal Payment Status Fixes

  ## Objective
  Fix three merchant terminal/settings issues reported after live payment test.

  ## Issue 1 — Terminal stuck on "payment processing"
  active-transaction query has NO refetchInterval — relies entirely on SSE.
  If SSE is missed, terminal freezes.
  Fix: add refetchInterval: 3000 when status is processing/pending, false otherwise.
  Apply to both merchant-terminal.tsx and merchant-terminal-mobile.tsx.

  ## Issue 2 — Tick animation + ding sound on success
  When currentTransaction.status transitions to "completed":
  - Play Web Audio API chime (880Hz to 1100Hz, fade out) — no audio files needed
  - Show animated green tick overlay (full-screen, 2.5s auto-dismiss)
  - Apply to both desktop and mobile terminal

  ## Issue 3 — Notification settings toggle failing
  VAPID keys not set — generate and store as secrets.
  Show graceful fallback in settings.tsx if keys missing.
  