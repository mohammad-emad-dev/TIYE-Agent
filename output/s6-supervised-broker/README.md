# S6 keeper integrated with Windows/Ubuntu supervision

The independent retention keeper now participates in the existing shared-schedule
Windows guardian/Job and Ubuntu service fixture. Four actual lifecycle cases and
one receipt-rejection test passed. The program executed only fixed synthetic
Python fixtures, not a native candidate or model request.

## Ownership before startup

The observer accepts the worker's private mount descriptor through the existing
credential-checked socket. It spawns a separate-session keeper outside the worker
service cgroup and transfers a duplicate descriptor through an inherited private
socketpair. The keeper checks the mount identity, type, flags, capacities and
initial inventory. The observer acknowledges the producer only after the keeper
confirms ownership.

Before readiness, the keeper independently checks the service invocation and
startup identities, holds main/leaf pidfds, verifies the active fixture footprint,
and starts its own unrelated sentinel outside the service. The observer separately
holds the keeper and worker identities. The 2 MiB/64-inode designated tmpfs and
capless leaf's file/core limits remain in use. Keeper and observer have separate
sessions; they are not assigned separate cgroups from each other.

## Normal completion

On the normal observation command, the keeper verifies both worker pidfds signal,
the original process entries disappear, the cgroup empties and its sentinel
survives. It copies the exact allowlisted footprint through the held mount handle
into a fresh backing-filesystem directory, using the sealed bounded traversal,
readback, directory/file synchronization and manifest comparisons. Cleanup is
checked again after copying.

The keeper writes a separate exclusive receipt, capped at 4 KiB, outside the charged
service root. It binds the run nonce, original keeper identity, startup record,
service invocation, cleanup observations, observer-loss status and copy digest.
The observer requires the keeper's successful exit and held pidfd exit before
reading that receipt and independently reopening the copy. The ordinary service
audit then completes through the existing exclusive `audit.json` creation.

## Forced observer termination

The fourth case arms a separate recovery witness during initialization. It checks
the live service descriptor and invocation, refuses overlapping process roles,
and holds pidfds for the original observer, keeper, service main and leaf before
acknowledging readiness. The collector checks that acknowledgement against the
identities received in the original ready record.

During the EOF phase, the witness sends actual `SIGKILL` through the held observer
pidfd. It confirms observer exit and that the held keeper is still alive, then
returns a target-bound killed acknowledgement. The Windows adapter releases its
owner only after that acknowledgement. It does not treat termination of a Windows
WSL wrapper as proof of Linux observer death.

The keeper detects the original observer's pidfd exit or confirms exit after
control EOF. It independently completes service cleanup, copies the fixed data
and persists its receipt. The recovery witness waits for keeper exit, independently
checks the held worker exits and absent original entries, validates the exact
receipt bindings, checks the cgroup and reopens the complete copy.

The recovery witness performs the final charged-root audit. The existing exclusive
`audit.json` is the completion token: an already audited or partially audited root
is refused rather than retried. The injected observer was blocked before its
observation command, so it could not perform this audit first. The collector also
waits for recovery process exit and runs a separate copy verifier afterward.

## Observed outcomes

| Windows case | Linux observer | Keeper retention | Overall cleanup |
| --- | --- | --- | --- |
| Owner exit | Remains alive through observation | Verified | cleanup-observed |
| Heartbeat stall | Remains alive through observation | Verified before Windows fallback | cleanup-observed |
| Guardian loss | Remains alive through observation | Verified | unknown |
| Owner exit after observer SIGKILL | Killed through pre-bound pidfd | Recovered and independently verified | cleanup-observed |

The Windows collector checks its actual held owner/protocol processes and guardian
Job result. Guardian loss keeps Job emptiness unknown and cannot earn overall
cleanup credit from the Linux result alone.

The fifth test refuses five receipt variants for specific reasons: wrong nonce,
wrong keeper identity, incorrect observer-loss status, incomplete cgroup cleanup
and a non-finite observation duration. These refusals occur before opening any
purported retained-copy path.

Five tests passed in normal and optimized Windows Python. Linux fixtures use
`-I -S -B`; Linux optimization is not qualified. From the project root on the
qualified Windows/Ubuntu setup:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/supervised-broker/check.py
```

This verifies saved source/artifact/reference hashes and verdict schemas offline.
Add `--develop` to execute the five fixed tests. Failed runs keep private
diagnostics and do not publish successful observations. Hashes detect local
drift, not signed build provenance.

## Accounting, timing and remaining limits

The existing shared coordinator and Windows guardian remain in control. Keeper
and recovery operations stay within their adapter phases; late or unsettled work
cannot earn cleanup credit. Harness settlement remains outside credited timing.
The 1-second Linux lease, 20-second service maximum, 2-second stop timeout and
5-second Windows guardian remain unchanged. The coordinator is not a kernel
real-time kill guarantee.

The service root retains its 128 KiB content allocation and final inventory audit.
Keeper receipts have their separate 4 KiB cap. Copy traversal retains the separate
128 KiB content cap per pass, 64-node cap and 64 KiB regular-file cap. These are
not a combined lifetime gross-allocation budget or a quota on all process writes.
Recovery diagnostics share the existing charged private Windows collector capture.
Its fixed copy-verifier subprocess buffering does not qualify arbitrary RPC.

Runtime paths, process identities and receipts remain in protected local captures;
public observations contain selected verdicts and hashes. Private keeper receipt
directories and copies are retained for inspection. No reboot/power-loss survival
claim is made.

This qualification covers known synthetic content after readiness, including the
specific observer fault before its observation command. It does not qualify
startup loss, observer failure at every later instruction, keeper failure,
recovery-witness failure, arbitrary unknown native content or hostile same-UID
processes. The standalone broker's unknown-holding loop is **not** yet ported to
this integrated keeper. Unexpected inventory or another keeper failure can fail
the run and release its mount reference; unknown native state must not be admitted.

Native execution/admission remain disabled. L1/L2 remain PARTIAL, P1/P2 OPEN,
A1 BLOCKED and Phase 1 HOLD. C0 configuration and final-PATH observation remain
separate pending work.

Next: port the unknown-state holding and explicit recovery/release policy into
the supervised keeper before native-state admission.
