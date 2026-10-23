# S6 inspector acknowledgement and process-loss reconciliation

The original live observer can now inspect the keeper's latched inspector
enrollment without changing it. An unobserved acknowledgement or dead inspector
does not permit replacement, release, deletion, retry or native execution.

## Implemented change

`inspect-custody-enrollment` requires the exact event/nonce schema and the original
observer's live pidfd, identity and peer credentials. It reports the pinned
identity, occupied slot, keeper/mount bindings, memory-only persistence and
live/ended state. Liveness comes from the original inspector pidfd. An ended
process is never looked up again by PID. The endpoint adds no reset operation
and never changes inspection or receipt-backed release enrollment.

## Actual faults and outcomes

Five tests passed in normal and optimized Windows host Python: two actual
Windows/Ubuntu lifecycle cases and three host boundary tests.

| Interruption | Evidence fixture | Verified behavior |
| --- | --- | --- |
| Enrollment acknowledgement not observed | Invalid terminal plus blocked unknown receipt | The observer sends enrollment and closes the socket without reading its reply; status confirms the live occupied slot; that inspector later verifies custody after original-observer SIGKILL |
| Inspector killed after acknowledged enrollment | Missing terminal and verified unknown receipt | The original observer signals the pinned inspector pidfd and waits for exit; status remains occupied/ended; the original observer still verifies the held mount inventory |

These are deliberately different failure sequences. The first qualifies an
unobserved acknowledgement, without claiming a particular network packet was
lost. The second keeps the original observer alive; subsequent combined observer
and inspector loss is unqualified.

Both cases reject duplicate enrollment, an independently live replacement
process, release, a status request with extra fields and foreign status access.
Status is read again to check that refused requests did not alter the slot.
The live replacement canary is stopped only through its original held pidfd as
explicit synthetic teardown. Its rejection is not inferred from presenting an
already dead identity.

Custody and receipt verification stay separate. The blocked-receipt case never
receives receipt credit. All before/interruption/disposal snapshots stay unknown,
with cleanup, deletion, retry, release and native admission disabled. Synthetic
fixture disposal uses original keeper/sentinel pidfds and grants no cleanup
credit. Missing evidence is not restored and no successful Linux final-inventory
audit is manufactured.
Post-disposal enrollment fields retain the last verified observation; keeper
memory does not survive fixture teardown.

## Verification corrections

The first inspector-death attempt reached the expected state and explicit fixture
teardown, but capture validation rejected the `setsid` wrapper's signal diagnostic.
Only the exact observed diagnostic for the pinned inspector PID is now permitted
in that branch, with a 512-byte capture bound. Other stderr still fails. This
qualifies the existing GNU `setsid`/fixed-locale environment, not arbitrary wrappers
or translated diagnostic formats.

Another preliminary attempt failed before enrollment when a retiring service
cgroup returned `ENODEV` while reading `cgroup.events`. The new composition treats
ENOENT/ENODEV as uncertain while the directory still exists, and confirms absence
with an explicit stat before reporting emptiness. Permission and other errors
propagate. Fixture observation polls within a three-second bound; the existing
Windows guardian deadline is unchanged.

The cgroup boundary test injects kernel-read failures at the filesystem boundary
and verifies that present directories receive no emptiness credit and permission
errors remain failures. The final live runs use actual service cgroups. The
preliminary failures are not included in qualified results; their diagnostics
remain local. The unsettled cgroup-failure attempt received no teardown credit,
and remaining ownership was not requalified or cleaned up by PID rediscovery.

## Recheck

```powershell
rtk proxy python -B feasibility/s6-wsl/inspector-interruption/check.py
rtk proxy python -O -B feasibility/s6-wsl/inspector-interruption/check.py
```

Run from the project root on the existing Windows/Ubuntu setup. Default checks
verify source/artifact/reference hashes, generated runtime equality and closed
public schemas. Add `--develop` for the five tests. Linux uses `-I -S -B`; Linux
optimization is unqualified. The inspected slot remains only in keeper memory.

The runtime preserves its 128 KiB decompressed-source and 64 KiB transport caps.
Unused fixture drivers and superseded unaliased definitions are removed only
from this composition. Earlier sealed sources remain unchanged. Existing lease,
Windows deadline, service and capture limits remain in use; they are not a
lifetime quota on all writes. Public artifacts omit raw process identities and
runtime paths. Hashes detect drift without signed provenance.

GPT-6 Luna at max completed a supplied-design review. The parent implemented and
reviewed the final code. GLM-5.3-Flash Free at max and DeepSeek V4.1 Flash Free at
max timed out without findings. No external final-code audit is claimed.

Next: specify the user-visible recovery decision for held unknown data, including
what evidence permits an explicit export and what remains held when no inspector
survives. Persistent recovery after keeper exit/reboot and hostile same-UID
behavior remain unqualified. Native execution/admission remain disabled. L1/L2
remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD. C0 configuration and
final-PATH observation remain separate pending work.
