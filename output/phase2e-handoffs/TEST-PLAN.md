# Reviewed Phase 2E execution plan

27 October 2026. Owner delegated the scope decision for amendment/contractc84c709;
the parent chose that exact scope and retained the exact wording/digests separately.
Parent read actual handoff codec/hash/predicate/reducer/view and recovered-mission
predicate, their store/replay/schema7 integration and registry title provenance.
Fresh schema7 SQL is schema6 plus
`CREATE TABLE handoffs (id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`.
Existing schema1–6 logic remains version-separated; no migration or new writer.

One accepted handoff atomically creates task/title/queued assignment/eight held
units/lineage; predecessor is closed observed failure with known terminal effect,
fresh successor, Leader actor, roster target, no prior edge, lifetime10/100 limits.
Recovery mission paths are iterative with cycle detection over validated bounded
history; all tasks must be closed, assigned, and covered by successful terminal
paths. No failed state/effect is rewritten. Existing schema5–6 strict predicate is
retained. Shared-ledger exact retry precedes state/capacity/fence; handoff has no
write-fence exemption. Normal planning/approval/claim/report still gate new work.

Retain158 baseline tests; add22 cases: exact roots; atomic creation/title; grammar/
role/shared namespace; ineligible predecessors; FIFO/busy target/approval; filtered
views; successful multi-step chain plus ordinary work; unsuccessful chain states;
schema6 strict completion;10 handoff lifetime;100 assignment lifetime; known completed/
abandoned predecessors and no effect/attempt reuse; stop; recovery fence; actual
SQLite abort; eight-versus-nine unit capacity and recovered mission at event1000;
tamper; injected accepted bypass; four before/after handoff and recovered-mission
COMMIT crash variants. Shared fixtures use actual private SQLite stores and fixed
independent witnesses. No fake store or model pass substitutes for execution.

Fixed mock-host adds schema7 factories and handoff bound to Leader in coordinator
code. Existing missionComplete operation is reused; no new host/executable, wire
actor selection or transport. SDK abort instrumentation restores exec in finally.
Children retain10-second operation and5-second verified owned teardown. Build first,
capture source/tests/compiled/runtime and installed native hashes before execution.
Node26.7.0 Windows x64 ABI147 remains pinned. Source/test changes require fresh
parent review/preflight. Full suite420-second aggregate, build/boundary60 seconds,
incremental raw streams under.git. Seal counts only matching retained TAP stdout.

Full Phase2E exit remains separate. No provider/UI/terminal/network/MCP, automatic
takeover/retry/succession, hostile in-process isolation, whole-host/power-loss,
throughput, Electron/WSL ABI, migration/reset or release qualification follows.
