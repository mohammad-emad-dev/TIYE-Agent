# Phase 3B exit execution plan

Parent review covers the existing fixed transport, adapter codec, conversation
pump, narrow real-core bridge and 36 implementation cases. Two additional
real-core cases establish the final-result ordering: a durable session stop from
the last streamed text must prevent completion acceptance; a stop from the
accepted run.finished notification must preserve the accepted result.

No production change or new execution capability is introduced. Both cases use
the existing loop-context script and real schema7 store. The existing fixture
disposes loop pumps and adapters before closing the store and deleting its
private generated root. No substitute readers, clocks, providers or SDKs.

Source review precedes execution. The recorder pins all four package inventories,
compiled outputs, approval records, runtime and native dependency hashes before
three builds, four boundary gates and the full 311-test suite. The accepted
780-second whole-suite ceiling and 10-second request / 5-second cleanup limits
remain unchanged. Failed captures are retained; no retry or budget extension.

Exit requires unchanged production bytes from 8db6be7, immutable historical
evidence and source-bound passing results. It qualifies only the approved
offline read-only loop. Provider integration, mutating tools, durable loop
recovery, user interface and release remain unqualified.
