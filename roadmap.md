# Security completion
- [x] Prevent removing or demoting the last office administrator.
- [x] Restrict employee task updates to status and notes, preserving system timestamps.
- [x] Run isolated database regression tests and verify the deployed guards.
- [x] Report limits of real two-office and employee verification: isolated tests passed; live two-office/employee and concurrent-session checks remain unverified because those accounts/offices are absent.