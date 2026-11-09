# Phase 3H source review and execution plan

9 November 2026. Scope: INTERNAL_PHASE3H_LEADER_FAILURE_VIEW, admitted against
the frozen proposal at 93d6588 by output/phase3h-approval/approval.json.

Parent reviewed the approved contract, the existing failure engine
(engine-failure.ts: visibleFailures/visible-notice semantics, open-question
cancellation, uncertain-effect reconciliation, already-handed edges), the
effects-store member `failures()`/`context()` readers, the coordination read
bridge (core-coordination.ts status path: one-snapshot projection, roster
mapping, 24 KiB bound, overflow refusal), the handoff bridge (catalog codec,
Leader binding, receipt validation), the loop controller (step/dispatch/
transcript/finish/fail/stop ordering, eight-check budget), the adapter
(send/record/frame/codec isolation per profile, catalog-immutability pin,
3/6-request lifetime bound), the fixed script routers and mode families, both
boundary checkers, and the coordination/handoff loop tests (fixture seeding
via startTask plus owner.observeFailure, pause-gate barrier tests, SQLite
abort/lost-reply fault injection, overrun, reopen/replay discipline). No
core/mock-team production or existing test body changes are admitted. Native
execution uses only existing owned schema7/witness fixtures on Node26.7.0,
Windows x64, ABI147 and the previously qualified native dependencies. There is
no new executable composition, arbitrary adapter, provider or credential access.

## Design (parent decisions)

New modules only, mirroring the 3F/3G shape at read-only scale:

- `packages/api-adapter/src/failure-contract.ts`: `failureRef` (same ASCII
  grammar), `FailureCatalog {context, members}` (no tasks: the trusted request
  carries only bound context plus roster memberRefs/roles), `FailureRow`
  (taskId, memberRef, reason, bounded summary, observedSequence, status,
  closedSequence consistent with status, role), `FailureStatus`
  (`version/sessionId/status/failures`, at most 100 rows ascending by
  observedSequence, 24 KiB bound, overflow refuses), `FailureMessage`
  (`assistant.failures`/`failures.result` kinds, mirroring the
  `assistant.status` precedent rather than the generic call pair),
  `FailureInput` (`failure-loop`, 1–3 turns, 8 messages/32 KiB including
  catalog, no text mid-history, result session/roster cross-checks).
- `protocol.ts`: `api.failure.tool_call` frame carrying only the callId
  (single tool, empty arguments — `get_failures` accepts exactly `{}`).
- `scripted.ts`: `FAILURE_MODES` (view, context, text, mixed, duplicate,
  extra, disconnect, end-hold, forged-args/call/context, malformed, truncated,
  after-tool, final-malformed, continuation-ambiguous, late, two-reads,
  large-text), `failureScript()` router, and the end-hold/late/abort/
  continuation-ambiguous list updates.
- `adapter.ts`/`types.ts`/`index.ts`: `failure` profile, `get_failures` tool
  routing, `failureToolCandidates` capability, `failure-loop` input/catalog
  pinning, 1/3 lifetime group, `AdapterProfile`/`Input`/`MemberEvent`
  extensions, `createScriptedFailureScenario` export.
- `packages/api-loop/src/core-failure.ts`: `FailureViewer`
  (`binding/catalog/active/read/failures`), Leader binding plus order-matched
  roster validation at construction, one-snapshot `checked()` with roster-drift
  refusal, `failures()` validating the bound session/Leader in a fresh
  projection then calling the existing member `failures()` reader once and
  mapping notices through memberRefs (raw member UUIDs never exposed),
  10-second measured operations, `createCoreFailureScenario` with one loop and
  the read/continuation pause allowlist only.
- `loop.ts`: extension detection tries `failures` before `catalog` (a viewer
  carries a catalog but no submit method; without this it would misroute to
  coordination), `failure-loop` dispatch with catalog, `failureHistory`
  transcript branch, read-branch routing with an explicit single-read guard
  (at most one `get_my_context` OR `get_failures` per conversation; refusal
  happens before any second core read), read-path try/catch fencing aborted
  snapshots, overruns and overflow to `needs_attention` with no retry (inline
  at the read site; no new outcome fields, mirroring status reads),
  turn/request budgets placing the viewer in the 1/3 groups.
- Both boundary checkers allowlist the two new modules (no new writers,
  loaders, network, files or processes).
- `packages/api-loop/test/failure.test.cjs`: the finite matrix below, using
  the handoff failure-seeding pattern (startTask plus owner.observeFailure)
  and pause-gate barriers. No separate adapter unit file; codec bounds are
  covered inside the loop suite as in 3F.

The finite matrix has 36 new tests: Leader reads mixed (2 entry modes), empty,
awaiting-only and closed-only failure sets with actual core notices (5);
open-question cancellation and uncertain plus already-handed fidelity (1);
non-Leader/foreign binding refusal (1); roster injection/duplication/overflow/
drift refusal (1); old-profile refusal (1); malformed/mixed/duplicate/unclosed/
forged calls (9); tool after the admitted read (1); second read of either kind
refused at the bridge (1); text-only plus view prose boundaries (2); aborted
snapshot read fences uncertainty without retry (1); measured read overrun (1);
stop before read, after read and before continuation (3); rejected/failed core
stop (2); stop from the final notification preserves the read outcome (1);
closed-store final-check failure with reopen
and durable-unchanged proof (1); codec overflow/foreign/forged bounds (1);
read succeeds without consuming capacity on the 999-command ledger (1);
failed continuations preserve the accepted read (3).

Controller checks: initial dispatch (1), optional read admission (1), optional
read continuation dispatch (1), final acceptance (1): at most four, within
eight. Reads never reserve commands, attempts or continuation capacity. One
conversation, three requests and at most one read; 8 messages/32 KiB including
trusted roster, 64 KiB received, 64 retained events and 16 subscribers.

capture.py seals actual source/tests, compiled files, exact approval, test
plan, runtime and native dependencies before first changed-composition
execution. Three builds and four boundary checks have 60 seconds each. The
focused failure test file has 240 seconds, followed by the full
retained-plus-new 588-test suite at the existing 1,320-second limit. Total
sequential ceiling is 1,980 seconds. Request/read/write elapsed limit stays
10 seconds and cleanup stays 5 seconds. Run each stage once; on failure
preserve incremental raw streams under .git, diagnose, record the correction
and new preflight before rerunning. No silent retry, hidden deadline
extension, disabled case or cleared uncertainty.

All 552 prior cases remain. This is implementation qualification only; a
separate exit review remains required. Native/provider integration and release
stay HOLD.
