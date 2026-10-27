# Phase 3E contract: a Leader closes a proven mission

## Composition and authority

Baseline 119b176 has 402 accepted tests. Extend packages/api-adapter and api-loop
with a distinct explicit mission profile/factory. Preserve all existing factories,
validators, outcomes and accepted cases. Internal profile selection may use a
closed enum; it must not become a configurable transport or arbitrary tool table.
Core/mock-team production source, schema7 and event/replay semantics stay fixed.

A trusted coordinator binds version/sessionId/memberId for the one actual Leader
of an active session. There is at most one mission loop/adapter per scenario.
No assigned task is required for the Leader: mission completion concerns the
session after its tasks have been reported. Derive role from the immutable core
roster and refuse a non-Leader, foreign session or model-selected binding before
writer capture or adapter creation.

Only a narrow mission bridge receives the existing bound member.completeMission
capability and checked snapshot/mission/context readers. The loop receives no raw
store/member/owner/scheduler handle, database path, proof or task writer. Model
fields cannot select actor/session/command/permission IDs. The loop cannot approve,
claim, settle, report, ask, recover, hand off or dispatch any task through this
profile. Other member/Leader tools remain outside this profile.

## Closed protocol and bounds

complete_mission arguments are exactly {summary}: nonempty text bounded to the
core's 256 Unicode scalars / 1024 UTF-8 bytes, rejecting NUL and invalid Unicode.
Unknown tools/versions/fields, role/identity injection, mixed or parallel tool
turns and duplicate/late IDs refuse before any write. Preserve original
request/run/turn/generation binding, canonical UUIDv4 call IDs and whole validated
transcript plus independent verified local closure before dispatch.

This profile permits one conversation per adapter lifetime, at most three
requests, two total tool attempts, at most one get_my_context read followed by
at most one complete_mission attempt. The context read is optional; a text-only
conversation may finish without any completion. A completion attempt is the final
dispatched tool, even when rejected. Reserve one unused continuation request slot
within all applicable limits before the completion write. Refuse locally if none
remains. Reservation is capacity, not a dispatched request.

Generate a private command ID and canonical team.mission.complete command with
the trusted session before invoking the bridge. Reserve call/command/attempt
before the writer. Never refund, regenerate an ID or resend after rejection,
exception, overrun, stop or lost reply. No later run or automatic fresh attempt on
that instance. Preserve existing 8-message / 32 KiB history, 64 KiB received bytes,
64 retained events, 16 subscribers, eight controller checks, 10-second request
and 5-second cleanup limits. Publish exact check accounting before execution.

## Core eligibility and actual receipts

Use unchanged core eligibility. Only the actual Leader of an active session can
complete it. The core must require its existing complete successful task/effect
coverage, closed reports, no unresolved questions or uncertain work, and existing
recovered replacement-chain rules. Do not duplicate a weaker client predicate or
manufacture witness/report proof. Empty, queued, blocked, unreplaced failed, unreported or
otherwise ineligible missions produce the actual core decision, not inferred
success. Pre-dispatch identity/session checks do not replace core eligibility.

Validate a known return against the actual command record and mission projection.
Expose a detached immutable receipt containing callId/commandId/sessionId/decision
and completion. For accepted, completion is exactly summary/completedBy/sequence
from the core, matching this Leader and requested summary, with positive safe
integer sequence. The session must actually be completed. A known rejection has
no completion and does not claim success; the bound session remains active.
No foreign tasks, member details, proofs or unbounded projections enter the receipt.

Append the accepted assistant call and matching receipt only after a validated
known return. Feed that actual receipt into one real continuation request. The
fixed backend must validate and use the decision/completion before producing its
text. Ordinary prose and response completion never complete the core mission.

## After the session closes

Successful complete_mission closes core admission. Do not reuse an ordinary
active-session check for its accepted receipt continuation/final acceptance;
that would reject the operation's own successful result. Instead the mission
bridge must freshly verify this exact known command remains accepted and this
same session is completed with the exact completion summary/Leader/sequence.
Only that known accepted receipt permits this narrow post-completion path.

Permit at most one text-only continuation after the completion decision. No
context read, new tool dispatch, task/session mutation, later run, retry or resume
is permitted afterward. Any emitted tool candidate in the continuation fails
before a core operation. A known rejected receipt uses the ordinary active-session
check before its one text-only continuation and final acceptance. Existing active
checks for all other profiles are unchanged; completion cannot be a general bypass.

Durable mission acceptance and conversation state stay separate. An accepted
mission remains completed if continuation creation fails, final text is malformed,
cleanup is uncertain or the owner stops the local loop. Preserve its known receipt
in the failed/stopped/needs-attention outcome. Do not fabricate an active/stopped
core mission, erase acceptance, or require final prose to make completion durable.
A failed fresh post-completion read fences the conversation while retaining the
previously known receipt; it cannot authorize another request or writer call.

## Stop, uncertainty and lifecycle

Use the existing owned queued pump, FIFO/token observer isolation and bounded
cleanup. No core writer is invoked inside an adapter subscriber. Freshly validate
the bound active Leader/session and reserve before writer dispatch with no
await/yield gap. A local stop winning before the write causes zero completion
calls; acceptance returning first preserves its receipt and actual core state.

The trusted coordinator may attempt existing core stop and fences the loop in
finally even if that command fails or is rejected because the mission is already
completed. It must inspect actual core state rather than assume stop succeeded.
An already-created continuation remains counted and is aborted once; unverified
cleanup remains needs_attention. Dispose owned work/scripts/timers/listeners before
store close/private-root cleanup.

Any thrown or measured-overrun completion call produces explicit mission
uncertainty even when adapter cleanup is verified. Retain IDs and consumed attempt;
append no fabricated known receipt, send no continuation, retry or later run.
Trusted coordinator inspection/reopen/replay may reveal actual acceptance or
rejection; that inspection is not an acknowledgement or permission to resend.
Synchronous calls have elapsed overrun detection after return, not preemption.

Only the existing fixed adapter is admitted. Keep its normalizing abort/cleanup
contract; do not introduce a provider or adapter that can reject stop. The future
rejecting-stop requirement recorded in Phase3D exit remains open for that future
integration and is not claimed solved here.

## Execution and exit evidence

Trusted fixtures may prepare, independently settle and report synthetic tasks
through existing core/witness helpers, separate from model tools. No new runner
or executable composition. Preserve all 402 cases and historical evidence.
Before first execution publish a finite real-core/fixed-transport matrix and
aggregate budget; pin source/tests/compiled outputs, qualified runtime/native
dependencies and owner approval hashes. Retain incremental raw streams and failed
attempts with no silent retry or deadline extension.

Required evidence: Leader with no own assignment; proven completed tasks and
recovered replacement chains; actual receipt in actual post-completion request;
empty/queued/blocked/unreplaced-failed/unreported or uncertain work rejection; non-Leader and
foreign binding; forged/mixed/malformed/unclosed/duplicate/late calls; no completion
from prose; context-before-completion; shared request/tool/history limits; no tools
after accepted/rejected completion; admission closed after success; repeated-run
refusal; real SQLite abort/lost reply for accepted/rejected commands; measured
overrun uncertainty; failed continuation or post-completion read; stop before/after
write and after dispatch; actual rejected/failed core stop; observer reentrancy;
reopen/replay; no retry; old factory refusal and complete resource disposal.

Exit maps only the bounded complete_mission addition to Architecture4.2 and
offline 5.1/5.3, ends this exception and grants no subsequent scope. Providers,
complete team tools, authenticated transport, durable conversation recovery,
file/command effects, UI, packaging and release remain unfinished.
