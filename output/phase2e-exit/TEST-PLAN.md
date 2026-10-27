# Phase 2E exit execution plan

27 October 2026. Frozen contractc84c709; delegated owner decision and implementation
48c0c4c. Parent reviewed actual handoff/missions codecs, predicates, reducer and
version-specific context, schema7/writer/replay/title integrations, role-bound
handles, recovery fence, FIFO and new assignment/terminal-reserve accounting.
Production source remains unchanged. Existing158 baseline plus22 implementation
tests are retained; add one maximum-depth integrated public-boundary SQLite case.

The new case accepts ten explicit recovery handoffs, failing each predecessor with
closed observation, then explicitly executes/reports the successful terminal task.
Successful mission completion leaves ten failed tasks and their history unchanged.
Read actual SQLite events after writer close to compare every lineage/FIFO sequence,
immutable title, Leader actor/decision and completion sequence. Verify no synthetic
task.create event was fabricated for successors. Reopen and exact retries of all
ten handoffs preserve snapshots/registry and independent terminal witness count1.
This checks maximum supported chain depth with event/title provenance together.

The full181-test suite retains root/role/byte/identity/lineage privacy, FIFO/global
cap, incomplete chain refusal, schema5–6 strict completion,10/100 lifetime limits,
stop/recovery/exact retries, eight-versus-nine unit admission, mission event1000,
SQLite abort/tamper/injected replay and four before/after actual COMMIT crashes.
Only existing fixed owned core/witness host composition and coordinator role
binding; no new executable or arbitrary member wire actor. Child10-second operation
and5-second verified owned teardown remain. Build before measuring compiled bytes;
capture source/test/runtime/native digests before execution and verify unchanged
source/compiled output afterwards. Node26.7.0 Windows x64 ABI147 remains pinned.
Retain incremental raw streams under.git,420-second aggregate suite and60-second
build/import checks. TAP counts require matching retained stdout digest. Any changed
source/test needs fresh review/preflight. Historical evidence stays frozen at its
qualifying revisions; no retrospective rewrite of source or inconclusive runs.

No migration/reset, live detector, automatic retry/takeover/succession, provider/
terminal/UI/network/MCP, hostile same-process isolation, whole-host/power-loss,
throughput, Electron/WSL ABI or release qualification follows.
