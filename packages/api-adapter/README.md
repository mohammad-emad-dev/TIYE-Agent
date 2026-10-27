# Offline API adapter foundation

Private Phase3A prototype of Architecture5.1's lifecycle surface. Construct only
through `createScriptedScenario()`: at most two adapters, each bound to immutable
session/member IDs and one fixed scripted transport mode. No real provider,
network, credentials, core role/store or tool execution is reachable.

`start` validates the closed version1 context. `send` accepts a bounded task or
message, reserves its request identity before creating the scripted request once,
and returns after admission/creation. Completion comes through live-only events
after the entire response transcript and local transport closure validate. It is
response completion, never core task completion or proof of remote cancellation.

Only one request is active per adapter, with six lifetime identities. Interrupt
and stop fence admission before one abort; unverified closure holds the active
request in needs_attention. Interrupt can return ready after verified local
closure; stop permanently fences admission. Ten-second operation and five-second
cleanup limits apply. `capabilities()` explicitly denies provider/tools/files/
commands and remote cancellation verification.

Each JSON-line frame has exact version/context/type fields and <=16KiB including
LF; request totals are64KiB and128 frames/events. Text, error, end and unsupported
tool candidates have closed schemas in `src/protocol.ts`. Normalized events retain
original request/generation context. End frames remain candidates until verified
closure. After closure/fencing, stale callbacks cannot alter a later request.

Fixture controls release fixed barriers, inject one fixed stale callback and
inspect detached bounded state. They accept no arbitrary script, endpoint or
transport implementation. Always await scenario.dispose() in fixture cleanup;
it releases owned script barriers/listeners/timers, and does not resolve unknown
provider execution. Exact schemas and tests are pinned in the implementation's
preflight under `output/phase3a-adapter/`. Real providers, tools, core integration
and the product UI are separate scopes.
