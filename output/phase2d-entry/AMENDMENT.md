# Proposed internal Phase 2D amendment

26 October 2026 — proposal; owner approval pending

Approve this addition to Architecture11.2 together with [CONTRACT.md](CONTRACT.md):
after the accepted Phase2C exit at1bbb391, permit internal synthetic task-failure
observations and durable Leader-visible notices on fresh schema6 roots. The trusted
owner explicitly records a matching started assignment's failure. Known terminal
or undispatched outcomes can close failed immediately; uncertain dispatched work
retains its slot until explicit existing witness reconciliation closes it failed.
Cancel only that task's pending question atomically. Reuse one SQLite writer,
event ledger/replay and the existing fixed owned core/witness test composition.

This implements the logical failure response subset of Architecture4.7. It adds
no process detector, timer/nudge, process termination, provider parser, network/MCP,
credentials, new runner, UI, Leader promotion, automatic takeover/reassignment,
real project/Git/export action, migration/reset or release. A synthetic observation
does not prove a process exited or revoke the member's identity.

Approval authorizes development through the Phase2D exit review. First execution
requires parent review of actual source/tests, compiled output and measured
runtime/native dependency hashes. Integration and release gates remain required.
The complete product scope and construction order otherwise remain unchanged.

## Why a scope decision is required

[Architecture11.2](../../architecture/TIYE-Agent-Architecture.md) says the current
exception “ends at the Phase2C exit review”. The accepted
[exit decision](../phase2c-exit/decision.json) records `newConstructionAuthorized: false`.
This proposal makes the next scope reviewable before coding. An explicit response
such as **Approve the internal Phase 2D amendment** approves this amendment and
its linked contract at their pushed revision. Record the exact response, revision
and artifact digests before changing engine source or architecture permission.
Model advice cannot grant authorization. Changed scope requires a new decision.
