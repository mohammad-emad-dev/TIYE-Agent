# S6 read-only inspection of interrupted enrollment

The original live observer can now ask the keeper for enrollment status without
restoring release authority or permitting another enrollment. Three fixed fault
cases passed through Windows/Ubuntu supervision. All before/after outcomes remain
unknown, cleanup unverified and native execution disabled.

## Read-only status

The `inspect-recovery` request requires the original observer's socket credentials,
full live identity and unsignaled pidfd. The keeper checks the held mount identity,
the fixed fixture metadata and the complete original unknown receipt. It checks
standby exit through the pinned pidfd; an ended standby is not rediscovered by PID.
A live standby must still match its pinned full identity.

The response explicitly identifies `stateSource: live-keeper`. It distinguishes
the keeper's pending/committed memory state, standby liveness and owner-receipt
validation. Committed receipts must match all original authority bindings and the
immutable unknown-receipt digest. Pending enrollment never claims a valid owner
receipt. Inspection does not change authority, rewrite receipts, retry enrollment
or grant release. Repeated inspection must return the same status in each test.

This is not recovery from disk after keeper restart. In particular, an incomplete
or errored write cannot prove what survived a crash. The keeper's live memory
state and receipt validity are separate evidence.

## Actual fault cases

| Windows context | Fixed fault | Observed enrollment | Standby | Owner receipt verified |
| --- | --- | --- | --- | --- |
| Owner exit | Caller closes enrollment socket without reading acknowledgement | Committed | Live | Yes |
| Heartbeat stall | Exclusive partial owner-record write followed by injected EIO exception | Pending | Live | No |
| Guardian loss | Committed standby terminated through held pidfd | Committed | Ended | Yes |

The unobserved-ack case proves caller uncertainty; it does not assert whether the
keeper's acknowledgement reached a kernel socket buffer. The partial-write case
writes and synchronizes a real one-byte incomplete record before raising a
fixture-only exception. The test verifies its metadata and unchanged content
before and after teardown. This does not simulate a hardware or filesystem crash.

Every case refuses original-owner release, a second enrollment, an inspection
request containing an extra permission field and inspection by another same-UID
process. Windows correlates the exact status with its original nonce, keeper,
mount and unknown-receipt digest. Seven mutated status variants are refused by
the host boundary test.

## Fixture teardown and timing

Inspection runs after the shared scheduled unknown observation. Explicit test
teardown targets only the original pre-held synthetic keeper pidfd, verifies its
exit, terminates the pinned known standby and checks the keeper's fixed sentinel
identity/command before terminating it through a held pidfd. This is isolated test
driver behavior, not a new keeper release endpoint or restored original authority.
The unknown receipt stays unchanged and the charged service root is audited.

Final close remains refused while the holder is live. Both recorded snapshots
retain the same phase timings, cleanup denial, disabled automatic retry/deletion
and disabled admission. Only fixture-disposal status and custody state change.
Guardian loss keeps Windows Job emptiness unverified. Teardown earns no cleanup
credit and cannot extend the original schedule.

## Verification and evidence

Five tests passed in normal and optimized host Python: three actual lifecycle
cases and two boundary tests. The previous pre-enrolled recovery cohort's five
tests also passed a live regression run. Linux uses `-I -S -B`; Linux optimization
is not qualified.

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/enrollment-interruption/check.py
```

Run from the project root on the existing Windows/Ubuntu setup. The default checks
saved source/artifact/reference hashes, deterministic composition and public
schemas. Add `--develop` for the five tests. Live development now refuses a stale
generated runtime before starting tests. Four unused inherited test-driver
functions are removed from the composed payload to preserve its existing
128 KiB decompressed-source cap. The cap was not increased.

Receipts remain separately capped at 4 KiB each. A new private keeper-fault marker
is capped at 1 KiB. Paths, process identities, receipts, fault details and failed
case locators remain in protected local captures. Public records contain verdicts,
phase timings and hashes. Earlier sealed sources and reports are unchanged.

One optimized qualification attempt failed before interruption injection because
worker terminal evidence was absent. It correctly remained unknown. The cause
was not established; a bounded keeper diagnostic was added for future failures.
The final current-source normal and optimized cohorts passed. Earlier stale-file
development results are not published as qualification evidence.

## Remaining work

Cold restart, keeper/observer/collector loss during reconciliation, lost or
ambiguous storage writes beyond this fixed exception, standby replacement and
hostile same-UID processes remain unqualified. There is no automatic release,
re-enrollment, retry or receipt repair. A receipt cannot recover a lost mount.

Next: diagnose the remaining pre-fault worker-shutdown failure and qualify
keeper/collector interruption before designing disk-based authority recovery.
Native execution/admission remain disabled. L1/L2 remain PARTIAL, P1/P2 OPEN,
A1 BLOCKED and Phase 1 HOLD. C0 configuration and final-PATH observation remain
separate pending work.
