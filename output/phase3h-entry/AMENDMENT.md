# Proposed internal Phase 3H amendment

8 November 2026 — owner decision pending.

After the Phase 3G exit at `96e0016`, permit the fixed offline Leader
failure-view profile in [CONTRACT.md](CONTRACT.md). It adds a restricted
`get_failures` read that returns the Leader-visible failure notices for the
bound active session from one fresh replay-checked projection: session,
task, member, reason, summary, observed sequence, reconciliation status and
closed sequence where present. Only the private API adapter/loop packages may
change. Core/mock-team production code, schema7 and existing event/replay
rules remain unchanged.

Permit implementation through a separate Phase 3H exit after parent review of
actual source and a source-bound preflight, using existing owned real-core
fixtures and the fixed scripted transport. Preserve all 552 accepted tests and
historical evidence. No new dependencies or executable composition are
admitted.

No failure observation or recording, task creation, handoff, delegation,
answer, mission completion, scheduler start/approval/claim/dispatch, automatic
retry, provider/network/credential/MCP integration, generic or rejecting-stop
adapter, file/command effect, durable conversation recovery, UI, migration or
release is admitted by this package. Existing independent profiles retain
their permissions.

## Owner decision

[Architecture 11.2](../../architecture/TIYE-Agent-Architecture.md) says changed
scope or newly reachable effects require a new decision. The [Phase 3G exit
decision](../phase3g-exit/decision.json) ends that exception. This package
exposes no new durable write — it adds one read-only projection of existing
failure state through model tools — but it adds a new tool surface, so it
requires a decision against this amendment and linked contract at their pushed
revision before coding.

Retain the owner's response, proposal revision and artifact hashes before
implementation. Delegate reports and proposal verification grant no
construction permission. Provider, native-integration and release gates remain
HOLD.
