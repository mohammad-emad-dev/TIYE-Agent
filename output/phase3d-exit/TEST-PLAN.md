# Phase 3D exit execution plan

Owner-approved contract 11b19a7; implementation 1090901. Parent review covers the
question codec/profile, narrow role/task-bound core bridge, waiting/pump guards,
explicit unique resume, stop/failure and disposal. Production stays byte-identical
to implementation. Retain all 400 accepted cases and append two real-core cases.

Case one records a real answer, admits resume and immediately commits core stop
then fences the loop before the resume microtask may read. It must consume zero
answer reads, send no continuation and retain actual answered state without a
fabricated delivered answer. Case two pauses an owned resume before its read and
disposes the scenario. It must release the barrier, drain the resume job, timers,
pump and listeners, settle the run, and preserve the open durable question/slot.
Both reopen/replay actual core state before cleanup. Existing owned witness and
private-root helpers remain unchanged. No substitute store/reader/clock or new
runner, process composition, dependency, SDK, network, credential or UI action.

Before execution pin all four source/test inventories, compiled outputs, approval
records, Node26.7.0 Windows x64 ABI147 and original native dependency hashes.
Three builds and four capability/import checks precede the full 402-test TAP run.
Preserve the 1140-second aggregate ceiling and existing 10s request/5s cleanup
limits. The inherited actual overrun cases expect uncertainty, not successful
operation timing. Stable waiting still has no timer; fixture barriers are bounded.
Retain incremental raw streams and any failed attempts under a fresh .git path.
No silent retry or deadline extension. Rebuilds must reproduce compiled bytes.

Exit maps only bounded question/context/report subsets of Architecture4.2/4.5
and offline 5.1/5.3. It ends the Phase3D construction exception and authorizes no
new scope. Providers, complete tools, authenticated transport, durable loop resume,
UI cards, packaging and release remain unqualified.
