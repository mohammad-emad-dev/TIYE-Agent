# Implementation coverage and remaining exit review

| Contract behavior | Actual test evidence |
| --- | --- |
| Fixed worker, public environment, unchanged core imports | Two boundary checks plus descriptor and environment assertions |
| Two live workers, FIFO, approval and question occupancy | Normal two-worker result, simultaneous after-write barriers, one-slot FIFO, explicit approval and answer |
| Six lifetime assignments | Six tasks complete in three explicitly prepared rounds; seventh descriptor refuses before launch |
| Durable claim before one delivery | Invoke audit counts, expired null claim, claim abort/lost reply and re-created controller without resend |
| Success requires exit and witness | Complete transcript/exit ordering, proof1, result-hold stop, duplicate/truncated/bad/extra output and mismatched IDs |
| Crash/hang uncertainty | Actual before/after-write exits and ten-second hangs, proof0/1, retained slot while another member progresses |
| Conflicting or unavailable proof | Duplicate writes, conflicting hash, absent write, rolled-back worker write and unavailable independent observer |
| Explicit recovery | Owner proof-backed resolution closes failed; fresh Leader handoff, separate approval and final mission completion |
| Core storage errors distinct from worker failure | Ten actual abort/lost-reply cases at claim, settlement, report, failure observation and stop; fresh reopen after shutdown |
| Stop fences dispatch before interruption | Ready/before-write/after-write/result barriers, cooperative stop, current-handle forced kill, pre-stop done stability |
| No automatic resolution or retry | Interrupted assignments retain attention, no intentional-stop crash notices, explicit fixture-only command redelivery |
| Historical acceptance | All181 accepted baseline tests and immutable source/artifact seals retained |

These tests cover the bounded synthetic execution portions of Architecture4.4
(team scheduling/lifecycle),4.6 (durable core state) and4.7 (failure/stop/recovery).
The separate Phase2F exit review must assess the contract as a whole and record
remaining gaps. This implementation record does not close that gate or authorize
another construction scope.

Remaining exclusions include real provider/native integration, UI, arbitrary
programs, hostile-code isolation, whole-controller/host crash containment, native
launch-error injection, unverified-cleanup qualification, throughput, general
process trees, migrations and release. Current-handle cleanup is source-reviewed
and exercised on fixed owned workers; no foreign-process discovery or kill occurs.
