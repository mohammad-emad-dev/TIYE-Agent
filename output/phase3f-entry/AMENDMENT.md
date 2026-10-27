# Proposed internal Phase 3F amendment

27 October 2026 — owner decision pending.

After the Phase 3E exit at `6a11f79`, permit the fixed offline Leader-coordination
profile in [CONTRACT.md](CONTRACT.md). It adds `get_team_status` and a restricted
`delegate_task` that queues one already-created task for one roster member.
Only the private API adapter/loop packages may change. Core/mock-team production
code, schema7 and existing event/replay rules remain unchanged.

Permit implementation through a separate Phase 3F exit after parent review of
actual source and a source-bound preflight, using existing owned real-core/witness
fixtures and the fixed scripted transport. Preserve all 454 accepted tests and
historical evidence. No new dependencies or executable composition are admitted.

No task creation, arbitrary instructions, multi-recipient delegation, scheduler
start/approval/claim/dispatch, automatic retry, handoff, answer, mission completion,
provider/network/credential/MCP integration, generic or rejecting-stop adapter,
file/command effect, durable conversation recovery, UI, migration or release is
admitted by this package. Existing independent profiles retain their permissions.

## Owner decision

[Architecture 11.2](../../architecture/TIYE-Agent-Architecture.md) says changed
scope or newly reachable effects require a new decision. The [Phase 3E exit
decision](../phase3e-exit/decision.json) ends that exception. This package exposes
a new durable inbox write through model tools, so it requires a decision against
this amendment and linked contract at their pushed revision before coding.

Retain the owner's response, proposal revision and artifact hashes before
implementation. Delegate reports and proposal verification grant no construction
permission. Provider, native-integration and release gates remain HOLD.
