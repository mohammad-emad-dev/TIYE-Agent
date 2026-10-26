# Proposed internal Phase 2E amendment

27 October 2026 — proposal; owner scope decision pending.

Approve this addition to Architecture11.2 with [CONTRACT.md](CONTRACT.md): after
Phase2D acceptance at2aa8abf, permit explicit Leader-directed recovery handoffs on
fresh schema7 roots. A closed observed failure can produce one fresh queued successor
task, linked atomically to its predecessor and assigned to an existing roster member.
The failed task/effect/history stay immutable. No old claim/attempt is rearmed.
Only explicit later scheduler/approval/claim/report steps may perform successor work.

Permit successful mission completion when every failed predecessor is covered by
an accepted bounded handoff chain ending in an explicitly reported successful
task. Preserve all original failures and notices; live/uncertain/cancelled or
uncovered failed work prevents success. This is a schema7 logical extension;
schema1–6 semantics/openers remain separate and unchanged.

Reuse one SQLite writer/ledger/replay and the existing fixed owned core/witness
composition after parent actual-source/test/compiled/runtime/native review. No
migration/reset, new runner, live detector, automatic retry/takeover, Leader
succession, provider/terminal/UI/network/MCP, real project/Git/export or release.
At most10 accepted handoffs and100 lifetime assignments per session. Construction
permission ends at the Phase2E exit review. Dependent integration gates remain.

## Why a scope decision is required

[Architecture11.2](../../architecture/TIYE-Agent-Architecture.md) ends the Phase2D
exception at its exit. The [accepted decision](../phase2d-exit/decision.json)
records `newConstructionAuthorized: false`. This proposal defines the changed
scope before coding. A response such as **Approve the internal Phase 2E amendment**
approves this amendment and CONTRACT.md at their pushed revision. Record the exact
response, revision and artifact digests separately before implementation. Model
advice does not grant authorization. This proposal changes no engine permission.
