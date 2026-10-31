# Deletion follow-up — four points

2026-10-31 UTC. Local files only; no hosted SQL, production access, GitHub push, publishing or paid resources.

## 1. Office deletion in the application

- Added `/app/office`, linked as «إدارة المكتب» for office admins only, using the existing `DataApi.deleteOffice`. Employees see an unauthorized state on a direct visit.
- Owner dashboard now has a delete confirmation for offices. In the independent enabled instance an owner-only narrow RPC lists **all** offices, not only the ten recent rows; this remains usable when performance statistics are quarantined.
- Shared `OfficeDeleteControl` uses the existing confirmation dialog, prevents duplicate confirmation submissions, announces success only on completed deletion and refreshes/clears cached data. The existing server/database authorization remains the actual security boundary.
- Shared accounts/profiles are never deleted. Local opt-in/loopback gates remain unchanged: these operations cannot execute against the hosted backend.
- Signed-out `/app/office` was exercised with all external requests blocked and redirected to `/auth`; screenshot inspected. **Actual signed-in admin/owner deletion not proved**, because no independent Auth/Storage service is available.

## 2. Retry execution

- Reused `retry-deletions.ts` with an outer failure boundary: a temporary queue-read failure no longer terminates retries. It checks due work every two seconds; SQL retry deadlines remain exponential (2 seconds up to 256 seconds with the existing formula), and unexpired five-minute leases are excluded from dispatch. Failed operations retain their entity closure and retry state; expired leases can be reclaimed.
- Added `retry-loop.ts`, `start-retry-worker.sh` and `ahlan-deletion-retry.service`. The service starts on independent machine boot and restarts worker exits after five seconds. Shutdown signals stop the loop; forced termination leaves durable leases recoverable.
- The launcher clears inherited environment, refuses project-local environment files including symlinks, switches away from project `.env`, and loads only an explicitly supplied independent file. Local URLs and separate local credentials remain mandatory. The service restricts network addresses to loopback. No hosted cron/schedule was added or inspected.
- **Prepared, not installed/running here:** neither systemd nor Docker/Podman is available in this sandbox. This is a runnable supervision definition, not evidence that automatic retries are active.

### Documented independent-machine activation (not executed)

On an existing Linux machine with systemd, Bun on the service PATH and a separately running local platform:
1. Place the independent checkout at `/opt/ahlan-independent`, or update the two paths in the unit consistently.
2. Place independent-only environment configuration at `/etc/ahlan-independent/deletion-local.env`, permissions 0600; set `LOCAL_PERMANENT_DELETION=1`, the loopback `SUPABASE_URL` and freshly generated `LOCAL_DELETION_SERVICE_KEY`. Never copy the hosted project `.env` or credentials.
3. Apply the existing standalone baseline/security files and the new quarantine overlay to the independent instance only.
4. Install the unit under `/etc/systemd/system/ahlan-deletion-retry.service`, run `systemctl daemon-reload`, then `systemctl enable --now ahlan-deletion-retry`. Confirm with `systemctl status` and `journalctl -u ahlan-deletion-retry`; logs contain only generic retry messages, no keys or file paths.
5. Before real acceptance, prove platform readiness, boot startup, restart after forced worker termination, local-only traffic, actual failed-file recovery and complete test-instance teardown. If the runner lacks the unit's network-filtering support, do not assume its loopback sandbox is enforced.

## 3. Historical orphan files

Read source only, not production objects. Current cloud filenames encode an office UUID plus random ID/name, **not a customer ID**. Document metadata includes customer/request/booking links and is written before upload.

- Existing metadata + valid same-office relationships can attribute a file to the customer closure safely.
- A documented office UUID prefix can scope office cleanup, including office-prefix objects without document rows. Unknown or malformed prefixes and unknown customer attribution must not be guessed from filenames, uploader identity or similar names.
- Files whose historic document metadata was already lost cannot be assigned to a particular customer from the current format alone. They remain outside customer cleanup unless trusted records are recovered and reviewed; whole-office prefix cleanup covers only confidently scoped office files.
- Future coverage needs a persistent attachment manifest for every upload surface/bucket, recording exact bucket/path, office ID and customer/request/booking relationship before upload, protected by RLS and reference validation. Current documents already follow that principle; no speculative backfill or unknown-file deletion was added.

## 4. Failure sequence and quarantine

- Added independent SQL `20261031001000_deletion_quarantine.sql`: restrictive SELECT quarantine across office business tables and Storage reads, safe status RPC, and pending guards for SECURITY DEFINER performance/owner-statistics RPCs. Existing write freezes, job snapshots, Storage-first order and atomic child-first finalization are reused.
- Added `DeletionQuarantine` at the shared app layout for the independently enabled instance. It blocks descendants during status loading/error/pending, removes cached office data on pending detection, and revalidates the office route after completion/removal. Current membership identity remains available for role/status routing; only minimal deletion status and authorized control metadata remain accessible.
- Hence retained rows needed for retries are **not active user-visible records** when some files are already gone. RLS blocks direct normal business reads; status distinguishes pending from an empty office.
- Limits: previously issued signed URLs may remain valid until their existing expiry (document links use 60 seconds); already-downloaded data/browser copies cannot be revoked. Privileged writers remain outside RLS and must be excluded from the independent environment. No guarantee of recovery from a permanent provider failure is made: job stays pending/hidden, never falsely completed.

## Verification and remaining blockers

- **6 new checks passed:** one retry-loop recovery/clean-stop test plus five SQL quarantine tests (hidden pending rows, other office retained, durable snapshot, restrictive policy coverage, definer report denial, status/ACL boundary). PGlite uses owner fixtures and a test-only permissive read policy to isolate the restrictive rule; no identity claims were fabricated. This is not real Auth/API evidence.
- Shell syntax check passed. Signed-out route protection was checked. Latest automatic build: OK.
- Earlier successful 31/92 tests were not repeated; the five new SQL checks were rerun only after changing the new overlay to add all-office owner control.
- Full independent Auth/Storage, signed-in UI flow, actual supervisor boot/restart, real network filtering, real Storage failures, stale signed-URL behavior, overlapping connections and recovery across worker restarts remain **unverified**. Runtime unavailable; no production substitution.

Stopped for review. New file preparation completes the four code gaps under the stated limits; operational activation and real independent acceptance are not complete.