# Phase 2A: durable stop for undispatched session work

23 October 2026 — component qualification; complete engine still in progress

The coordinator can now stop the immutable session in one SQLite transaction.
Queued tasks and planned effects are cancelled together, their reservations and
unused event budgets close, and assignment history remains available. New
enqueue/start and raw approval/claim cannot revive this work. Exact command
redelivery returns its recorded result, including after restart or at capacity.

The active session retains its one-event stop reserve. Stop can commit as event
1,000; afterwards no new event can be appended. Missing/stopped-session commands
reject only with unreserved capacity available. Rejected traffic cannot consume
the active stop slot. There is no new database/table, migration or writer.

See the [package contract](../../packages/core/README.md#logical-stop-of-undispatched-session-work)
and [reviewed test plan](TEST-PLAN.md). Assignment `closed` is event-derived;
closed rows remain counted toward the lifetime ceiling of 100 assignments.

## Review and evidence

GPT-6 Luna/max returned a supplied-design review. Flint 40B Free and DeepSeek
V4.1 Flash Free/max both failed before returning a verdict. The
[review record](review.json) stores outcome/digest summaries and parent responses.
These reports are design input; actual code and tests were reviewed by the parent.

The review pinned atomic all-session traversal, owner/type/version-bound hashes,
ledger-first redelivery, capacity refusal semantics and retained lifetime history.
The suggestion about replaying approvals does not apply to the existing raw
approval API, which has no command ID and refuses cancelled effects.

[Preflight](preflight.json) records reviewed source/test/compiled hashes, installed
dependency/prebuild hashes and runtime before execution. [Verification](verification.json)
records build, import boundary and complete real SQLite/process checks. Nine
new tests extend the unchanged 68-test baseline. They cover mixed-work closure,
admission/retry rules, rollback, tamper refusal, the full-capacity stop slot and
fresh host crashes before/after actual COMMIT. Raw captures remain local.

Run `rtk proxy python -X utf8 -B output/phase2a-stop/verify.py` to check the current
source/artifact hashes, recorded approval and frozen historical evidence against
its qualifying Git revisions. The Phase 1B historical root README alone uses its
recorded Windows CRLF checkout reconstruction. A reviewed rerun uses `capture.py`
and must be resealed from retained TAP output before publishing.

clean-code-guard: 0 new blockers; existing bounded full-history replay/projection
rewrite remains flagged without throughput qualification. test-guard: real SQLite
and fixed owned hosts, with SDK COMMIT/trigger injection only at the persistence
boundary. docs-guard: current package/root/architecture claims match this component;
historical sealed reports are preserved.

## Remaining work

Assigned execution stays blocked. Explicit member reports, interrupted-attempt
recovery, stop of dispatched/uncertain work and the full Phase 2A exit matrix
remain. This stop reducer deliberately refuses any dispatched assignment instead
of releasing an uncertain reservation. Existing approval covers the remaining
bounded work. Provider/native integration and release remain **HOLD**.
