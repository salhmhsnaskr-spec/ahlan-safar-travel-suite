# Ahlan Safar — independent schema reconstruction, phase 1

Status: application-schema reconstruction verified in an empty PGlite database; full local Supabase reconstruction NOT verified. This is not integration acceptance.

## Isolation and source

The snapshot was extracted through read-only PostgreSQL catalogs on 2026-10-30 (source PostgreSQL 17.11). No application rows, users, passwords, API keys, connection strings, sequence current values, role passwords or hosted identifiers were exported. `schema-catalog.json` records definitions and ACLs, not data. The private documents bucket configuration is configuration-only metadata, not a file or customer record.

Existing root `supabase/config.toml`, Drizzle migrations/journal, application code and tests remain untouched. Do NOT replay the incremental Drizzle history after this baseline: its final effects are already included.

## Files and ordering

Run the six files in `supabase/migrations` in filename order only against a fresh independent local Supabase instance:

1. `20261030000100_prerequisites.sql`: required extensions and a passwordless NOLOGIN compatibility role.
2. `20261030000200_tables_types.sql`: 12 enums, 15 tables, 190 columns, 2 identity sequences, exact table/column grants and RLS activation.
3. `20261030000300_constraints_indexes.sql`: 54 constraints and all indexes not automatically created by constraints (32 total indexes).
4. `20261030000400_functions.sql`: all 29 current public functions, owners and function comments.
5. `20261030000500_triggers_policies.sql`: 30 application triggers, 47 public policies and 3 application storage policies.
6. `20261030000600_permissions.sql`: exact function, schema and default privileges.

`manifest.json` gives counts and SHA-256 hashes. `supabase/config.toml` is an independent, unlinked local project configuration, with email confirmation enabled, seed disabled and a private 20 MiB documents bucket.

## Offline schema-only verification

From the project root:

```text
bun integration/local-schema/validation/check-schema.mjs
```

Uses the already-installed PGlite and real pgcrypto/uuid-ossp extensions. It creates a fresh in-memory database, applies all six migration files, compares catalog definitions and ACLs with the captured source, verifies all app tables are empty and closes the database. It does not connect to hosted Cloud, set auth claims, create any user or exercise business operations. `validation/managed-dependencies.sql` supplies empty Auth/Storage dependency shells solely for compilation; NEVER apply it to a Supabase instance. PostgreSQL 18 catalogs represent NOT NULL separately; those entries are excluded from the constraint comparison because all 95 NOT NULL flags are compared independently through columns.

The result is written to `validation/result.json`. Sequence counters restart at their configured initial values; production counter values are intentionally not copied.

## Not yet verified / not cloned

- Supabase-managed `auth`, `storage`, `realtime`, `vault`, extension internals and their migration histories are provided by the independent Supabase platform, not recreated from hosted system catalogs. Only application storage policies and required dependency signatures were extracted. No public views, additional rules, application event triggers or extended statistics were found; no public publication membership was found.
- Full Auth/Storage service startup, fresh-instance baseline grants, platform-version compatibility and local bucket provisioning are unverified until a real local Supabase reset is authorized and available. The configuration has not been validated by a running Supabase CLI.
- pg_stat_statements and supabase_vault were inventoried but not separately installed: platform-managed monitoring/vault are not required by the application functions. No vault content was read.
- Role login attributes, memberships and passwords are not exported. `sandbox_exec` exists only as NOLOGIN to preserve catalog ACL definitions; it cannot provide a session.
- SQL functions were installed and definitions matched exactly; PL/pgSQL runtime paths and real sessions were not executed. No claim of working email, concurrency, RLS runtime or integrated performance is made.
- No service catalog rows or owner assignments are seeded: the requested export is structure-only.

Before a future full-stack rebuild, obtain approval for the independent runtime. Do not run `supabase link`, hosted `db push`, the Lovable migration tool or any reset against the current project. This phase adds no GitHub Actions and starts no full integration environment.