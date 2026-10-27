# Phase 3A: bounded API adapter foundation

Proposed contract. Baseline7d97aa2: accepted schema7 core and fixed owned workers,
228 passing tests. Architecture5.1 defines the shared adapter surface;5.3 puts the
API agent loop under core control. This slice supplies only lifecycle/streaming
mechanics. Provider formats, HTTPS, team-tool execution and core binding follow
separate reviewed scopes. It does not declare the full API adapter implemented.

## 1 Composition

Add private `packages/api-adapter/` TypeScript source, declarations and Node tests.
Reuse pinned Node26.7.0 native Windows x64 ABI147 and existing TypeScript5.9.3/test
tools. No install or provider SDK. Core/mock-team source, import restrictions,
schema7, durable ledger, approval and witness semantics stay unchanged.

The adapter runtime imports no filesystem, process-launch, HTTP/network, credential
store, environment-secret access, core role/store or executable/plugin loader.
One fixed in-memory scripted transport is the only constructible transport in
this composition. Scripts are reviewed closed fixture modes, not arbitrary code,
URLs, provider names, JSON configuration or model-provided instructions. Future
transport types may be described but cannot be instantiated here.

Tests use at most two independent adapters, one immutable session/member binding
per adapter, one active request per adapter and six lifetime admitted requests.
No disposable SQLite store or child is needed for new adapter-only tests. Existing
core/worker tests retain their accepted owned fixture composition and teardown.

## 2 Narrow common surface

Keep Architecture5.1 method names: detect, start, send, onEvent, interrupt, stop
and capabilities. Publish explicit prototype types, with these closed fields:

- LaunchContext: version1, sessionId UUID, memberId UUID, briefing bounded text.
- TaskInput: version1, kind task, requestId UUID, taskId UUID, text bounded text.
- UserMessage: version1, kind message, requestId UUID, text bounded text.

All IDs use canonical lowercase UUIDv4. The text/briefing bound is in Section3.

Reject unknown fields, invalid versions/IDs/text and unsupported launch options
before request creation. Trusted construction binds the immutable session/member;
start must match that binding. It may initialize once and must refuse after stop.
No caller, wire frame, task text or model output may change role/session/member,
transport, capabilities or permission. Task IDs are correlation only: send does
not enqueue, start, claim, settle, report or complete any core assignment.

detect reports only scripted transport availability and its synthetic identity;
it performs no network/installation probe and cannot claim provider readiness.
capabilities returns a detached immutable declaration: text streaming supported,
real providers, tools, file/command execution and remote-cancellation verification
unsupported. Unsupported fields/features fail closed, not silently ignored.

send returns a Promise for local admission/request creation, not task or response
completion. Admit/record the request ID and generation before calling transport
creation once. Creation failure or an ambiguous reply cannot cause a retry.
Keep lifetime seen IDs, including failed attempts, within the six-request bound;
duplicate request IDs reject without another transport creation. Invalid inputs
and busy/stopped requests create no transport request or growing rejection log.

## 3 Streaming and completion

Use a documented closed version1 JSON-frame protocol for the fixed API double:
text delta, response end, transport error and unsupported tool-call candidate.
Correlate every callback/frame with the immutable adapter/session/member and the
original requestId plus generation; caller data cannot choose a callback's owner.
Validate compact canonical UTF-8 JSON, closed fields and typed bounded payloads.
The implementation must freeze exact schemas in reviewed source before execution.

Bound each frame to16KiB, total received bytes per request to64KiB, accepted
frames/events to128 per request, retained normalized events to64 and subscribers
to16 per adapter. Prototype input text/briefing has1..256 Unicode scalar values,
at most1024 UTF-8 bytes, no NUL or isolated surrogate. These are explicit prototype
bounds; no core-runtime import or full product context-window claim is required.
Reject before unbounded buffering or dispatch; no unbounded diagnostic history.

Normalized events carry original context/request identity and distinguish local
admission, text delta, response completion, interruption, failure, uncertainty and
adapter stop. Hold a response-end frame as a candidate until the complete transcript
validates and local transport closure is verified, with exactly one response end.
Only then emit response completion. EOF, prose saying done, usage metadata, an error, an abort
request or a disconnected stream cannot substitute for that terminal proof.
No event grants approval or changes a core task. Unsupported tool candidates
fail closed and never call a tool, create an approval or execute an effect.

