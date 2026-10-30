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
- [ ] Batch 3: immutable audit, trusted actor attribution, completion/reopening rules and historical identity — in progress with user approval; no production record writes or publishing.
- [ ] Batch 4: verifiable performance reports — waiting for review of batch 3.
- [ ] Batch 5: full live security tests — waiting for review of batch 4.
- [x] 4 safeguards added to plan.
