# Phase one acceptance — draft "Phase one acceptance tests" (2026-11-02)

Status: STOPPED at step 2. No acceptance case was executed. Phase one is NOT ready for approval.

## 1. Independence (proven, read-only)
- drafts--list: draft reports "its own test database; data changes stay in this draft".
- Database host 127.0.0.1:8004 (local to sandbox); API at 127.0.0.1:8001. SUPABASE/VITE/EXPO project IDs all differ from `ryayzuzfemcmfjrzzwpy`.
- auth.users: 2 generated demo accounts (demo@example.com, viktor@example.com); none of the 4 production accounts.
- storage: private bucket `documents` exists with 0 objects (production has 7).
- 15 public tables present, cloned from the hosted schema (schema already exists; the six reconstruction files are therefore not re-applicable as-is).

## 2. Applying overlays — blocked
- Dry run of the 7 overlay files in one transaction with ROLLBACK (nothing kept) failed: `permission denied for function _invite_hash`.
- The sandbox connection role `sandbox_exec` is not superuser, has no role memberships and cannot `SET ROLE postgres`, so it cannot change ownership-bound functions, grants or policies.
- The only privileged path is the Lovable migration tool, which records migrations that are applied to the live app on draft acceptance. That contradicts the rule that overlays stay outside managed migration paths, so it was not used.

## 3–4. Not run
Isolation, employee read, colleague edit/delete, edit/delete permission split and invalidation on reassignment, self-promotion, last admin, full customer deletion with Storage files, worker failure/retry, customer-only lock, concurrency, TRUNCATE/direct access, backup+restore: NOT executed. No test accounts were created. No production connection, publish or accept.

## What removes the blocker (owner decision)
A. Approve applying the overlays via the migration tool in this draft, AND commit to never accepting this draft (delete it afterwards), or
B. An independent Supabase project you own where a privileged connection is available.
