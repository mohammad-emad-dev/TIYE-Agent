# Phase 3B: scripted API conversation loop and bound core context

Proposal only. Baseline11eee3b:273 passing tests, accepted schema7 core/mock-team
and narrowed offline adapter. This adds the send/tool/result/continue mechanics
of Architecture5.3 with one read-only part of4.2. It does not qualify a real
provider, full team-tool set, durable loop or complete API adapter.

## 1 Composition and authority

Add private TypeScript `packages/api-loop/`. Extend api-adapter only through an
explicit trusted loop profile/factory and closed scripted modes. Preserve the
current factory/text/message/task behavior, tool rejection, limits and273 tests.
Core and mock-team source, schema7, ledger/replay and effect semantics stay unchanged.
Use existing Node26.7.0 Windows x64 ABI147 and TypeScript5.9.3/native dependencies;
no install, SDK, endpoint, network, credential or arbitrary transport loader.

Each reviewed fixture owns one existing schema7 store/session with one or two
members. It may create that session and explicitly stop it using accepted core
APIs. A trusted core-context bridge binds a chosen immutable session/member before
the loop starts. Only this small bridge may use existing snapshot(), member()
and bound context() readers. Raw store/owner/scheduler/member handles and database
paths never enter the loop, adapter, scripted transport, frames or transcript.
The bridge returns a narrow closed read capability; it exposes no core writer.

The loop/adapter import no filesystem, shell/process, HTTP, credential, MCP or
core runtime module. Type-only core references may be confined to the bridge;
its only runtime core reachability is the already-bound reviewed reader. This is
trusted same-user composition, not authenticated provider transport or a sandbox.

## 2 Conversation identity, limits and history

One active conversation per loop/member, at most two lifetime conversations and
six adapter requests. At most three sequential requests and two tool reads per
conversation; at most two loops/adapters per scenario. No parallel tool batch or
overlapping requests. Exhausted budgets reject before another read/request.
Within a scenario, loop bindings must use distinct member IDs in that one session;
constructing another loop for the same member refuses before request creation.
Duplicate run IDs refuse locally without another request. No durable idempotency
or resume is implied by in-memory IDs/transcripts; reopening never resumes work.

Run input has closed version1/runId UUIDv4/text fields, using the existing adapter
input text bound. Trusted loop code creates each distinct request ID and tracks
run/turn/request/generation context before admission. Model fields cannot select
another actor, request owner or core capability. Late/duplicate callbacks retain
their original owner and cannot advance another turn or conversation.

Add a loop-only structured request kind rather than encoding tool history into
ordinary message text. Freeze exact closed message/request/frame/event schemas
in reviewed source before execution. History has user text, validated assistant
tool candidates, structured tool results and assistant text; at most eight
messages and32KiB canonical UTF-8 per submitted request. Bound cumulative received
conversation bytes to64KiB, retained observer events to64 and subscribers to16.
Check limits before copying/appending; no truncation or unbounded rejection log.
These prototype bounds do not implement context windows/token summarization.

The scripted transport must receive a detached validated request snapshot and
actually validate the structured result and its matching call ID before emitting
the next fixed response. Tests inspect those real snapshots; a script that ignores
the result and merely returns text is insufficient evidence of a loop round trip.

## 3 Structured tool turn and read-only dispatch

Only an explicitly constructed loop-profile adapter accepts the new closed tool
candidate frame. Existing text-only adapters retain their exact refusal behavior.
The frame binds original request/generation/context, a canonical UUIDv4 callId,
name exactly get_my_context, and arguments exactly an empty object. Other tools,
unknown fields/versions, supplied member/session/permission IDs and nonempty args
refuse before any read. Model prose, role text and usage data grant no permission.

A turn is either text or one tool candidate; mixed/parallel/duplicate candidates
refuse. A candidate is withheld until the whole transcript has exactly one valid
end and verified local transport closure. Expose a distinct normalized terminal
tool-request event, not a successful text response or task-completion event.
An early candidate followed by malformed/extra bytes or disconnect performs no
read. Keep all existing16KiB-frame/64KiB-request/128-event and10/5-second limits.
The closure witness is an owned transport lifecycle callback, separate from the
response-end frame and never a provider/model field. Close error, disconnect,
abort or missing closure cannot publish an accepted terminal tool request.

The loop validates the bound terminal tool request, remaining turn/tool budget
and callId uniqueness within the run before calling the bridge once. The bridge
freshly checks the same session is active and reads only that member's existing
MemberContext. Return exactly sessionId/memberId/name/instructions/role, validated,
detached and immutable. Do not invent current-task, permission or approval data
that the existing core context does not supply. Leader role grants no extra tool.

Append the accepted assistant call and matching result only after the read succeeds,
then submit a new continuation request once. This is a new validated turn, not a
retry/resend of an uncertain request. Duplicate call IDs never trigger a second
read, even through another request. A third tool request or fourth model request
fails before another operation. No core log/task mutation follows; read-only tool
history is bounded in memory, not a new durable tool/effect journal.

