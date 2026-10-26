# Proposed internal Phase 2C amendment

26 October 2026 — proposal, owner approval pending

Approve this construction addition to Architecture11.2 and its linked
[contract](CONTRACT.md): after bounded Phase2B acceptance at95bd198, permit
internal implementation of an explicit Leader-bound mission-completion command
on fresh schema5 roots. Completion must prove every task in that root belongs
to a successfully reported closed assignment, then atomically record the mission
summary and close session admission. Reuse the existing synchronous SQLite writer,
ledger, replay and fixed owned core/witness test composition. Preserve schemas1–4
and their exact openers. No migration/reset, UI, provider/native CLI, terminal,
network/MCP, new runner, real project/Git/export action or release is admitted.

Approval authorizes development of this exact contract through its exit review.
First execution requires parent review of actual source/tests and source-bound
compiled/runtime/native preflight. Existing feasibility and integration gates
remain required before dependent integration; the complete product ships together.

## Why a scope decision is required

[Architecture11.2](../../architecture/TIYE-Agent-Architecture.md) says the Phase2B
exception “ends at the Phase2B exit review”. The accepted
[exit decision](../phase2b-exit/decision.json) records
`newConstructionAuthorized: false`. This proposal makes the next scope reviewable
before coding. A response such as **Approve the internal Phase 2C amendment**
approves this amendment and CONTRACT.md at their pushed revision. Record the exact
response, frozen revision and artifact digests before implementation. Model advice
cannot grant authorization. This proposal itself changes no engine permission.
