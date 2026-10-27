# Phase 3A reviewed execution plan

Approved contract atb138d72 and exact owner response in output/phase3a-approval.
Parent review covers every core/mock-team/api-adapter source/test, the pinned
compiled core and new compiled adapter, runtime and existing native dependencies.
No new adapter test has executed before this plan/source preflight. TypeScript
compilation alone has run; one type error was corrected by returning validated
closed frame objects. Source, exact schemas and finite scripts are now reviewed.

The new runtime has only fixed relative imports, no filesystem/network/process/
credential/core role reachability or dynamic loader. It constructs only the
reviewed in-memory ScriptedTransport. Inputs and frames have closed version1
schemas; UUIDv4/session/member/request/generation binding cannot select an actor.
Each scenario creates at most two adapters, each one active/six lifetime requests.
The scripts are closed literal modes; no endpoint or arbitrary function is loaded.

The finite matrix adds38 adapter tests to228 retained tests: lifecycle/detection,
closed binding/input/Unicode/unsupported-option refusal, ordered streaming and
candidate-versus-completion, busy/duplicate/six-request bounds,18 real scripted
transport fault modes, creation failure and ambiguous creation, cooperative and
ignored cancellation, actual5-second uncertain cleanup and10-second operation
deadline, stop/end races and pre-stop completion, reentrant stop at admission,
stale callbacks, subscriber exception/isolation, unsubscribe/live-only behavior,
waiter/subscriber bounds, retained64-event ring and two-adapter context isolation.
No store/process/adapter substitute or fake clock is used. Script controls release
deterministic barriers; every fixture awaits disposal and checks timer/listener/
waiter/subscription cleanup. Unknown occupancy stays fenced despite fixture cleanup.

Whole combined suite budget is660 seconds: the accepted228-test600-second ceiling
plus60 for the added matrix, including20 seconds of deliberate10/5/5-second waits
and40 seconds of remaining scripted cases. Per-request10-second operation and
5-second cleanup limits are unchanged. Existing worker/observer limits are unchanged.
Measure elapsed time as well as subprocess timeout, so a resume/host stall cannot
qualify a pass after exceeding the budget. Retain failed runs, never extend bounds
or silently rerun until green. New failures must be diagnosed before another run.

Before execution, capture the complete three-package inventories and both compiled
outputs; rebuild must reproduce those bytes. Run all three source-boundary checks
and the combined Node TAP suite, with incremental streams under a fresh .git
capture root. Public artifacts contain only safe counts/digests. No install,
provider SDK, credentials, HTTP, MCP, tool/command/file/Git action, UI or migration.
The new adapter has no OS process or database; only baseline tests use the earlier
owned private SQLite/worker fixtures. Implementation qualification does not close
the separate Phase3A exit or any provider/native/release gate.
