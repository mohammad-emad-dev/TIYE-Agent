# Delegate and parent exit review

All requested models received focused embedded source read-only. Luna max
completed and recommended subscription tokens plus explicit bounded-queue
overflow semantics. Those were adopted: tokens prevent an old queued delivery
from attaching to a new subscription of the same function. Notifications have a
hard six*128+one-stop lifetime-derived ceiling; invariant overflow throws rather
than silently dropping events. Current normalized events contain only primitive
fields, so the model's nested-object freeze caution does not require new fields
or a deep-clone facility.

Flint40B Free and DeepSeekV4.1 Flash Free max returned completed review reports,
while the outer adapters reported adapter_timeout; raw result status and observed
outer status are recorded separately. These reports supply advice, not approval.
Flint asked to define async drain and sequencing. The parent retained nonblocking
subscriber handling: invocation is FIFO but subscriber Promise completion is not
a protocol/stop gate. Awaiting application code could prevent bounded shutdown.
A regression leaves an application Promise pending through two responses and
stop, then rejects it; only the bounded error counter changes.

DeepSeek flagged terminal delivery before unsubscribe and an abort exception
escaping cleanup. Terminal delivery now owns the subscriber-clear action. A fixed
abort-throw script and guarded cleanup keep the stop decision bounded, retain
unknown ownership and record abort_failure without resending. The source has no
arbitrary transport injection. The seven regressions cover those cases along with
reentrant ordering, unsubscribe/resubscribe and asynchronous rejection isolation.

Parent review covers the complete three-package inventory, exact source/types/
scripts/tests, both compiled outputs and existing native/runtime hashes before
execution. Core and mock-team source are unchanged. Expected-failure runs use the
original compiled adapter; final tests use the reviewed fix and real fixed script,
not replacement adapters or fake clocks. All fixtures dispose owned timers,
listeners and waiters. The accepted contract does not include remote provider
closure, SDKs, network, tool execution, API agent loops, core binding or UI.
