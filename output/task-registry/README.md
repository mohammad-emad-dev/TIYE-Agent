# Shared task and synthetic effect registry

23 October 2026 — bounded internal core convergence

`TaskStore` now supports task creation, synthetic effect attachment and lifecycle
queries through one schema 2 store. It aliases the existing class and uses its
single command ledger, event log, exclusive SQLite connection and atomic projection
transaction. It does not merge old schema 1/2 roots or perform any migration.

## Implemented

- `execute(bytes)` uses the original strict task.create grammar, decision shape
  and canonical hash. Accepted task creation owns its immutable event-backed title.
  Rejected task-ID conflicts cannot replace a title or add a task.
- `planForTask(plan)` attaches one synthetic effect to an existing created task.
  Missing/non-created tasks and reused effect/attempt identities durably reject.
  Exact redelivery returns the original decision before checking current state.
- Creation, both planning paths and explicit resolution share one command ID
  namespace with type-bound hashes. Cross-entry-point reuse refuses without writes.
- `registry()` shows task ID, exact title, state and effect ID in accepted task
  insertion order. Legacy auto-planned tasks coexist with title `null`.
- Existing approval, one-time claim, witness reconciliation and explicit attention
  resolution update this same registry. No second writer, action or cache is added.
- New traffic uses the same event cap and cannot consume terminal capacity
  reserved for already admitted effects. Created tasks reserve no future effect slots.

The [package contract](../../packages/core/README.md) specifies the APIs and
hash encodings. Schema 2 tables remain unchanged; old readers refuse unfamiliar
`task.create`/`task.plan` events. Do not downgrade after using these entry points.

## Review and evidence

The [test plan](TEST-PLAN.md) records parent source review before execution.
[Preflight](preflight.json) pins source/test/compiled composition, runtime version
and installed dependency/prebuild digests. [Verification](verification.json)
records build, import boundary and real SQLite/process checks. Final test counts
are sealed from the retained TAP output matching its recorded digest.

[Review](review.json) distinguishes three supplied-design reviews from the parent
final code review. GPT-6 Luna/max, Flint 40B Free and DeepSeek V4.1 Flash Free/max
all returned feedback. Suggestions based on external JSON projections or
zero-event durable rejection were not adopted: these projections already live
inside SQLite transactions, and rejected decisions must remain replayable.

Checks include the accepted 34-test regression baseline, strict creation and title
preservation, canonical compatibility with CoreStore, a complete synthetic lifecycle
in one registry, rejected-command stability after task creation, shared command
namespace conflicts, global effect/attempt uniqueness, real SQLite abort rollback,
title tampering refusal and new traffic at the reserved-capacity boundary.
Fresh-process crashes before/after creation and attachment COMMIT recover one
decision/effect with an empty independent witness before claim/action.

Run `rtk proxy python -X utf8 -B output/task-registry/verify.py` from the repository
root to check sealed evidence and historical source snapshots. It does not rerun
effects. Earlier artifacts remain unchanged and are checked against qualifying
commits. The specific old Phase 1B root README digest is reconstructed using its
Windows CRLF checkout bytes; current source/artifact Git attributes preserve bytes.

An explicitly reviewed rerun may build then run `capture.py`; it creates a new
preflight and local capture and requires a new review/seal. Raw output and relay
reports remain local. Public records contain summarized verdicts and digests.

## Limits and next step

This is a bounded single-owner synchronous library, not a production orchestrator.
No migration, multiple-effect task workflow, retention expansion or throughput
claim is included. Fixture witness/approval remain trusted test-coordinator traffic.
Power loss, hostile mutation, shared worker-thread/reentrant calls, Electron/WSL
runtime and provider/real-action ownership remain unqualified.

Next is a concrete mock-team-engine construction scope and its entry review against
the approved architecture. The current internal exception does not itself admit
new process capabilities or provider execution. Native/provider integration and
release remain **HOLD**.
