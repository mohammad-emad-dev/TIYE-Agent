# Phase 3D contract: bound questions and actual-answer continuation

## Composition and authority

Baseline 972aa4d has 350 accepted tests. Extend packages/api-adapter and api-loop
through a distinct explicit question factory/profile. Keep existing text,
read-only and report factories, validators, outcomes and accepted tests unchanged.
Use fresh schema7 and existing pinned dependencies. No core or mock-team
production change, new runner or process composition.

A trusted coordinator binds one existing assigned task/member in one active
session. At most two distinct bound members/loops per scenario and one immutable
task per loop. Validate actual assignment/session/actor at binding and before
each operation. Only a narrow question bridge receives existing member.ask,
member.questions/context and checked snapshot readers. A reporting capability,
if used, retains the separately confined existing report bridge.

The model-facing tool is ask_leader for a non-Leader or ask_user for the actual
bound Leader. Derive role/recipient from the real core; wrong-role tool names
refuse before writes. Never accept model-supplied actor, recipient, task, session,
question ID, command ID, permission or capability. No writer/owner/member handle,
database path, effect proof or other member's questions enter model data.

The loop cannot answer/escalate/cancel a question, start/claim/settle an effect,
change slot accounting or complete a mission. Only the trusted fixture coordinator
may use existing Leader/owner answer/escalation and stop APIs. Escalation may be
observed through the same bound question; it does not grant the author new powers.

## Protocol and bounded operations

Question arguments are exactly {text, options}. Text and each option use the
existing core ceiling of 256 Unicode scalars / 1024 UTF-8 bytes, with invalid
Unicode and NUL refused. Options is a detached array of zero to three distinct
nonempty strings. Unknown/extra fields, wrong role/tool, mixed/parallel calls,
duplicate IDs and malformed context refuse before a write.

Keep UUIDv4 run/request/call IDs and original turn/generation binding. A tool
candidate requires whole-transcript validation and independent verified local
closure before dispatch. Generate private question and command IDs, prepare the
canonical team.question.ask command and reserve one attempt before invoking the
writer. Never refund or regenerate them after failure/rejection/stop/lost reply.

At most one question attempt per run, two total tool attempts and three requests
per run; two lifetime runs/six requests per adapter; two loops per scenario.
The question profile may use get_my_context, one role-appropriate question and
report_result only within those shared bounds. Existing report proof/uncertainty
rules still apply. A report remains the final dispatched tool of its run.
Before any ask write, require and reserve capacity for one further request, for
either an answer or rejection continuation. While waiting no other dispatch may
consume that capacity. Capacity reservation is not a dispatched request; count
the continuation only when actual adapter admission occurs. Refuse the ask
locally before its write if no continuation slot remains.

Keep eight messages / 32 KiB canonical submitted history, 64 KiB received per run,
64 retained observer events and 16 subscribers. This new question profile permits
at most ten controller metadata checks per run: three request admissions, two
tool attempts, four answer-read attempts and final acceptance. Setup validation
is outside the run; a bridge's internal fresh checks belong to its single bounded
operation. Existing profiles keep their eight-check limit. Reject an exhausted
resume budget locally without another read. No polling loop,
interval, background refresh, automatic re-ask or automatic continuation.

## Durable questions and waiting

Submit only the bound existing core question command. Core eligibility stays
unchanged: active session, owned open assignment, non-null effect in an eligible
state, one lifetime question per task and existing global limits. Accepted asks
block the task and retain its slot. Rejected asks remain durable rejected commands.
Neither model wording nor conversation completion changes that state.

Validate a known ask return against the actual command/question projections.
Expose a detached receipt with callId/commandId/questionId/taskId/decision and
the core-derived recipient. A rejected ask has no created question: do not infer
one, read an unrelated answer or wait for it. Its validated rejection may enter
one continuation with no repeat question attempt.

For a known accepted ask, retain the immutable pending call/receipt separately
from submitted history. Expose an explicit waiting_for_answer phase. Dispatch no
new request/tool while waiting. The run Promise remains pending and its bounded
in-memory state stays owned by the loop; waiting has no active adapter request,
I/O, background work or timer, so request/cleanup deadlines are not extended.
Explicit stop/dispose must release that pending run and owned resources promptly.