The two tool-read attempts and six model requests are separate quotas. Reserve
the call ID/read attempt before invoking the bridge, and reserve request identity/
budget before adapter admission; failure, stop or lost reply never refunds either.
There are at most eight additional binding/status validation checks per run, not
an open polling loop. Each bridge operation is measured against10 seconds. The
existing SQLite readers are synchronous: this is overrun detection after return,
not preemption. A late/blocked read cannot authorize continuation or qualify a
passing timing claim; report failed/inconclusive execution rather than promise
that JavaScript can interrupt a blocked native call. No timeout/reader retry.

Text completion ends only the conversation with an explicit response-complete
outcome. It never reports a task or completes a mission. get_my_context is a
prototype subset of the future tool, not full production context/permission data.

## 4 Stop, failure and uncertainty

Fence loop admission/continuation before interrupting or stopping its current
adapter. Reuse the accepted at-most-once abort, unknown-slot retention, bounded
cleanup, token-based FIFO observer invocation and rejection isolation. Subscriber
Promise completion is not a protocol/stop gate. No observer data is parsed as a
command. Ignore old-generation events after stop or the next conversation.

Adapter callbacks schedule at most one owned advance/pump step after the current
notification dispatch, rather than reentrantly sending inside a subscriber. That
step validates the active session, reserves identity and enters adapter.send in
one synchronous controller turn with no await/yield between them. Only the trusted
coordinator holds the core writer. A reentrant admission stop must use the
coordinated core-stop/loop-fence route; the adapter's pre-begin fence prevents
creation when that stop wins. Test this route, not an unrelated direct writer.

If stop wins before a read, do not invoke it. If a read already succeeded, retain
its call/result and consumed budget as local history, but send no continuation
after fencing; never repeat that read. If a continuation was already created,
count it as dispatched, abort that owned request once and retain needs_attention
when closure is unverified. Do not label it unsent or resend it. If final response
acceptance won before stop, preserve it; a stop winning first prevents acceptance.

Before each read, continuation and final acceptance, check the bound core session
is still active through the bridge. A trusted fixture session stop commits before
loop stop/interruption; no new read/request is allowed after that stop is observed.
Do not claim asynchronous live session-stop detection: the explicit coordinator
route and synchronous boundary checks define this slice. The loop cannot stop,
recover or mutate the core itself.
If the coordinator's core-stop write throws or has a lost reply, it still fences
the loop in a finally path and inspects actual core state later; it cannot claim
a committed stop from its intention or fabricate a core failure notice.

Creation ambiguity, transport loss, invalid protocol or unverified cleanup never
cause an automatic resend or inferred remote cancellation. Surface a bounded
failed/needs-attention/stopped conversation outcome with truthful local state.
Unknown work stays fenced. Core reader failure (including closed store, invalid
profile or stopped/mismatched session) produces no fabricated profile/tool result,
core worker-crash notice or request retry. Cleanup uses only owned scripted
resources; fixtures dispose every timer/listener/barrier before core/root cleanup.

Trusted binding/status validation may read core metadata independently. The
no-early-read rule concerns dispatch/disclosure of the get_my_context tool result:
its dispatch count stays zero until the complete tool turn has validated. Test
instrumentation must distinguish those setup/status checks from tool invocations.

## 5 Qualification and exit

Review and preflight the entire core/mock-team/api-adapter/api-loop inventory,
tests, compiled outputs, pinned runtime and native hashes before execution.
Boundary checks must confine core-reading access to the bridge and deny all core
writers, network/secret/process/file/tool-loader reachability. Retain273 tests and
immutable historical evidence; publish a finite matrix/aggregate budget before
execution, unchanged10/5-second request/cleanup bounds, incremental local raw
streams, safe public digests and inconclusive reporting on host/suite overrun.

Required real-core/fixed-transport evidence: text-only conversation; successful
tool/result/continuation/final round trip and exact submitted history; two-member
isolation; forged context/tool/args/call IDs; mixed/duplicate/late/malformed tool
turns; read/turn/lifetime/history/byte bounds; no read before closure or after stop;
core read failure and stopped/closed stores; creation/transport/abort uncertainty
without retry; observer reentrancy/unsubscribe; deterministic stop/continuation
races; disposal before core/root cleanup; core projections/events unchanged by
all reads and loop traffic. Do not substitute fake stores/readers/loops for these
integration assertions. Faults stay within reviewed fixed scripts/fixtures.
Include before-read/after-read/before-dispatch/after-dispatch stop barriers, quota
accounting after faults, core-stop failure/lost reply and a candidate followed by
end/extra bytes/disconnect/close error/abort. No invalid tool turn may disclose a
profile or increment the tool-dispatch count.

Map exit to bounded Architecture4.2/5.1/5.3 behavior and end this exception.
Real provider formats/SDK/HTTPS/keys, MCP/authentication, mutating tools, API file/
command guards, core task dispatch/reporting, durable loop recovery, automatic
approval/retry/takeover, processes, UI, migration/reset and release remain outside
scope. They need their applicable evidence and later scope decision.
