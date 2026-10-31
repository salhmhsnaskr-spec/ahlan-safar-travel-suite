# Local-only release blocker repair — 2026-10-31

## Status

Source changes prepared and 25 new focused offline checks passed. **NOT applied to hosted Cloud; NOT independent real-session acceptance; NOT ready-to-publish evidence.** No production connection, migration tool, GitHub write, publishing, paid service or real customer operation occurred. The prior 92 tests and prior eight ACL checks were not rerun.

## Source repairs

- `src/lib/data/cloud.ts`: document deletion reads the canonical office-scoped row rather than trusting the supplied path/uploader, checks the intended admin/uploader rule, removes the file, checks absence, then deletes the row. Storage errors, uncertain absence and denied/failed row deletion throw errors instead of reporting success. The row survives failed cleanup so its path is available for a manual retry. A retry can finish row deletion when the object is already missing.
- Upload stores metadata before uploading, eliminating the old insert-failure compensation that could lose the only file reference. Failed or interrupted uploads can leave a metadata row without a file; that row is intentionally retained for explicit cleanup, and the failure message says the upload did not succeed. No pending-state column or background cleanup worker was added.
- `src/lib/data/context.tsx`: refresh document reads after failed/partial operations so retained rows are visible.
- Customer deletion checks requests, bookings, tasks, documents and Umrah participants and refuses if any exist or any read fails. It scopes deletion to the current office and requires a returned deleted row. Demo mode uses the same no-dependent rule, without cascading deletion. Customer confirmation no longer promises automatic deletion of requests.

## Separate, unapplied SQL

These files are **outside managed migration paths**; do not apply them to production under this authorization. On a future approved independent local instance, apply after the immutable six-file reference baseline, in this order:

1. Existing, unchanged `20261030000700_least_privilege.sql`: reuse the coordinated ACL package, rather than duplicate it. It removes client membership DELETE and identity/status UPDATE privileges, allows only role UPDATE under existing RLS, blocks physical deletion/identity mutation via a trigger, retains last-active-admin safeguards and restricts table/function/sequence/default grants. Status changes continue through `set_member_status`; acceptance through `accept_invitation`. This file already existed; no new production membership fix was deployed.
2. New `20261031000800_customer_delete_restrict.sql`: changes four customer foreign keys (requests, bookings, documents, tasks) to RESTRICT. Existing Umrah customer FK is retained. This prevents direct customer DELETE and concurrent dependent inserts from silently cascading past child permissions or file cleanup. It preserves data rather than providing an automatic cascading deletion service.

No new table, widened privilege, user role, auth/storage managed-schema change or modification to the captured baseline was made.

## Checks performed

- `bunx vitest run src/test/deletion.test.ts`: **14/14 passed**, mocked transport only. Checks each customer dependency, fail-closed reads, admin/uploader rules, canonical path, Storage failures, uncertain deletion, retry ordering, row failure and preventing upload when metadata insert fails.
- `bunx vitest run --config integration/local-schema/security/release-blockers.config.ts`: **11/11 passed**, fresh in-memory SQL fixtures only. Executes the new FK SQL and exact existing membership identity trigger body; checks five customer dependencies, four immutable membership identity fields, physical deletion denial and non-identity transitions. No JWT, auth.uid substitution or real auth session.
- Automatic preview compilation: latest observed entry **build OK** after source fixes.

## Still unapplied / untested

- Hosted permissions, membership protections and customer FKs are **unchanged**. Local preflight alone does not close direct API bypass, RLS-hidden children or concurrent inserts; the separate SQL remains a necessary approval/application step.
- No real Auth/Storage execution, four-session test, suspension test, last-admin concurrency, invitation acceptance concurrency or live end-to-end deletion was run. Fixtures do not prove these.
- File deletion and database deletion are not an atomic transaction. Metadata may point to an absent file after interruptions; it is retained for retry, not presented as a verified upload. Concurrent upload/delete of the same metadata, privileged/manual direct document deletion, and previously orphaned files are not solved by this minimal client change. No background reconciliation or orphan inventory was run.
- Real Storage list/remove behavior (including missing-object retries and network outcomes), signed URLs already issued, platform compatibility and the entire independent platform remain unverified.
- Existing financial/runtime gate and Vercel deployment-evidence blockers remain outside this change.

**Conclusion:** source-level deletion repair and a separate membership/ACL/FK preparation are complete within this scope; production security risks are not claimed resolved, and publishing acceptance is not granted.