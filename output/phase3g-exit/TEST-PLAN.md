# Phase 3G exit execution plan

Approved contract 6639d5e; implementation b1cc5c3. Parent review covers the fixed
handoff catalog codec, the Leader-bound handoff bridge, reserved successor and
continuation capacity, catalog detachment, stop ordering and the two boundary
cases below. Production stays byte-identical to implementation. Retain all 550
prior cases and append two real-core cases using existing fixtures and fixed
transport.

Case one refuses every ineligible predecessor state at construction: created,
queued, running, blocked, uncertain, done and failure-reported-without-notice
tasks each fail scenario admission before any adapter exists, with durable
state unchanged. Case two chains rehabilitation through actual core helpers: a
loop-created successor is started, failed with a closed notice and handed off
again, preserving both lineages with increasing handoff sequences while the
original predecessor stays failed and the second successor queues. Assertions
are outside isolated callbacks. Dispose pumps/scripts before store close/root
cleanup and reopen/replay actual state before cleanup.

Pin all four source/test inventories, compiled outputs, approvals, Node26.7.0
Windows x64 ABI147 and original native dependency hashes before execution.
Run three builds/four boundary checks and the full 552-test TAP suite at the
existing 1320-second limit. Request/read/write elapsed limit stays 10 seconds
and cleanup stays 5 seconds. Run each stage once; on failure preserve
incremental raw streams under .git, diagnose, record the correction and new
preflight before rerunning. No silent retry, hidden deadline extension,
disabled case or cleared uncertainty. No deadline extension, dependency,
provider, arbitrary/rejecting adapter, new runner, network, credential, UI or
migration is introduced. Rebuilds reproduce bytes.

Exit qualifies only bounded Leader handoff (one handoff_task) and prior fixed
offline behavior, partially mapping Architecture4.2/5.1/5.3. It ends the Phase3G
construction exception and grants no subsequent construction. Providers,
complete team tools, authenticated transport, durable conversation recovery,
file/command tools, UI, packaging and release remain unqualified.
