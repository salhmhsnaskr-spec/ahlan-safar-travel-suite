# Permanent cascade deletion — local implementation and verification

Date: 2026-10-31 UTC. **Partial implementation/verification; not release acceptance.** No production connection, hosted migration, real-account use, publishing, GitHub push, new resource or paid runner was performed.

## Delivered locally

- Customer closure includes customers, requests, bookings, tasks, documents and Umrah participants, including documents/tasks linked indirectly through requests/bookings. Associated entity audit events are erased. A shared Umrah trip and another customer's data are retained.
- Office closure additionally removes trips, invitations, memberships, office services, partners, office activity and the office. Shared base services, profiles, authentication accounts and platform-owner assignments are NOT erased: these are global identities that may belong to other offices. There is no new employee-account deletion capability.
- Office permission: the office's active administrator or existing platform owner, as clarified by the user. Customer permission preserves active-member deletion, but employees cannot cascade-delete protected bookings/tasks or someone else's documents/files; an office administrator must execute those closures. This restriction is about authority, not merely the presence of children.
- A durable job stores entity IDs before file removal. Failed/ambiguous removal or finalization leaves pending state, attempt count, a non-sensitive error and retry deadline; no success is returned. The worker resumes pending/expired-lease jobs with bounded backoff, no retry-count cutoff. Attempt fencing prevents stale finalization.
- Storage removal uses the Storage API in batches; each attempted path is checked with Storage `exists`, then checked against the Storage catalog and checked again inside the final database transaction. Office removal enumerates the complete office prefix, including objects without document metadata, with deterministic pagination. Only the current `documents` bucket exists in this model.
- While pending, writes to the office's app tables and authenticated Storage uploads/updates are frozen with office locks. Finalization deletes child-first in one transaction. Immutable audit/membership/last-admin exceptions require a private transaction-scoped entry; no user-set claim/GUC bypass, disabled trigger or RLS deactivation is used.
- Completed receipt retains only a random operation ID, type, timestamps/counts/status; customer/office/user IDs and entity data are cleared.
- All new live entry points refuse non-loopback URLs or missing opt-in before authorization/network calls. **New customer/office cascade is intentionally unavailable against the current hosted backend.** Existing single-document deletion retains canonical file-first handling.

## Files

New application modules:
- `src/lib/data/permanent-deletion.ts`: scope/gate and orchestration.
- `src/lib/data/permanent-deletion.functions.ts`: local-only authenticated entry point.
- `src/lib/data/permanent-deletion.server.ts`: local Storage adapter, finalization and retry queue processing. Uses a separate local-only credential name, never a hosted service credential fallback.

Changed application files:
- `src/lib/data/api.ts`, `cloud.ts`, `demo.ts`, `context.tsx`: customer/office DataApi operations and demo cascade.
- `src/lib/data/deletion.ts`: removed obsolete no-dependent customer rule.
- `src/components/pages/customers.tsx`: only confirmation copy changed to disclose irreversible cascade; no layout redesign.
- `src/test/deletion.test.ts`: revised gate checks, existing document regressions retained.
- `src/test/permanent-deletion.test.ts`: new orchestration/demo checks.

Independent preparation:
- `20261031000900_permanent_deletion.sql` in this directory: jobs, permissions, freeze, begin/claim/fail/finish and catalog helpers; **not applied to production**.
- `retry-deletions.ts`: standalone local retry worker; **not started**.
- `permanent-deletion.config.ts`, `permanent-deletion.test.ts`: isolated SQL regression checks.
- Root `AGENTS.md`, `roadmap.md` and project requirement memory updated.

The captured six baseline files remain unchanged and their SHA-256 hashes matched during the new SQL checks. Earlier ACL/RESTRICT overlays remain separate; the new child-first finalizer works after both. No managed migration was created or applied. Earlier reports/tests remain historical, not current cascade acceptance.

## Observed checks

- 24/24 targeted application tests passed: 14 adapted/document checks plus 10 new cascade/orchestration checks. Storage failure → retained pending job → subsequent retry success; false-success rejection; other-office path rejection; database-finalization retry; loopback gating; demo customer/office erasure.
- 7/7 new PGlite SQL checks passed against the six-file baseline plus independent overlays: customer/office child-first cleanup, another office retained, Storage catalog object prevents completion, pending writes/direct deletion blocked, persisted retry deadline/stale attempt refused, client finalizer/scope ACL denial and absent-identity rejection. Transactions rolled back; database closed.
- Browser demo: externally blocked requests, `/demo/customers`, normal confirmation accepted, customer count 5 → 4, remaining requests reference retained customers. Screenshot inspected. This is demo evidence only.
- Latest available automatic build result: build OK.
- The prior 92-test suite, deep security scans and report exports were not rerun.

## Not proved / blockers

1. Docker/Podman and an independent running Auth/Storage platform are unavailable. PGlite dependency shells and fake Storage transport are **not genuine identity, RLS API, physical-storage or concurrency proof**. SQL tests insert test-only job fixtures as the local database owner, do not spoof `auth.uid()` or create auth accounts.
2. Authenticated admin/employee/platform-owner begin-RPC paths, four actual sessions, revocation, real Storage failure/recovery, real overlapping uploads/job requests, lease recovery across worker restarts and complete independent cleanup have NOT run.
3. Retry driver is prepared but not running; automatic retry cannot be claimed active until the independent worker is launched. Persistent failure can never be guaranteed to resolve; the scope stays pending/frozen rather than falsely complete.
4. Freeze protects normal app/table writes and authenticated uploads. A privileged Storage writer or superuser can bypass RLS; the independent environment must exclude all privileged upload writers except this cleanup worker. No full-platform race proof is claimed. Trigger installation in managed Storage schema is deliberately avoided.
5. Historical customer files with already-lost metadata cannot reliably be attributed to a customer: the legacy filename contains an office UUID, not a customer UUID. Whole-office prefix erasure covers those office orphans; customer erasure cannot safely guess ownership. Backup/provider retention and erased external copies are outside this app's active-record/object deletion.
6. Office deletion has no new visible button: it is prepared through DataApi/server operation, since no office-delete screen existed and no interface design change was requested. It is not an end-to-end verified user flow.

## Independent execution prerequisites (not executed)

Use a fresh, unlinked local platform and no copied project `.env`; apply the six immutable baseline SQL files, the least-privilege overlay, optional existing RESTRICT overlay and new permanent-deletion overlay. Configure all browser/server/auth endpoints to the same loopback local instance. Supply only freshly generated local keys, including `LOCAL_DELETION_SERVICE_KEY`; opt in using `LOCAL_PERMANENT_DELETION=1` and browser `VITE_LOCAL_PERMANENT_DELETION=1`. Register/confirm independent accounts through the official local Auth/mailbox flow. Start the standalone worker only there. Test actual Storage failures and retries, two-office isolation, roles and concurrent operations, then destroy the entire temporary instance. This document is not permission to apply anything to hosted production.

**Stopped for review. Local preparation works under the tested limits; the requested real independent integration acceptance remains blocked and incomplete.**