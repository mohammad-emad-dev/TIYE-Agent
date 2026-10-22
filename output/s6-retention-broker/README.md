# S6 retention broker under observer loss

A separate broker now demonstrates retention of the fixed synthetic mount when
its observer exits or is killed. This is a standalone Linux qualification under
WSL, reusing the sealed mount inspector and real systemd worker service. It is
not yet composed with the Windows guardian, Job or shared schedule.

## Ownership and ordering

The observer receives the worker's private tmpfs directory descriptor through
the existing credential-checked UNIX socket. It forwards a duplicate through an
exclusive inherited socketpair. The broker validates the descriptor, mount type,
flags, capacity, identity and initial inventory before acknowledging ownership.
Only then may the observer acknowledge the worker and allow fixture startup.
Socketpair creation-time credentials are not presented as child authentication;
the endpoint is inherited exclusively by the known child process. The named
worker-facing endpoint retains its actual kernel credential checks.

The broker and observer are outside the worker service cgroup and its descendants.
They use different process sessions, but are not assigned separate cgroups from
each other. This tests individual observer process failure, not destruction of
their shared ancestor cgroup. The real service retains its separate-session leaf,
capability/file limits and `KillMode=control-group` policy.

The outer harness binds observer, worker-main and leaf identities with pidfds
before arming the fault. The broker independently holds those identities.
Observer termination is confirmed by pidfd and subprocess exit status, including
an actual `SIGKILL` result in the forced cases. The broker checks the service
invocation identity, sends one heartbeat and closes its service input. Copying
waits for both worker pidfds to signal and the service cgroup to become empty.
The outer harness independently checks the same exits and cgroup state.

After those checks, the outer harness temporarily receives the held mount handle
and writes a fresh random challenge into a known fixture file. It closes that
handle before authorizing copying. The completed copy must contain that exact
challenge and match the entire expected inventory. This rejects a stale or
prematurely completed copy. The ordinary host mountpoint is independently checked
to remain the original empty directory, rather than exposing the private data.

## Observed cases

| Case | Required observed result |
| --- | --- |
| Observer exits normally | Complete copy is reopened and verified after the broker exits |
| Observer is killed | Same verification, after confirmed observer `SIGKILL` and worker cleanup |
| Killed observer plus unexpected fixture node | Copy refused, unknown receipt persists, broker holds mount across control EOF and invalid release request |

The unexpected-node case creates only known synthetic bytes. The broker refuses
the unknown name before reading its contents and writes a bounded private
`unknown` receipt. There is no complete-copy claim or destination locator.
The harness disconnects the original controller socket, confirms the broker
remains alive, and probes the original mount identity and unexpected entry.
An invalid release nonce is refused without closing the held descriptor. Only a
valid explicit `release-fixed-fixture` request from the original test parent
allows this known synthetic mount to be released. The receipt remains unknown;
release does not promote it to verified retention.

The holder has no timeout or control-EOF release once it enters this unknown
holding state. Request timeouts and malformed requests are refused while the
holder remains alive. This does not qualify controller loss before that state,
recovery by a new owner, hostile same-UID traffic or arbitrary operating-system
failures. Its parent PID check is for this fixed live harness, not a general
administrative recovery protocol.

## Storage and verification

The copy reuses fd-relative no-follow traversal, exact alias-target checks,
owner/mode checks, file readback, synchronized files/directories and complete
manifest comparison from the [limited-observer checkpoint](../s6-limited-observer/README.md).
Known copies use a fresh backing-filesystem directory outside the mount.
The outer process reopens them only after the broker has exited and confirms the
complete manifest and fresh challenge. Existing helper aliases are copied as
validated links, never followed to their executable targets.

The existing source/config/retention bootstrap and worker-record write helpers
keep their disjoint byte allocations. The broker receipt has a separate 4 KiB
cap, exclusive creation, file type/owner/mode/link checks and readback. No final
legacy service-inventory audit or combined new whole-run budget is claimed.
Retention retains its separate 128 KiB content cap per pass, 64-node cap and
64 KiB regular-file cap; repeated passes and allocated filesystem metadata are
not a lifetime gross-allocation limit. Windows transport is privately captured
and charged through the existing collector partition.

Private capture contains Linux root/copy locators and diagnostics. Published
observations contain only closed verdicts and source/reference hashes. Private
runtime directories, copies and receipts are left for inspection. Hashes detect
local drift and are not signed build provenance.

Three real scenarios passed in normal and optimized Windows Python. Linux uses
`-I -S -B` without optimization qualification. From the repository root on this
Windows/Ubuntu setup:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/retention-broker/check.py
```

This verifies saved hashes and verdict schemas offline. Add `--develop` to run
the three fixed scenarios again. A failure retains protected diagnostics and
does not publish a successful observation. Harness error teardown may kill its
own known synthetic broker; that disposal path is not a native-state policy.

## Remaining admission work

This qualifies observer loss after the broker has accepted ownership. Broker
failure, power loss/reboot, startup interruption before handoff, arbitrary unknown
native-state preservation, independent broker recovery and integration with the
full Windows/Ubuntu lifecycle remain unqualified. Receipt synchronization is not
a reboot-survival promise. The tmpfs bound applies only to that filesystem;
there is no process-total disk/RSS quota or general sandbox claim.

Native execution/admission remain disabled. L1/L2 remain PARTIAL, P1/P2 OPEN,
A1 BLOCKED and Phase 1 HOLD. C0 configuration/PATH work remains separate.

Next: integrate this broker with the full supervised lifecycle and define its
own failure/recovery policy before native-state admission.
