# Production deletion worker — design only

No production connection, schedule, service, credential or infrastructure has been created. Do not run the local systemd unit against production or remove loopback gates. Approval and independent acceptance precede activation.

## Fit to this project

The app uses TanStack server functions for internal actions. Enqueue through a caller-authenticated function and database authorization; return **pending**, not completed. UI completion must come from durable job status. The current synchronous local path is retained for independent checks; changing production response/UI semantics is not implemented here.

The generated `src/integrations/supabase/cron-auth.ts` exists. A future managed POST callback under `/api/public/jobs/deletion-tick` must call `authenticateCronRequest` before work. Before creating or changing any schedule, inspect it using structured schedule tools and preserve unmanaged callback authentication. None were contacted in this task.

Managed callbacks time out after a few seconds: they cannot run the existing endless loop or entire office cleanup. A bounded tick must finish within a measured callback budget, or acknowledge only a durable handoff to an approved non-root worker on an existing trusted host. No fire-and-forget processing after response. No new vendor/host is selected or provisioned.

## Least-privilege identity

- SQL executor: dedicated non-owner, non-superuser, non-BYPASSRLS, non-CREATEROLE principal. Schema USAGE and only reviewed queue claim, scoped path-page, renewal, failure, status metrics and finalization RPCs; no table DML, TRUNCATE, CREATE, deletion_scope access or role inheritance. Functions have fixed search_path and verified narrow owners.
- Storage identity is a separate problem: SQL RPC grants do not narrow a service Storage key. Use an approved scoped delete-only storage adapter that validates durable job/attempt/lease and office-prefix paths. If only a broad service key is available, isolate it in this adapter server-side, expose no arbitrary paths/buckets, and document residual broad credential authority. Do not claim a least-privileged Storage credential exists now.
- Only application authorization can enqueue. Worker cannot fabricate user requests or broaden office/customer permissions. No service key in client code, VITE variables, responses, logs or source. Hosted private credentials are not obtained or requested from the user.
- Existing-host option: dedicated OS User/Group, UMask 0077, empty capabilities, read-only code, restricted network to approved endpoints, protected external secret file and restart supervision. Never root. The current local unit is a test-only artifact, not this production configuration.

## Bounded execution and recovery

1. Atomic bounded claim with SKIP LOCKED; discover through RPC, not direct full-table reads. Freeze scope and keep deterministic cursor/progress. Limit batches and work per tick by measured wall-clock budget.
2. Explicit network deadlines, cancellation, SQL lock_timeout and statement_timeout shorter than lease margin. Local HTTP calls now have 30-second limits; this is **not** a suitable hosted callback budget.
3. Renew lease using database time, current running attempt and unexpired lease. Renew before batches/checks and stop destructive work on renewal failure. Scope/path/progress RPCs should also validate attempt. Independent tests must include slow operations, expiry and competing executors.
4. Use office-before-job ordering for operations that need both; NOWAIT office locks in row guards convert inversions to retryable 55P03 instead of waiting in cycles. Transaction rollback retains job snapshot. Retry 55P03/40P01/timeout safely, with bounded backoff and jitter; ordinary write errors must be shown for retry, never converted to success.
5. Ambiguous finalization response: read durable receipt before retry/announcing success. Jobs remain quarantined until verified completion. Persistent provider failures stay pending; retries cannot guarantee an unavailable provider recovers.
6. Stop/restart: supervisor restarts exits, watchdog detects hung heartbeats, cancellation bounds shutdown, expired leases are reclaimable. Database state is the source of truth, never process memory.

## Monitoring and approval gates

Expose authorized sanitized metrics: heartbeat, last successful tick, oldest pending age, attempt/retry count, expired leases, lock conflicts, failure class, progress and completion latency. Alert on no progress or repeated failure; log no file paths, customer data or keys. Database schema may need heartbeat/progress columns and narrow monitoring RPCs; not implemented.

Before activation: approve target/runtime/cost limits and worker/Storage identity; complete an independent real Auth/Storage rebuild; test real overlapping sessions, partial file failures, expired leases/restarts, shared-account preservation, budget exhaustion and cleanup. SQL privileges, generated scheduling and runtime-duration support must be checked in that independent environment first. Production requires separate approval and reviewed migrations, not direct application of local-only overlays.