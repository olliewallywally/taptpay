---
name: data-persistence-topology
description: "Two-DB topology (helium dev vs Neon prod), durable uploads in uploaded_files, automatic pg_dump backups — investigated & fixed 2026-07-13"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7e19adf9-0fc5-4e4e-898b-4f0655fd8d53
---

Investigated 2026-07-13 ("nothing may be lost on reset/update"). **Topology:**

- **Production** (taptpay.co.nz, autoscale deployment) uses the **Neon cloud DB** — `NEON_DATABASE_URL` secret (`ep-mute-grass-af2foouy…neon.tech/neondb`, PG 16.14). Durable, external — app resets/deploys can NOT wipe it. Code never references NEON_DATABASE_URL; the deployment's own DATABASE_URL must point at it (user should confirm in Deployments → Secrets — not visible from the workspace).
- **Workspace dev** uses Replit's local **helium** DB (`DATABASE_URL=…@helium/heliumdb`, PG 16.10, sidecar at 172.24.0.3, unreachable from deployments). Replit forked it from Neon ~end of June 2026 (identical info_pack_leads up to 2026-06-30 in both); since then dev writes go to helium only → the DBs have diverged (helium ahead with dev/test rows). Replit rollbacks ("Restored to…" commits) can reset helium — hence backups.
- Seeding is guarded (bails if any merchant exists); prod exits(1) without a DB (no silent MemStorage); merchant auth is DB-backed (no session store). Merchant IDs live range is 22–32, not 1..n.

**Fixes shipped (commit `a3be013`):**
1. **Uploads → Postgres.** Logos + invoice docs were multer diskStorage under `uploads/` — wiped every deploy (ephemeral FS). Now `uploaded_files` table (path unique, mime_type, bytea data), multer memoryStorage, served by `GET /uploads/:folder/:name` from DB (same URLs, disk fallback for legacy). Table created via explicit SQL on BOTH DBs (never db:push — see [[db-schema-drift-fk-sequences]]) + additive CREATE IF NOT EXISTS on boot in index.ts. Existing 2 files migrated to both DBs. Verified E2E (upload → DB row → byte-identical fetch, nothing on disk).
2. **Backups.** `scripts/db-backup.sh` pg_dumps helium + Neon to gitignored `db-backups/` (keep 20 each); runs on every dev-server boot + daily (index.ts, dev-only). pg_dump 16.10 compatible with both.

**Still open:** confirm deployment DATABASE_URL secret; consider Neon PITR/retention; db-backups/ lives only in the workspace (single point of failure if the whole workspace is lost).

Related: [[dev-server-single-instance]], [[audit-2026-07-12-security]].
