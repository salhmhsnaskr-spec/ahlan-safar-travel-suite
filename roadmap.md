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
- [ ] Platform owner dashboard (owner: decided email, server-side role).
