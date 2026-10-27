# Phase 3A contract exit mapping

| Contract section | Actual evidence |
| --- | --- |
| 1 Composition | Fixed scripted transport, private TypeScript package, pinned runtime/dependencies, three import-boundary checks, core/mock-team hashes unchanged |
| 2 Common surface and ownership | detect/start/send/onEvent/interrupt/stop/capabilities, closed UUIDv4/context/input grammar, explicit unsupported features, one active and six lifetime IDs, one creation/no retry |
| 3 Validated streaming | Ordered text, full transcript and verified local closure before response completion, malformed/duplicate/truncated/oversized/version/context/tool/EOF faults,128-event and64KiB bounds,64 retained records |
| 3 Observer isolation | Real async rejection reproduction and fix; FIFO invocation across reentrant sends; snapshot/token membership; unsubscribe/resubscribe isolation;16 subscriber/waiter bounds; detached immutable primitive events |
| 4 Cancellation and lifecycle | Verified versus unknown closure, shared cleanup, actual10/5-second deadlines, stop/completion races, stop at admission, old-generation callbacks, unknown active slot retained, guarded abort failure |
| 4 Resource cleanup | Fixture disposal and explicit script release, no owned timers/listeners/waiters/subscribers left, terminal notification before subscription clearing, no application Promise drain dependency |
| 5 Complete evidence |266 accepted tests plus seven exit regressions, actual source/compiled/native preflight, incremental raw captures, expected failures retained, all historical source/artifact seals checked |

Architecture5.1 is covered only as this narrowed scripted lifecycle/text-streaming
surface. FIFO guarantees subscriber invocation order; it does not serialize
application Promise settlement. The notification bound derives from six requests
with128 events each plus one adapter stop, so legal event production cannot
overflow it. Invariant violation is explicit, not a silent terminal-event drop.

Architecture5.3's real provider layer and agent loop remain pending. There is no
SDK/HTTP/key access, context summarization, filesystem/command/team tool, ownership
guard, core dispatcher, terminal or UI. Cancellation verifies only the fixed
script's local closure. No provider billing/remote execution, authenticated
hostile transport, throughput or product/release guarantee is inferred.
This exit ends the Phase3A exception and grants no new construction scope.
