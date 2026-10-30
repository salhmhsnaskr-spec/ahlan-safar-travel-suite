# Security completion
- [x] Prevent removing or demoting the last office administrator.
- [x] Restrict employee task updates to status and notes, preserving system timestamps.
- [x] Run isolated database regression tests and verify the deployed guards.
- [x] Report limits of real two-office and employee verification.
# Data safety
- [x] Separate loading, failed reads, and empty results in reports, notifications, and transaction details with read-only retry.
- [x] Delete document record before its stored file (no dangling records).
- [ ] Live two-office/employee checks — blocked: needs a second account and office.
# Comprehensive task (phased)
- [x] WhatsApp support button in office sidebar.
- [x] Security approval / visit fields (save/reopen in real office untested).
- [x] Umrah trips/participants (demo verified; real-office save untested).
- [x] Platform owner dashboard at /owner (non-owner signed-in account test pending).
# Staff & performance system (plan pending approval)
- [x] Plan revised and approved.
- [x] Batch 1: invitations, roles, suspend/remove, last active admin guard.
- [ ] Batch 1 email delivery — blocked: needs sender domain from user.
- [x] Batch 2: employee office view, own activity, team last activity and member view; 28 isolated tests passed; real admin/team/profile and employee/direct-read/phone checks passed.
- [ ] Batch 2 live non-empty employee history and session revocation — not tested: employee has no recorded activity; suspension would change an existing membership. Covered with isolated fixtures only.
- [x] Batch 3: immutable audit, trusted attribution, completion/reopening and historical identity; 63 tests passed, real-office read-only history and demo transition UI verified; no existing work/member records changed and no publishing. Results: .lovable/phase-3-results.md.
- [x] Batch 3 live save/reload: separate new test office, one test customer/request/booking; creator/updater/completer/canceller matched session; repeated completion/reopening/recompletion/cancellation verified, 15 real audit rows; existing-office/profile fingerprints unchanged; no publishing. Report appended to .lovable/phase-3-results.md.
- [ ] Batch 3 live distinct-actor attribution — rechecked 2026-10-30: all three confirmed accounts have active real-office memberships; none verified as independent test-only. Needs four official, email-confirmed independent test accounts and isolated-office invitations. Empty office data does not establish test-only status. No account sessions minted, live writes, or publishing; waiting for user to supply accounts.
- [ ] Batch 3 live concurrent updates — not tested; distinct from the requested sequential four-actor verification.
- [x] Batch 4: filtered drillable staff reports, actor-scoped database snapshot, current completion/cancellation vs historical audit, CSV/print, historical unattributed; 74/74 tests and demo browser flow passed. No production account testing, data-row writes or publishing. Report: .lovable/phase-4-results.md.
- [ ] Batch 4 isolated real-auth integration — blocked: needs a Docker-capable isolated runner authorized once; current tests simulate Auth in isolated fixtures, browser verification is demo only.
- [ ] Batch 5: full live security tests — waiting for review of batch 4.
- [x] 4 safeguards added to plan.
