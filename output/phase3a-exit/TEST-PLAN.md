# Phase 3A exit review execution plan

Approved proposal b138d72; accepted implementation3b24e82 with266 passing tests.
Parent review found two observer gaps within the approved lifecycle scope:
rejected asynchronous subscriber Promises escape synchronous try/catch, and a
subscriber starting a new request can deliver nested admission before another
subscriber receives the previous completion. Unsubscribe can consequently arrive
too late for that nested event. No new transport or effect is introduced.

Before fixing source, capture two separate expected-failure runs against the
original compiled adapter: the async-rejection test and the reentrant-order test.
Each uses only the reviewed new exit test file and has a60-second aggregate
budget. Expected nonzero TAP is reproduction evidence, not qualification. Pin
actual complete source/compiled/runtime/native inventories and retain incremental
raw streams locally with safe public hashes. No fake adapter/store/clock/process.

Then make subscriber return types explicitly support void or Promise<void>,
attach bounded rejection handling without awaiting/blocking protocol progress,
and serialize notifications in a bounded FIFO. Snapshot membership at emission;
new subscriptions do not replay queued events and unsubscribe cancels queued
delivery. Subscriber failure accounting stays bounded and emits no recursive error
events. Preserve one active/six lifetime IDs, immutable context, response-versus-
task semantics and conservative cancellation. No provider or core binding changes.

The final matrix retains266 tests and adds seven actual-adapter regressions:
async rejection isolation with a healthy observer, reentrant cross-generation
notification order, unsubscribe before nested notification delivery, token-based
resubscription, pending application Promises independent of protocol/stop,
terminal notification delivery and a fixed abort-throw transport mode. Both
existing builds and all three boundary checks precede the273-test combined suite.
Budget remains660 seconds; the microtask cases plus5 seconds of abort-failure
cleanup fit the existing scripted-matrix allowance.10/5-second timers remain.
Measure elapsed time as well as subprocess timeout; host interruption/overrun
cannot qualify a pass. Every fixture awaits scenario disposal and verifies no
owned timers, subscriptions, listeners or waiters remain.

Parent review pins all core/mock-team/api-adapter sources/tests and compiled
outputs before each execution; source changes need a new preflight. Preserve all
historical evidence at its qualifying commit and exact approval digests. A final
contract matrix and bounded exit decision follow a passing full capture. No
dependency install, real provider/HTTPS/credentials, tool execution, filesystem/
process/core-store reachability, UI, schema change or new construction scope.
