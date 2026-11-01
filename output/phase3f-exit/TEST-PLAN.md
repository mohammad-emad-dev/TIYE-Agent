# Phase 3F exit execution plan

Approved contract 8fef7ae; implementation 0b6e3c3. Parent review covers the fixed
coordination catalog/status codec, the Leader-bound enqueue bridge, reserved
continuation capacity, catalog detachment, stop ordering and the two boundary
cases below. Production stays byte-identical to implementation. Retain all 505
prior cases and append two real-core cases using existing fixtures and fixed
transport.

Case one stops from the run.finished observer of a completed coordination run.
The session is still active; this profile has no completed-session exception, so
the core stop is accepted and cancels the accepted queued assignment. The
conversation stays response_complete and the receipt stays accepted as the
historical acceptance, not a claim that the task is still queued. Case two
reuses the lost-acknowledgement fault to reach delegation uncertainty, then
proves the no-retry fence: a later run is refused by loop admission, no
continuation was sent, no receipt exists, and the durable accepted command
decision is not acknowledged to the terminated run. Assertions are outside
isolated callbacks. Dispose pumps/scripts before store close/root cleanup and
reopen/replay actual state before cleanup.

Pin all four source/test inventories, compiled outputs, approvals, Node26.7.0
Windows x64 ABI147 and original native dependency hashes before execution.
Run three builds/four boundary checks and the full 507-test TAP suite at the
existing 1320-second limit. Request/read/write elapsed limit stays 10 seconds
and cleanup stays 5 seconds. Run each stage once; on failure preserve
incremental raw streams under .git, diagnose, record the correction and new
preflight before rerunning. No silent retry, hidden deadline extension,
disabled case or cleared uncertainty. No deadline extension, dependency,
provider, arbitrary/rejecting adapter, new runner, network, credential, UI or
migration is introduced. Rebuilds reproduce bytes.

Exit qualifies only bounded Leader coordination (get_team_status and one
delegate_task) and prior fixed offline behavior, partially mapping
Architecture4.2/5.1/5.3. It ends the Phase3F construction exception and grants
no subsequent construction. Providers, complete team tools, authenticated
transport, durable conversation recovery, file/command tools, UI, packaging and
release remain unqualified.
