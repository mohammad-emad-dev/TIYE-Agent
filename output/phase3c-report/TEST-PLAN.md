# Phase 3C implementation execution plan

Owner continuation of the exact cd5ec2f proposal is recorded in phase3c-approval.
Parent review pins all four source/test inventories and all compiled outputs,
the Node26.7.0 Windows x64 ABI147 runtime and original native dependency hashes.
Only compilation has executed before this preflight. Core and mock-team
production sources and the 311 accepted test cases remain unchanged.

The explicit reporting factory uses closed report-loop inputs and paired
report frames/receipts. The sole writer bridge receives one trusted member and
task binding and only captures member.report plus checked readers. The loop
prepares canonical commands with private IDs and reserves before submitting.
Any thrown/overrun report remains uncertain despite known adapter cleanup.
Old read-only factories retain their request/parser and lack a report bridge.

Retain 311 cases and add 35 real-core reporting cases: done/failed/context-first
round trips and replay (3); unproven/blocked rejections and replay (2); forged,
mixed, duplicate, malformed, truncated and unclosed transcripts (10); post-report
tool refusals (2); deterministic stop barriers (3); synchronous continuation
admission stop (1); synchronous pre-report stop (1); continuation failures (2);
actual SQLite abort/lost commit reply crossed with accepted/rejected commands (4);
candidate/closure ordering (1); stale callbacks/lifetime bounds (1); invalid
bindings (1); read-only/closed codec refusal (1); two-member isolation (1);
already-created continuation stop (1); measured post-commit stall (1).

All integration cases use actual fresh schema7 core stores. Trusted setup uses
only existing fixed core witness helpers and their owned subprocesses, never a
new runner. No substituted store/reader, network, key, SDK or fake clock. The stall
case uses a real bounded 10025ms Atomics.wait after an actual COMMIT; it expects
uncertainty and claims no successful timing qualification for that operation.
SQLite prototype fault hooks are restored in finally. Stores and generated roots
are disposed only after loop pumps, adapter timers, callbacks and scripts finish.

Whole-suite ceiling: 960 seconds, the prior 780 plus 180 for 35 private real-core
cases, fixed witness setup and deliberate 5s cleanup/10.025s stall. Per-operation
10s request and 5s cleanup bounds are unchanged. Streams are incremental in a
fresh .git capture directory; failed attempts are retained without silent retry
or deadline extension. Rebuilds must reproduce reviewed compiled bytes.

Run three builds, four capability/import boundary checks and all four package
test globs. Expected total 346 tests, with none skipped/cancelled. Qualification
is bounded implementation evidence; separate Phase3C exit, provider integration,
UI and release remain pending.
