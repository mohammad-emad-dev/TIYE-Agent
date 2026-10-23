# Phase 2A inboxes and FIFO planning reservations

23 October 2026 — planning component; full engine still in progress

Within the [approved Phase 2A scope](../phase2a-approval/README.md), the core now
persists per-member inboxes and atomically reserves a queue head with its synthetic
effect plan. No worker or model is dispatched by this component.

## Implemented

- Bound member `enqueue(bytes)` and `inbox()` operations; only the leader can
  successfully enqueue a created task for a roster member.
- Per-member FIFO by accepted event sequence, one active reservation per member
  and the configured global cap, including work awaiting approval.
- Coordinator scheduler `start(bytes)` commits the plan and reservation together.
  Exact redelivery returns the original decision before current-state/capacity checks.
- One shared command namespace, global task/effect/attempt uniqueness, durable
  semantic rejection and no direct raw planning bypass of assigned tasks.
- Eight reserved future events per admitted assignment, decremented for start and
  first approval, without double counting assigned effects in legacy reserves.
- Event-derived assignment/budget records in the same SQLite history; queued task
  views remain materialized and replay-checked. No queue database/table is added.

**Assigned dispatch remains blocked.** Claim/cancel/settle/resolve mutations cannot
bypass the pending engine stop/recovery/terminal controls. Approval changes only
the logical reservation's view and never releases its slot. `running` is not
proof that an action executed. Unassigned legacy mock effects keep their earlier
qualified behavior. Full result/stop/recovery and terminal release remain ahead.

See the [package APIs](../../packages/core/README.md) and exact
[source-reviewed execution plan](TEST-PLAN.md) for DTOs, hashes and admission rules.
The current immutable session and store-wide unique task IDs make assignment task
keys unambiguous. Capacity can refuse before the 100-assignment lifetime ceiling;
this component does not claim terminal release or subsequent ceiling reuse.

## Review and verification

GPT-6 Luna/max and Flint 40B Free returned supplied-design reviews. DeepSeek V4.1
Flash Free/max failed without a verdict. [Review](review.json) records report
digests, parent responses and final code/test/docs review. The model reports do
not constitute an audit of the implemented source.

Suggestions to exempt rejected appends from capacity, release slots on approval
or key commands separately by type were rejected: they would violate bounded
history, prevent safe occupancy tracking or weaken the shared command namespace.
The adopted safeguards include type-bound hashes, ledger-first redelivery, global
identity uniqueness and a hard distinction between planning and execution.

[Preflight](preflight.json) records the reviewed source/test/compiled composition,
runtime version and installed dependency/prebuild hashes before execution.
[Verification](verification.json) records build, import boundary and real SQLite/
process checks; counts are sealed from retained TAP output matching its digest.
Tests retain the accepted 55-test baseline and add FIFO/cap/role/namespace cases,
dispatch holds, true transaction abort, tamper refusal, capacity pressure and fresh
child crashes before/after enqueue/start COMMIT. Child bounds remain ten-second
operation plus five-second verified owned-handle teardown.

Run `rtk proxy python -X utf8 -B output/phase2a-inboxes/verify.py` for source/artifact
hash checks, approval binding and immutable historical snapshots. It executes no
engine action. The specific old Phase 1B root README digest is reconstructed from
its Windows CRLF checkout. Raw relay/test captures remain local; public records
contain only summarized verdicts/digests.

For an explicitly parent-reviewed rerun, build then run `capture.py`; it records
a fresh preflight and local capture and requires review/sealing before publishing.
The existing approval covers remaining work inside Phase 2A; no new owner decision
is required for those already scoped implementation steps.

## Next

Implement explicit result reporting and terminal reservation release, logical stop
and recovery, then qualify the complete Phase 2A exit matrix before enabling any
assigned action. No provider, native CLI, terminal, new executable, generic
dispatcher, MCP/network server, credential route, project/Git operation, export
or release is added. Native/provider integration and release remain **HOLD**.
