# Focused permanent-deletion hardening

2026-10-31 UTC. Local files and disposable databases only. No production connection, hosted SQL, external accounts/services, GitHub push or publication.

## Changed files and rationale

- `src/lib/data/storage-absence.ts`: explicit 404 absence; legacy 400 only with exact object-not-found message; 401/403/500/network/abort fail closed.
- `src/lib/data/permanent-deletion.ts`: document job kind and fenced renewal boundary before destructive batches.
- `src/lib/data/permanent-deletion.server.ts`: actual Storage absence classifier, 30-second composed HTTP deadlines, renewals during pagination/batches/per-file checks and before finalization, document enqueue adapter. Local-only gates retained.
- `src/lib/data/permanent-deletion.functions.ts`: authenticated local document path and member-role RPC wrapper.
- `src/lib/data/cloud.ts`: documents enter durable queue rather than direct Storage/row deletion. Hosted operations fail closed until separately approved activation; no unsafe fallback.
- `src/routes/_authenticated/app.team.tsx`: existing role selector uses authorized RPC instead of direct table update; layout unchanged. This new path is local-only pending approved hosted migration/activation.
- `20261031001100_deletion_hardening.sql`: standalone additive overlay after 007/optional 008/009/010. No captured baseline or managed hosted migration edited.
- `src/test/storage-absence-hardening.test.ts`, `deletion-hardening.test.ts/config.ts`, `lock-order.integration.mjs`: focused new verification.
- `src/test/deletion.test.ts`: obsolete direct-document assertions replaced with one durable path gate check; unaffected old checks skipped during this run.
- `PRODUCTION-WORKER-DESIGN.md`: design only, no scheduling or provisioning.
- `AGENTS.md`, `roadmap.md`: architecture and task status. Requirement memory records active-admin-only customer deletion and worker constraints.

## Implemented SQL behavior

1. Direct document DELETE revoked and trigger-blocked, even without a pending job. Authorized document deletion snapshots exact metadata, uses the existing Storage-first finalizer and clears only document-owned metadata/audit.
2. Customer begin requires active office admin. Platform-owner status alone is not added. Office admin/owner deletion remains unchanged.
3. `deletion_frozen` verifies authority, coalesces absent identity to denial, and does not lock office rows. Internal owner/service evaluation remains supported without granting clients privileged scope.
4. Finalization acquires office before job. Row-trigger office locks and last-admin guard use NOWAIT: conflicts abort with retryable lock errors instead of waiting in the office/row cycle. Ordinary writes may require user retry; they never report success on conflict.
5. `renew_deletion` accepts only matching running attempt with unexpired lease. Stale/expired workers cannot renew. Snapshot persists across failures and expired claims can be reclaimed.
6. Membership direct INSERT/UPDATE/DELETE and column role UPDATE revoked; `set_member_role` validates office admin and retains identity and last-active-admin triggers.
7. Previous 007 overlay clears PUBLIC/client direct, column, sequence/function and global/schema defaults. New preflight rejects unreviewed client role memberships, elevated attributes/table ownership, effective dangerous grants and additional default creators. It does not alter managed role memberships blindly. Service-role authority remains broad and is not described as least privilege.

## New verification only

- **11/11** browser-safe mock orchestration/classifier checks: remove then HEAD-404 response, exact object-not-found, other errors retain pending, lease failure stops removal, finalization lock error followed by successful retry.
- **1/1** new document gate check in the existing test file; eight unrelated checks skipped.
- **11/11** focused SQL/adapter checks: immutable six-file hashes match, complete overlays apply to fresh PGlite; direct document and membership denial; admin guard with mocked authorization dependency; unrelated-office denial without invented auth.uid; stale/current lease, busy claim/reclaim; document finalization boundary; last-admin guard; effective TRUNCATE/inheritance preflight; populated second-office shared identity and Storage-catalog preservation. One check exercises installed Storage SDK and actual adapter against fake HTTP responses, not real Storage.
- **1/1 real PostgreSQL lock scenario**: newly initialized disposable PostgreSQL 17 instance, Unix socket only, existing non-root OS UID 1000, two separate connections; production trigger body fails immediately with 55P03 under office-vs-customer row inversion, rolls back, then retries successfully. Minimal tables/dependencies, not complete application schema or authenticated sessions. Server stopped and temporary directory deleted. No account/service provisioned externally.
- **Total: 24 focused checks/scenarios passed.** Intermediate failures were corrected (test parameter name; NULL authorization predicate). Only new checks were rerun. Prior full suites/92 tests not run.
- Latest automatic preview build reports OK. No authenticated browser deletion flow claimed.

## Production worker — deliberately not implemented

Design proposes caller-authorized enqueueing plus durable status, bounded execution/handoff, dedicated SQL RPC-only worker role, separate tightly scoped Storage adapter, fenced leases, deadlines, watchdog and sanitized stuck-job metrics. Existing generated cron helper can authenticate a future managed POST callback; scheduling must use structured tools only after approval. Managed callback timeouts preclude the current whole-office loop. A trusted existing-host executor must run under a dedicated non-root identity, not the current root-default local unit.

No dedicated production identity, Storage credential restriction, monitoring tables, watchdog, callback or schedule created. Current local worker still uses broad independent service credentials. Local 30-second deadlines are not an approved hosted callback duration.

## Remaining independent acceptance blockers

- No independent full Auth/Storage environment or Docker/Podman available here. Local PostgreSQL lock test does not remove that blocker.
- Need official confirmed independent accounts/sessions for actual admin/employee/owner begin paths, membership RPC and cross-office account access after deletion; mocked authorization dependency is not a real role acceptance test.
- Need actual Storage partial-failure/absence/permissions tests, long-job renewal across processes, crash/reboot, concurrent upload/begin/finalization and job-monitoring tests.
- Historical customer files whose metadata was lost remain unattributable; no speculative deletion/backfill added. Office prefix cleanup remains limited to confidently scoped documents-bucket objects.
- Local SQL preflight may stop on actual managed role inheritance/default creators; review in the independent full platform before opening its API. No production privileges checked or changed.
- Invitation-preview quarantine bypass noted in prior audit was outside this focused request and remains; no blanket claim that every pending metadata surface is hidden.

**Not production-ready.** Local repair and focused verification completed; production execution remains design-only and requires separate approval, independent acceptance and reviewed production migrations.