The question stays durable if the conversation closes or crashes. This slice
does not reconstruct a conversation after restart or resume an uncertain ask.
The core may retain a blocked task until its existing explicit answer/stop route
changes it; local loop failure must not fabricate core cancellation or free slots.

## Explicit answer delivery

Only the trusted coordinator invokes a closed resume input containing version,
resumeId UUIDv4, runId and questionId. This input carries no answer, recipient, actor or core
command. Resume is admitted only for that live run's known accepted pending
question. Reject wrong, duplicate-resumeId, concurrent, exhausted, stopped and foreign
resume inputs before disclosure or dispatch. Reserve answer-read budget before
the bridge read; retain each consumed resume ID without refund. Distinct resume
IDs permit a later explicit read after a still_waiting acknowledgement. No awaiting
or reentrant callback between final validation,
reservation and the actual bound operation.

Read the actual bound author-visible question via existing core APIs, verify its
session/task/author/identity and active session, and validate its closed answer
against the originally recorded options. Preserve actual answeredBy and routing;
an escalated question may be answered only by the core-authorized recipient.
The bridge exposes only this one question, never a list or foreign question data.

If still open, return an explicit still_waiting acknowledgement; keep the original
call/receipt and run pending, with no transport request. If answered, append one
paired assistant question call and validated structured result containing the
known ask receipt plus actual answer/routing/answerer, then send exactly one new
continuation. The backend must inspect that real result. Concurrent/duplicate
resume cannot deliver twice. If cancelled/inactive/unreadable, fence with an
explicit failed/stopped/needs-attention outcome; never invent an answer or success.

## Stop, failures and uncertainty

Use the owned queued pump after adapter observer dispatch. Observers cannot
provide answers or execute bridge writes; their Promise completion is not a gate.
Core stop commits before loop fencing in a finally path even if stop throws.
A stop winning before ask/resume dispatch prevents it. A known committed ask
remains known after later stop; no continuation follows fencing. An already
created request stays counted and is aborted once, with unknown cleanup held.

Any thrown or measured-overrun ask call produces question uncertainty even when
adapter cleanup is verified. Preserve command/question IDs and consumed attempt;
no fabricated receipt, answer read, continuation, retry or later run. Actual core
inspection/replay by the trusted coordinator is evidence, not an acknowledgement
or permission to resend. A thrown answer read cannot establish that an answer was
delivered; fence conservatively without automatic read or request retry.

Known answer delivery does not imply task completion. Report results retain core
proof requirements. Core calls are synchronous; 10-second elapsed checks detect
overrun after return, not native-call preemption. Keep 10-second request and
5-second cleanup limits. Bounded fixture waiting barriers have explicit deadlines;
the stable waiting_for_answer product state itself has no request timer.

## Verification and exit

Before execution publish a finite real-core/fixed-transport matrix and aggregate
budget. Pin all affected source/tests/compiled outputs, the existing qualified
runtime/native dependencies and approval hashes. Preserve all 350 cases and
historical evidence. Capture incremental raw streams and failed attempts locally.
Dispose pumps, adapters, observers and waiting runs before stores/private roots.

Required evidence: member-to-Leader and Leader-to-owner questions; free-text and
option answers; actual escalation then owner answer; waiting with retained slot
and no requests/timers; explicit still-open reads; exact answer in actual
continuation; wrong-role/foreign/forged/malformed/duplicate/late calls and resumes;
two-member privacy; command/ask/read/request/history bounds; proof-gated report
after answer; real SQLite ask abort/lost reply for accepted/rejected commands;
read failure and cancelled question; stop before/after ask, while waiting and
around answer delivery/continuation; core-stop write failure; observer reentrancy;
reopen/replay; no retries; resource cleanup and original factory refusal.

Exit maps only the bounded question/report/context subsets of Architecture 4.2,
4.5 and offline portions of 5.1/5.3, ends this exception and grants no new scope.
Provider formats/SDK/network/credentials, complete member tools, UI cards, durable
conversation recovery, arbitrary files/commands, packaging and release remain open.
