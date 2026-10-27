# Implementation coverage

| Approved behavior | Actual checks |
| --- | --- |
| Fixed offline composition | Runtime/source boundary, closed modes, two-adapter scenario cap, no new dependency or core/store/process/network import |
| Narrow common interface | detect/start/send/onEvent/interrupt/stop/capabilities, start once, explicit unsupported capabilities, closed launch/input/context grammar |
| Request identity and occupancy | One active/six lifetime admitted IDs, busy and duplicate refusal, failure retains ID, one creation per attempt, unknown closure retains slot |
| Streaming is not task completion | Ordered context-bound text, end candidate held until valid transcript and closure, no task/approval events, prose done has no special meaning |
| Protocol and buffer failure | Invalid UTF8/JSON/duplicate fields/truncation/version/context/extra fields, duplicate/extra end, byte/frame/event bounds, unsupported tools and absent end |
| Cancellation and deadlines | Cooperative interrupt, ignored abort with explicit closure, actual5-second unknown cleanup, actual10-second operation deadline, shared cleanup decision |
| Races and old callbacks | Stop at end candidate, completion before stop, synchronous stop from admission prevents begin, captured old data/disconnect during a later generation |
| Observers and cleanup | Isolated callback exceptions, live-only subscriptions, idempotent unsubscribe,16-subscriber/waiter caps, detached64-event retention, finally-disposed listeners/timers/waiters |
| Accepted baseline | All228 tests retained; actual core/mock-team source bytes and all historical evidence unchanged |

This qualifies the narrowed Architecture5.1 lifecycle/text-streaming foundation
and a small part of5.3's future provider boundary. It does not implement provider
formats, an API agent loop, context summarization, team-tool dispatch, permissions,
core task completion, network authentication or UI integration. Scripted local
closure is not proof of real remote cancellation. The separate Phase3A exit
review remains required; integration and release stay HOLD.
