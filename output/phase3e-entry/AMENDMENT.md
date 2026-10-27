# Proposed internal Phase 3E amendment

27 October 2026 — proposal only; owner decision pending.

After Phase 3D exit at 119b176, permit the bounded Leader mission-completion
profile in [CONTRACT.md](CONTRACT.md). Extend only the private API adapter/loop
packages. A narrow session/Leader-bound bridge may call the existing
member.completeMission API once and validate its actual durable receipt.
It may read the bound context and checked mission/command projections.

Keep fresh schema7 and core/mock-team production source unchanged. Retain all
402 accepted tests and historical seals. Use pinned runtime/dependencies, fixed
offline transport and only existing owned real-core/witness fixtures. Review and
pin actual source/tests/compiled outputs/runtime/native hashes before execution.
The exact permission covers implementation through a separate Phase 3E exit.

No provider/SDK/network/credential, arbitrary or rejecting adapter, MCP, new
runner/process composition, automatic approval/retry, task dispatch, file/command
effect, durable conversation recovery, UI, migration/reset or release is admitted.

## Owner decision

[Architecture 11.2](../../architecture/TIYE-Agent-Architecture.md) requires a new
decision for changed scope or newly reachable effects. The [Phase 3D decision](../phase3d-exit/decision.json)
ends its exception and grants no new construction. This proposal adds a
session-closing write and a narrowly guarded post-completion continuation.

An explicit instruction approving this amendment and linked contract at their
pushed revision admits this scope. Retain the response, revision and artifact
hashes before implementation. Delegate feedback and proposal verification cannot
authorize construction or open provider/release gates.
