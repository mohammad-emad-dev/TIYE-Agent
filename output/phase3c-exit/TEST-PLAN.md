# Phase 3C exit execution plan

Approved contract cd5ec2f and implementation 1bf5731. Parent source review covers
the existing reporting codec/factory, bridge authority, queued loop, uncertainty
and stop ordering. Production sources stay byte-identical to implementation.
Retain all 346 cases. Append four real-core regression cases crossing a core-stop
SQLite abort/lost COMMIT reply with before-report/after-report barriers.

Each case uses the existing fixed witness, reporting fixture and actual schema7
store. Core-stop failure must still execute loop.stop in finally. Before-report
must consume no report ID/attempt; after-report must preserve its accepted receipt
and durable task result. The actual session stays active after rollback or stopped
after lost reply. No continuation, retry or new conversation follows. Reopen/replay
checks durable state. Fault hooks restore in finally; pumps/scripts dispose before
store close and private-root cleanup. No new process composition or fake core.

Pin all four package source/test inventories, compiled outputs, approvals, pinned
Node26.7.0 Windows x64 ABI147 and native dependency hashes before execution.
Three builds and four import/capability checks precede the full 350-test suite.
Retain the 960-second aggregate ceiling and all existing 10/5-second operation
limits, including the deliberately uncertain post-commit overrun case. No budget
extension, dependency change, provider/credential/network/UI action or migration.
Retain incremental raw streams and failed attempts under a fresh .git capture.

Exit qualifies only the approved bound offline report tool and in-memory loop.
Architecture 4.2/5.1/5.3 remain partially implemented. No provider, durable loop
recovery, complete tool set, UI or release qualification follows. The exception
ends at exit; no subsequent construction scope is authorized.
