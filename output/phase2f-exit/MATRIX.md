# Contract exit mapping

| Required contract evidence | Review and actual evidence |
| --- | --- |
| 1 Fixed executable/worker, environment, core boundary, refusal | Unchanged core boundary plus fixed worker graph check; public environment assertions; descriptor/mode/extra identity refusal; real core-path rejection before spawn |
| 2 Scheduling and limits | Actual two-worker after-write barriers establish overlap; cap1 FIFO; approval/question pause; six lifetime assignments; expired claim and stop-before-invoke |
| 3 No false success | Verified exit/full transcript before done; result-hold stop; malformed/duplicate/truncated/extra output, ID mismatch, write abort, absent/duplicate/conflicting/unavailable witness; new same-chunk stop guards |
| 4 Crash/hang and recovery | Real before/after-write crash/hang proof0/1, one claim/notice, retained FIFO slot while another member progresses, explicit owner resolution and fresh Leader handoff/approval/mission |
| 5 Durable transaction boundaries | Real abort and lost-COMMIT-reply cases at claim/settle/report/failure/stop; no invented crash on storage errors, exact explicit redelivery and fresh reopen after verified shutdown |
| 6 Stop order and races | Ready/before-write/after-write/result barriers, simultaneous two-worker stop, stop commit before owned close, late results ignored, pre-stop done stable; stop+invoke in one chunk now produces zero writes |
| 7 Ownership and teardown | Ten-second actual operation timeouts, cooperative exit and forced kill of current owned handles, verified exit plus stdio close, finally cleanup; source contains no PID adoption/process discovery/foreign kill |
| 8 Complete source-bound record | All223 accepted tests retained plus five exit regressions; reviewed inventories, compiled/native/runtime hashes, finite600-second budget, incremental local raw streams and immutable historical seals |

Architecture4.4: FIFO assignment, concurrency reservations, questions, explicit
reports/failures, recovery handoffs and mission completion are covered in the
trusted synthetic composition. This does not complete provider-backed team work.

Architecture4.6: core commands, SQLite events, ledger/replay and post-exit witness
reconciliation are covered on fresh schema7. No schema change or migration/reset.

Architecture4.7: controlled fixed-worker crashes/hangs, owner stop, conservative
uncertainty and explicit resolution are covered. No provider diagnosis, automatic
takeover/retry/approval or live-controller/host-crash survivor management.

The native OS launch-error and unverified-termination branches are source-reviewed,
not fault-injected; qualification is confined to the actual fixed executable and
controlled workers, whose exit was verified in every passing case. It does not
claim that arbitrary processes always terminate. Core storage rejection and
prelaunch refusal are exercised. Same-user role binding is trusted composition,
not authenticated hostile transport or an OS sandbox. Throughput, Electron/WSL ABI,
real provider/terminal/UI integration, real project actions and release remain
unqualified. Acceptance ends this bounded construction exception and grants no
new coding scope beyond it.
