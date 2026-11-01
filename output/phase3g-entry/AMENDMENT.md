# Proposed internal Phase 3G amendment

1 November 2026 — owner decision pending.

After the Phase 3F exit at `5726ac7`, permit the fixed offline Leader-handoff
profile in [CONTRACT.md](CONTRACT.md). It adds a restricted `handoff_task` that
turns one eligible failed task into one new queued successor task for one roster
member under a bounded validated title. Only the private API adapter/loop
packages may change. Core/mock-team production code, schema7 and existing
event/replay rules remain unchanged.

Permit implementation through a separate Phase 3G exit after parent review of
actual source and a source-bound preflight, using existing owned real-core/witness
fixtures and the fixed scripted transport. Preserve all 507 accepted tests and
historical evidence. No new dependencies or executable composition are admitted.

No failure observation, task creation with free-form instructions, multi-recipient
handoff, scheduler start/approval/claim/dispatch, automatic retry, delegation,
answer, mission completion, provider/network/credential/MCP integration, generic
or rejecting-stop adapter, file/command effect, durable conversation recovery, UI,
migration or release is admitted by this package. Existing independent profiles
retain their permissions.

## Owner decision

[Architecture 11.2](../../architecture/TIYE-Agent-Architecture.md) says changed
scope or newly reachable effects require a new decision. The [Phase 3F exit
decision](../phase3f-exit/decision.json) ends that exception. This package exposes
a new durable handoff write through model tools, so it requires a decision against
this amendment and linked contract at their pushed revision before coding.

Retain the owner's response, proposal revision and artifact hashes before
implementation. Delegate reports and proposal verification grant no construction
permission. Provider, native-integration and release gates remain HOLD.
