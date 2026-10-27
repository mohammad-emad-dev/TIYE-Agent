# Phase 3C contract: one bound report_result tool

## Composition and authority

Baseline a0b9805 has 311 accepted tests. Extend packages/api-adapter and
packages/api-loop only. Preserve their current read-only factories, schemas,
tool refusal, outcomes and all accepted cases. Reporting requires a distinct
explicit trusted factory/profile; the existing read-only bridge gets no writer.
Core and mock-team production source, schema7 and event/replay semantics stay fixed.

A trusted coordinator binds one session, member and existing assigned task before
starting a reporting conversation. At most two distinct members/loops in one
session and one assigned task per loop. The binding is immutable and unavailable
for model selection. Validate actual assignment ownership/session, task identity
and active session at binding and immediately before dispatch. A loop cannot
switch task mid-conversation or act as Leader/owner/scheduler.

Only a small report bridge receives the bound member report capability. It may
use the existing checked snapshot/context readers and member.report command.
No raw store, member/owner/scheduler handle, database path, effect proof or approval
handle enters loop data, transport input, frames, transcript or subscribers.
Boundary checks confine this capability and reject other writers/imports.

## Closed protocol and bounds

The reporting profile accepts report_result with arguments exactly
{status: 'done' | 'failed', summary: bounded nonempty text}. Use the core's existing
256 Unicode scalar / 1024 UTF-8 byte summary ceiling and reject invalid Unicode
and NUL. Model-supplied task/session/member/command/effect/permission fields,
extra fields, unknown versions/tools and mixed or parallel tool turns refuse.
The trusted bridge supplies team.task.report/version/commandId/sessionId/taskId;
the bound member supplies actor identity through the existing core API.

Keep canonical UUIDv4 call IDs, original request/run/turn/generation context and
complete validated transcript plus independent verified local close before tool
dispatch. Preserve the legacy text and read-only context profile behavior.
Reporting conversations may use get_my_context and report_result sequentially,
with at most two total tool attempts, at most one report attempt, three requests
per run, two runs and six requests per adapter lifetime. A report is last among
tools: its following continuation must end in text or failure, with no further
tool dispatch. Call IDs are unique across tools within a run. Reserve before
invocation; stop/failure/rejection never refunds a report attempt.

Keep 8 messages / 32 KiB canonical history, 64 KiB received per run, 64 retained
events, 16 subscribers and eight metadata checks per run. Request and cleanup
limits remain 10 and 5 seconds. Core calls are synchronous; elapsed checks detect
overrun after return and provide no native-call preemption guarantee.

## Durable report semantics

Generate a private command ID and canonical command before invoking the bridge.
Reserve its single dispatch before calling member.report. Never regenerate an
ID or resend a report after rejection, exception, timeout, stop or lost reply.
The bridge returns only a detached validated receipt containing callId,
commandId, taskId and decision accepted/rejected. No synthetic success result.
Each successful return must agree with actual core command/assignment state.

Use unchanged core eligibility: done requires independently settled completed
effect evidence and an active session; failed follows existing terminal-effect
rules. A model report cannot settle an effect, claim an attempt, bypass a blocked
question, free an uncertain reservation or complete a mission. A fresh rejected
report remains a durable rejected command, not a successful task result.

Append call and receipt only after the bridge returns a validated known decision.
Feed that exact receipt into the actual next scripted request; the fixed backend
must inspect it before producing a reply. Surface report acceptance/rejection
separately from conversation completion. A rejected report may receive one text
continuation but cannot claim task success or issue another report.

An accepted task report remains durable if continuation creation fails, final
text is malformed or stop later wins. Conversation text completion cannot imply
an accepted report, and no success text may erase a rejected/uncertain decision.
After any thrown or overrun report call, do not append a known receipt or send a
continuation. Fence the loop with report uncertainty even if transport cleanup
is locally verified. Preserve consumed IDs, attempts and previously known state.
The trusted test coordinator may inspect/reopen actual core state afterward;
inspection is not an automatic retry, fabricated acknowledgement or loop resume.

## Stop and storage ordering

Reuse the owned queued pump and non-awaited observer isolation. No writer is
called inside an adapter subscriber. Immediately before report dispatch check
the bound active session and reserve identity/budget with no await/yield gap.
The trusted coordinator commits core stop then fences the loop in finally even
when the stop write throws. A stop winning before report causes zero report calls.
If a report return won first, keep its receipt and durable core outcome but send
no continuation after fencing. A previously dispatched continuation stays counted
and is aborted once; unknown local cleanup remains needs_attention.

Inject actual SQLite abort before commit and lost reply after commit in reviewed
fixtures. Preserve actual ledger/projection differences: rollback leaves no report
command; lost reply can leave a committed accepted or rejected command. Both
produce uncertain loop reporting without a resend. Measure synchronous overrun
as failure/uncertainty; never qualify it by silently extending a deadline.

## Execution and exit evidence

Only existing fixed owned witness fixtures may prepare/settle disposable task
effects. They are trusted setup, distinct from the report bridge and model tools.
No new process composition/runner or modification to existing worker code.
Fixtures dispose pumps/adapters/timers/listeners before store/root cleanup.

Before first execution pin all affected source/tests/compiled outputs, the
Node26.7.0 Windows x64 ABI147 runtime and existing native dependency hashes.
Publish finite cases and aggregate budget, retain incremental raw streams and
failed attempts, preserve historical source/artifact seals and all 311 tests.

Required cases use the actual schema7 core and fixed transport: proven done and
terminal failed reports; rejection without proof; blocked/foreign/closed task;
forged arguments/binding; wrong/duplicate/late call IDs; malformed/mixed/unclosed
tool turns; one report and total quotas; read-only factory refusal; exact receipt
in actual continuation; durable state after failed continuation; real SQLite
abort and lost commit reply for accepted/rejected commands; stop before/after
report and after continuation dispatch; synchronous subscriber stop; unchanged
other members/tasks; reopen/replay of durable accepted/rejected results; no retry;
disposal and explicit uncertainty even when transport cleanup is verified.

Exit maps only the report_result subset of Architecture 4.2 and the fixed offline
loop portions of 5.1/5.3. It ends this exception and grants no subsequent scope.
Providers, complete member tools, durable conversation recovery, automatic task
dispatch, files/commands, authentication, UI, packaging and release remain open.
