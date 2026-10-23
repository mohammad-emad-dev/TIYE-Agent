# Parent-reviewed execution plan: undispatched session stop

23 October 2026. The existing explicit Phase 2A approval authorizes this component.
The parent has reviewed actual `src/engine-stop.ts`, its store/replay integration,
assignment closure accounting, `test/engine-stop.test.cjs`, the fixed mock host
extension and unchanged root/process helpers before their first test execution.

## Composition and admission

Use the existing fixed Node core host only, protected disposable Windows roots,
pinned Node 26.7.0 Windows x64 and installed better-sqlite3 13.0.3 prebuild. The
capture checks dependency hashes against the first-core record, then records all
package sources/tests, current README/architecture, compiled files and this plan
before build/import-boundary/test execution. Raw streams stay under `.git`.
There is no new executable, generic runner, provider call, terminal, network,
credential route, real project operation or product Git/export capability.

The canonical stop DTO is exactly `{type:"team.session.stop",version:1,commandId,
sessionId}`. Hash: SHA-256 UTF-8 JSON of `["team.session.stop",1,"owner",commandId,
sessionId]`. Shared ledger lookup precedes session state/capacity; changed hash
refuses. Only an active session accepts. Unknown/stopped sessions reject durably
when unreserved capacity exists. No space means refusal before transaction.
Owner identity is fixed by the coordinator handle, not caller wire data.

One canonical event `{command,actor:"owner",result}` traverses all assignments
in that session, cancelling queued/planned work, closing assignments and setting
remaining budgets to zero. The session becomes stopped. History is retained.
Active-session stop reserve is one; stopped-session reserve is zero. Formula:
event count + remaining assignment budgets + unassigned legacy reserves + active
session stop reserve <= 1,000. Rejections cannot consume reserved slots. A stop
without assignments must commit at event 1,000. Every write uses the existing
event/command/projection transaction; assignment closure is derived by replay.

Assigned claim/cancel/settle/resolve mutations remain refused by replay. Stop
closure requires queued/planned work only, so this component cannot accidentally
release a dispatched uncertainty reservation. Approval checks and cancelled effect
state prevent revival. No automatic action occurs on reopen. Later interrupted
dispatch handling must extend stop without treating uncertainty as cancellation.

## Checks

Retain all 68 prior tests. Add nine tests covering:

- Mixed queued, waiting-approval and approved/planned work across both members:
  one stop closes all work, retains four assignments and survives reopen.
- New enqueue/start, raw planning, approval/claim/settle paths cannot revive work;
  exact earlier enqueue/start decisions still return their recorded result.
- Owner-only operation, canonical wire bounds, malformed UTF-8, duplicate fields,
  actor injection and shared command namespace conflicts refuse without writes.
- Missing-session rejection stays rejected after subsequent session creation.
- Real SQLite TEMP trigger abort during session projection insert rolls back
  earlier event/command/task/effect writes and every released assignment budget.
- Valid rejected task history fills to event 999 while keeping the stop slot;
  unrelated or wrong-target traffic refuses, stop commits as 1,000, exact retry
  works and new commands refuse at the hard limit.
- Tampered stop authority/result/target and materialized session/task states
  refuse reopen; no reset or repair.
- Two fresh-process crashes before/after actual stop COMMIT. A fresh host sees
  all original state or all stopped state, then redelivery commits exactly one
  decision. Owned child deadline is ten seconds; teardown verifies its handle's
  exit within five seconds. No persisted PID is adopted or killed.

Run the package build, source import-boundary check and complete Node test suite
through `capture.py` after parent acceptance. Verify identical reviewed sources
and compiled files after execution. Seal actual TAP counts and stream digests.
Any source/test change requires a fresh reviewed preflight and execution.

No whole-host crash, power loss, hostile same-user mutation, Electron/WSL ABI,
real provider action, dispatched-stop/recovery or complete Phase 2A exit is claimed.
