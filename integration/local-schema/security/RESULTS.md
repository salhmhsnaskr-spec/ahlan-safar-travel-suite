# Unified execution result — 2026-10-30

Status: **partial implementation; final integration acceptance NOT achieved**.

## Implemented, without changing production

- Added `20261030000700_least_privilege.sql` outside both the six captured baseline migrations and hosted migration paths. Apply only to a fresh independent local instance, after the six reference files and before exposing its API.
- Removed anonymous table access and unnecessary client TRUNCATE/TRIGGER/REFERENCES/MAINTAIN grants. Authenticated CRUD matches current screens and existing RLS. No service-role credential read or copied.
- Restricted membership writes to the role selector; status transitions remain via the authorized RPC. Prevented identity replacement and physical membership deletion through an additional trigger. Preserved the existing locked last-admin guard.
- Removed client sequence resets; retained only authenticated USAGE for request/booking creation.
- Kept invitation metadata column grants, excluding `token_hash`. No views in the captured catalog. Reviewed every captured public RPC; only authorized creation/rotation returns newly generated plaintext tokens; no RPC returns invitation hashes.
- Reduced client function EXECUTE to the exact application/policy-helper allowlist; anonymous EXECUTE only on invitation preview. Trigger/helper/internal functions are not callable as client RPCs.
- Removed global and schema-local client defaults for tables, sequences and functions for both captured creators (`postgres`, `supabase_admin`). Future objects require explicit grants. Preserved service-role platform privileges; managed Auth/Storage schemas were not modified.
- Added statement-level TRUNCATE rejection for memberships and audit history. Owner/superuser ability to disable triggers is outside the client-security boundary.

## New files

1. `integration/local-schema/security/20261030000700_least_privilege.sql`
2. `integration/local-schema/security/least-privilege.test.ts`
3. `integration/local-schema/security/vitest.config.ts`
4. This report.

Existing files changed only to record the authorized safety scope, architecture isolation rule and current task/blocker. No existing source, baseline SQL, application screen, generated client, environment file, or hosted migration was replaced/deleted.

## Actual verification

Executed only `bunx vitest run --config integration/local-schema/security/vitest.config.ts`: **8/8 new tests passed**. Initially the default test include excluded the new folder; added a dedicated config, then ran successfully. The 92 previous tests and deep scan were not run.

The eight checks cover effective client table privileges; anonymous denial and request CRUD compatibility; invitation metadata vs hash ACLs; membership role vs identity/status/delete ACLs; exact RPC execution allowlist; schema CREATE and sequence reset denial; real creation of future objects for each local creator with default-denied ACLs; local owner TRUNCATE rejection.

The setup verifies all six reference SHA-256 hashes before applying them to an empty in-memory PGlite database, then compiles/applies the separate overlay. It uses managed dependency shells, does not authenticate any account or simulate JWT claims, and is **not** proof of PostgreSQL/Auth/Storage full-platform reconstruction, RLS enforcement with real sessions, trigger concurrency or end-to-end screen compatibility. Identity-trigger runtime transitions remain unverified.

## GitHub and exact blocker

- Connected the user's GitHub API for this conversation only; no credentials linked into the application.
- Read existing `salhmhsnaskr-spec/ahlan-safar-travel-suite`: public repository. Actions permissions endpoint returned 200: Actions enabled. Account reports Free plan.
- User billing usage endpoint returned **404**; attempted budgets endpoint also returned **404**. These responses do not prove zero usage, a zero budget, or an enforced paid-overage stop, and do not establish the exact reason for unavailability.
- Official GitHub documentation says standard hosted runners for public repositories are free/unlimited; larger runners can be billed even for public repositories. This narrows the intended execution choice but does not verify/configure the explicit account stop-spending condition requested by the user.
- Stopped at that mandatory financial-control gate rather than starting any run. No GitHub workflow created or dispatched, no repository/API write, no runner started, and no new paid resource requested. No automatic retry loop.
- Local Docker and Podman are unavailable; there is no independently started runtime available here as an alternative.

## Critical test results

| Requested acceptance | Actual status |
|---|---|
| Six reference files preserved and overlay SQL/ACL verification | Passed offline, 8 new checks |
| Rebuild independent PostgreSQL + Auth + Storage + mailbox | Not run |
| Four real accounts, confirmed email, login/logout, separate sessions | Not run |
| Cross-office access and user/role/office forgery | Not run with real sessions |
| Invitations, rotation, expiry and simultaneous acceptance | Not run |
| Admin/employee permissions, open-session suspension and removal/history | Not run |
| Last-admin suspension/removal/demotion including concurrency | Not run; existing guard retained, no new concurrency evidence |
| Four-actor request/booking attribution and reopening/recompletion | Not run |
| Database/audit/performance matching and actor-scoped activity | Not run |
| Private storage isolation, file access and 20 MiB limit | Not run |
| Runtime network block and zero production connectivity proof | Not implemented/tested; no runtime launched |
| Always-on runner/container cleanup | Not exercised; no runner/containers/test accounts created |

## Production and cleanup

No hosted database/auth/storage API used; no production secrets read; no existing accounts/offices/data altered; no publishing. Security SQL was applied only to a temporary in-memory database which the test closes. No independent full-stack environment existed to clean. Production was not queried for before/after fingerprints: do not misrepresent non-use as a measured catalog/data comparison.

**Production security grants remain unchanged** because altering them would contradict the explicit prohibition on changing the current database. The overlay is a tested local preparation, not a deployed production fix.

## Completion judgment

Not complete. Blocked on verified GitHub financial controls/access to establish the requested paid-overage prevention, followed by actual independent-runtime setup and the entire real-session test suite. No final security or publication acceptance claimed. No further task runs in the background after this response.

Reference: https://docs.github.com/en/billing/concepts/product-billing/github-actions