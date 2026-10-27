# Phase 3A scripted API adapter implementation

The private TypeScript adapter implements the approved lifecycle/text-streaming
foundation using one fixed in-memory transport. Its public facade has detect,
start, send, onEvent, interrupt, stop and capabilities. The transport is synthetic;
no provider, credential, network, core role/store, tool or filesystem effect exists.

One active request per adapter, six lifetime IDs and two adapters per scenario are
bounded. Response completion waits for the full valid transcript and verified
local closure. Unknown cancellation retains its active slot. Stop fences further
admission; late callbacks cannot affect a later generation. Live subscriptions,
stream buffers, retained events and fixture waiters have fixed bounds.

`TEST-PLAN.md` defines the reviewed composition and finite budget before execution.
`verification.json` records actual suite counts and hashes. `REVIEWS.md` records
parent review and the requested delegate outcomes. Raw streams remain local.
`evidence.json` and `verify.py` bind accepted source/history and approval.

Core and mock-team are unchanged. This is implementation qualification; the
separate Phase3A exit review remains required. Full API agent loops, provider
formats/HTTPS, tools, core integration, UI and release remain HOLD.
