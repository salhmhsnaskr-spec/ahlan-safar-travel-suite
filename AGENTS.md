<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All app pages talk to the `DataApi` interface (src/lib/data/api.ts); demo mode uses a localStorage implementation and the real app a per-office cloud implementation, so both render identical screens and demo data never reaches the database.
- Every office-owned table carries `office_id` and is isolated by RLS via `is_office_member` / `is_office_admin` security-definer functions; roles live only in `office_members`.
- Services with `office_id IS NULL` are the shared base catalog; offices extend it with their own rows instead of hardcoded enums.
- Bookings and tasks are their own office-scoped tables linked by foreign keys (never copies of customer/service data); a shared trigger rejects cross-office references and employees may only change task status/notes — keeps office isolation and roles enforced in the database, not just the UI.
- Legacy `requests.booking_ref/booked_at` are deprecated and only read once to backfill `bookings`; new code must use `bookings` so there is one source of truth.
- Membership removal and demotion must preserve an office administrator through a database trigger that locks the office and a remaining administrator row; this prevents orphaned offices across direct updates and RPC upserts.
- Employee task guards use an allowlist comparison across the whole row, with timestamps maintained by the database; newly added columns remain protected by default.
- Security trigger regression tests execute preserved security SQL fixtures in isolated PGlite transactions; this retains coverage when remix migration history is cleared without modifying cloud records, but does not replace live RLS or concurrency tests.
- Remixed migration sets start empty; let the migration tool generate journal and snapshots on the first new schema change rather than replay copied migrations against inherited tables.
- A "transaction" is a `requests` row; service-specific fields live in `requests.service_details` (jsonb) defined per service code in src/lib/transaction.ts — avoids a parallel transactions table and keeps bookings/tasks/documents linked via request_id.
- Reports, notifications, and transaction details use the shared ReadState gate for all required reads; errors precede loading and empty-state calculations, so failed reads never become zero counts or missing records.
- Umrah: a pilgrim is a `customers` row, an Umrah request is a `requests` row (service code `umrah`), group trips live in `umrah_trips` and each pilgrim-in-trip in `umrah_participants` (unique per trip, own status and planned/actual dates); keeps pilgrim, request and trip separate without duplicating customer data. Stay-duration rules live only in src/lib/umrah.ts.
- Platform owner role lives only in `platform_owners` (read-own policy, no app write grants); granted via server-side SQL. Owner stats come only from the security-definer `platform_stats()` which raises for non-owners — so no office or client can read cross-office totals.
- Office memberships are created only by `create_office` or the atomic `accept_invitation` RPC; invitations store only a sha256 token hash, and membership rows are never deleted but set to `suspended`/`removed` so access checks (`is_office_member/admin` require `active`) cut access instantly while historical attribution survives.
- Employee activity reads are actor-scoped in DataApi and RLS; team last activity is aggregated across the full office log by an admin-only RPC, never inferred from login or a capped list. Staff history uses retained memberships and profile identities.
- Office service management is admin-only in both the shared screens and database policies; service and partner catalog reads remain available for transaction entry.
- Work attribution is stamped from auth.uid() after employee task guards; current terminal-state attribution is cleared on reopening and replaced only on a new terminal transition, so historical events cannot inflate completion counts.
- Audit values use an explicit safe-field allowlist and retain changed field names without free text, service details or document paths; immutable actor-name snapshots supplement retained profiles, and historical attribution is never backfilled without evidence.
