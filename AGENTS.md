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
- Security trigger regression tests execute the production migration in isolated PGlite transactions; this verifies database behavior without modifying cloud records, but does not replace live RLS or concurrency tests.