Duplicate terminal, malformed/truncated/extra/unknown or mismatched frames must
not produce a second completion, corrupt the next request or unlock unknown work.
Late callbacks remain bound to their original generation and are discarded after
closure/fencing; they cannot satisfy a newer request. Subscriber exceptions are
isolated from protocol/lifecycle handling and other subscribers without recursive
error-event delivery; unsubscribe is idempotent. Subscriptions are live-only.
Retained events serve only bounded detached fixture inspection; subscription does
not replay them or imply durable history/reattachment.

## 4 Cancellation, errors and ownership

Use an explicit lifecycle including unstarted, ready, running, cancelling,
needs_attention and stopped. The first interrupt/stop request fences further
admission before asking the current owned transport to abort. Invoke abort at
most once per request; repeated calls share the same bounded cleanup decision.
An interrupt may return to ready only after verified local closure. Unverified
closure latches needs_attention. stop is terminal for admission even when its
request remains uncertain; do not relabel unknown work as safely stopped.
No automatic restart/resend/re-briefing.

An abort request, rejected promise, closed local client or callback removal does
not prove remote cancellation. The scripted transport's verified local closure
proves only its own test lifecycle. If closure cannot be verified, retain the
active request as uncertain and refuse new send; do not free occupancy or infer
absence. No built-in confirm/abandon/resolve path or core attention writer is added.
Explicit fixture inspection/adapter disposal never authorizes provider retry.

Each request has a10-second operation deadline. Interrupt/stop/fault cleanup has
at most5 seconds to verify local transport closure; unverified closure yields a
bounded uncertain result and admission stays fenced. Clean up owned timers,
listeners and subscriptions without letting late callbacks mutate another turn.
Distinguish pre-admission refusal, creation/transport failure, protocol fault,
deadline, requested interruption and unverified cancellation in safe events.
Do not turn unknown execution into a successful response or automatic retry.

Scripts include normal finite streaming; creation throw/ambiguous creation;
error/disconnect; malformed/duplicate/truncated/mismatched/oversized frames;
unsupported tool call; completion/stop races; late callbacks after cancel and
after a later request; ignored abort with and without eventual verified closure.
Use deterministic barriers for races, not sleeps as ordering evidence. No open
timer loop, arbitrary callback script or background surviving fixture is allowed.
After assertions, fixture cleanup explicitly releases scripted barriers/timers,
including ignored-abort modes; that cleanup does not prove provider cancellation
or authorize another request from an adapter fenced in needs_attention.

## 5 Qualification and exit

Before execution, parent review pins the entire core/mock-team/api-adapter source
and test inventory, compiled files, runtime and existing native dependencies.
Add import-boundary checks denying new execution/credential/network reachability.
Publish a finite scenario matrix and explicitly budget the aggregate suite before
running; retain incremental raw streams locally and safe digests publicly. Keep
all228 accepted tests and historical seals. This proposal itself executes no
adapter or engine and changes no accepted source or permission.

Required exit cases: closed context/inputs and unsupported options; exactly one
creation per admitted ID, busy/six-request bounds; normal ordered streaming;
all malformed/unsupported/error modes; duplicate ID/terminal and stale-generation
isolation; subscriber exception/unsubscribe/buffer bounds; deterministic interrupt/
stop/completion races; verified versus unknown cancellation;10/5-second deadline
behavior; complete timer/listener cleanup; no provider/tool/core effect from any
text or frame. Tests must exercise the real adapter and fixed transport rather
than substitute objects that mirror the implementation.

Map acceptance to Architecture5.1/5.3 and keep the narrower guarantees explicit.
Schema changes, SDK/HTTPS/provider credentials, API agent loops, team-tool/core
dispatch binding, real files/commands/Git, arbitrary programs, terminals, UI,
automatic approvals/retries, hostile-code isolation and release remain excluded.
The exception ends at Phase3A exit; future provider/network/tool composition needs
its own applicable readiness evidence and scope decision.
