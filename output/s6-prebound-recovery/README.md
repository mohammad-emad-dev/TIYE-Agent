# S6 pre-enrolled recovery after observer loss

A single standby process can now take responsibility for the keeper's refused
synthetic data after the original observer exits. The standby must be enrolled
while that observer is alive. This is not permission for an arbitrary process
to claim data after a failure.

Three actual Windows/Ubuntu lifecycle cases passed in normal and optimized
Windows Python: owner exit, heartbeat stall and guardian loss. Each begins with
the existing shared-schedule unknown observation, enrolls a standby, injects
observer `SIGKILL` through a held pidfd, verifies continued keeper custody and
explicitly disposes the known fixture through the standby. All snapshots remain
unknown with cleanup unverified and native admission disabled.

## Enrollment authority

The original observer enrolls the standby over the keeper's credential-checked
Unix endpoint. The keeper validates the complete identity schema, UID, process
roles and failure-domain checks, then pins the actual standby pidfd and live
identity. Worker, original observer and keeper roles cannot enroll as standby.

Enrollment and release share one synchronous keeper request loop. Pending
enrollment revokes original release before fallible record creation. An exclusive
`recovery-owner.json` record binds the nonce, original observer, keeper, standby,
service invocation, mount identity and original unknown-receipt digest. The
keeper synchronizes the record, reads it back and synchronizes its directory
before committing and acknowledging enrollment. Re-enrollment is refused.

An acknowledgement failure cannot restore original release authority. A failed
or partial enrollment remains blocked; its reconciliation and crash behavior
are not qualified here. The two independent receipt files are each capped at
4 KiB outside the charged service root. They do not provide signed provenance,
reboot recovery or a total storage quota.

## Recovery and explicit disposal

The standby independently holds the original observer and keeper pidfds before
enrollment. It checks the receipt-root identity and independently loads both
records through bounded, metadata-checked reads. Expected record comparisons use
canonical JSON, including exact boolean values and the standby's current full
identity. The historical unknown receipt is never rewritten to claim a copy.

Windows waits for the standby's enrollment-verified acknowledgement before
authorizing the synthetic fault. The standby verifies keeper liveness, sends
`SIGKILL` to the held observer pidfd, waits for observer exit and checks keeper
liveness again. The keeper's successor authority requires the original pidfd to
signal and matches the request's socket credentials to the still-live pinned
standby identity. It rejects release while the original observer is alive.

After observer loss, the standby probes custody, verifies both records are
unchanged and waits for a separate explicit fixture-disposal command. Disposal
then verifies keeper pidfd exit, unchanged records, empty worker cgroup and the
charged-root audit. Windows correlates the reports, waits for standby exit,
drains both reader sets and audits collector accounting. Only then may final
close release the Windows handles.

Recovery and disposal occur outside credited phase timing. The shared coordinator
does not gain cleanup credit or new work time from either operation.

| Snapshot | Keeper ownership | Overall outcome | Cleanup verified |
| --- | --- | --- | --- |
| Scheduled refusal | Held | Unknown | No |
| Observer lost and standby verified | Recovered and held | Unknown | No |
| Explicit fixed-fixture disposal | Disposed | Unknown | No |

Guardian loss keeps Windows Job emptiness unverified in every snapshot. The
other two cases preserve their original observed Job-empty result. Historical
keeper liveness is an observation, not continuous Windows kernel attestation.

## Verification

Five tests passed per host Python mode: three real lifecycle tests and two
boundary tests. Every lifecycle case also refuses malformed enrollment,
duplicate enrollment, release by the revoked original owner, standby release
before observer exit and release by another same-UID process after observer
loss. Premature final close retains the live successor and its handles.

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/prebound-recovery/check.py
```

Run from the project root on the existing Windows/Ubuntu setup. The default
checks saved hashes, deterministic runtime composition and closed public verdict
schemas offline. Add `--develop` for the five fixed tests. Linux uses `-I -S -B`;
Linux optimization is not qualified. Prior sealed sources and reports remain
unchanged. Runtime identities, paths and receipts stay in protected local captures.

An initial command-ordering test failure was corrected by adding the explicit
enrollment-verified acknowledgement. Its three known synthetic holders were
separately disposed after checking source hashes, original process identities,
held pidfds, mount identity and the empty injected fixture file. That private
test disposal granted no recovery or cleanup credit; the failure evidence remains.

## Remaining limits

This qualifies one pre-enrolled standby and the specific injected observer fault
after unknown holding. It does not qualify arbitrary replacement after loss,
standby failure, keeper failure, collector restart, concurrent hostile same-UID
actors, lost enrollment acknowledgements, power loss or reboot survival. The
standby does not receive the mount descriptor; the keeper remains its owner.
Loss of that keeper can still lose the mount, which a receipt cannot restore.

Next: qualify failed or interrupted enrollment and standby loss, including how
an operator can reconcile committed authority without automatic release or
re-enrollment. Native execution/admission remain disabled. L1/L2 remain PARTIAL,
P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD. C0 configuration and final-PATH
observation remain separate pending work.
