# Phase 3E exit execution plan

Approved contract c58d57f; implementation 8f15ee3. Parent review covers the fixed
mission profile/codec, actual Leader binding, one writer, exact completed-session
receipt checks, closed-admission behavior, uncertainty, stop and cleanup.
Production stays byte-identical to implementation. Retain all 452 cases and
append two real-core cases using existing fixtures and fixed transport.

Case one independently holds the final transport after its end candidate, closes
the real core, then verifies local closure. Final receipt validation must fail:
the conversation is failed with no accepted text, but the known accepted mission
receipt survives and matches actual reopened core state. Case two stops from the
run.finished observer. Final acceptance already won, so both conversation and
mission remain accepted despite a rejected core-stop command and local fencing.
Assertions are outside isolated callbacks. Dispose pumps/scripts before store
close/root cleanup and reopen/replay actual state before cleanup.

Pin all four source/test inventories, compiled outputs, approvals, Node26.7.0
Windows x64 ABI147 and original native dependency hashes before execution.
Run three builds/four import-capability checks and the full 454-test TAP suite.
Retain the 1320-second aggregate ceiling and existing 10s request/5s cleanup
limits. Inherited real overrun cases expect uncertainty, not successful timing.
Keep incremental streams and failed attempts under a fresh .git capture. No
deadline extension, dependency, provider, arbitrary/rejecting adapter, new runner,
network, credential, UI or migration is introduced. Rebuilds reproduce bytes.

Exit qualifies only bounded complete_mission and prior fixed offline behavior,
partially mapping Architecture4.2/5.1/5.3. It ends the Phase3E exception and grants
no subsequent construction. Providers, complete tools, authenticated transport,
durable conversation recovery, UI, packaging and release remain unqualified.
