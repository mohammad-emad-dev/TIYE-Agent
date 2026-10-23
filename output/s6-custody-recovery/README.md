# S6 live standby inspection after observer loss

A pre-enrolled read-only inspector can now verify the keeper's held mount after
the original observer exits, including when the unknown receipt cannot be
published. This adds diagnostic continuity. It grants no release, deletion,
retry, successful retention or native execution rights.

## Authority and state

The original live observer may send `enroll-custody-inspector` with the exact
nonce and one inspector identity. The keeper checks the original peer credentials,
full identity and held pidfd, validates the inspector's role separation and pins
its pidfd. Original authority is checked again before assigning the one-shot
slot. Assignment occurs before acknowledgement; losing the acknowledgement does
not make that slot available for replacement.

This inspection slot is separate from receipt-backed recovery enrollment's
identity, fd and committed fields. It remains only in keeper memory. It cannot
be reconstructed after keeper exit or reboot, and a restarted process cannot
claim it by PID or by reading a receipt. Invalid receipts still prevent the
existing receipt-backed enrollment path.

Before observer loss, custody queries require the original observer. After its
held pidfd signals, only the pre-pinned live inspector may query. The keeper
checks socket credentials, the inspector's full identity, its original pidfd and
a socket-bound peer pidfd. Both pidfds must remain unsignaled across the identity
check. Unsupported socket-pidfd operations refuse the request; there is no
PID-only fallback. This implementation qualifies the tested x86-64 WSL/Linux
environment and rejects other architectures for inspector peer verification.

Python's socket module on this machine omits `SO_PEERPIDFD`. The numeric option
comes from the [Linux v6.18 UAPI socket header](https://raw.githubusercontent.com/torvalds/linux/v6.18/include/uapi/asm-generic/socket.h).
A local socketpair check and both live scenarios verified kernel support.

The read-only query uses the same synchronous keeper loop as enrollment and
release and verifies a stable exact inventory through the held mount descriptor.
It returns the original bound keeper identity and mount digest. The keeper is
pinned before observer loss; its historical parent PID is not rediscovered or
revalidated after reparenting as a way to authorize access.

## Live verification

Four tests passed in normal and optimized Windows host Python: two live fault
scenarios and two host boundary tests. Actual Windows Job supervision and Ubuntu
systemd actors remain in use. The preceding cohort's controlled evidence faults
are reused: terminal unlink after worker exit, or terminal truncation plus an
exclusive empty-file collision at the keeper's receipt name.

| Evidence fault | Before observer loss | After targeted observer loss |
| --- | --- | --- |
| Missing terminal | Original observer verifies custody and unknown receipt | Pinned inspector verifies custody and unchanged receipt |
| Blocked receipt | Original observer verifies custody without receipt credit | Pinned inspector verifies custody without receipt credit |

The standby starts in a separate Linux session. It pins the original observer,
keeper and strictly identified synthetic sentinel before the fault. Early
inspection is refused. On an explicit test command it kills the original observer
through that already held pidfd and waits for its signal. The keeper and sentinel
remain live; the inspector checks the original inventory digest and unchanged
receipt state. Foreign inspection, release, replacement enrollment and an
extra-field request are refused, followed by another successful bound query.

All before/loss/disposal snapshots remain unknown. Fixture teardown uses only
the original keeper and sentinel pidfds, grants no cleanup credit and does not
restore missing evidence or manufacture a successful Linux final-inventory audit.
The blocked-receipt case never receives receipt verification credit. Generic
closure is refused while the recovery fixture remains unsettled.

## Initial launch correction

The first two live attempts reached verified initial custody but their standbys
did not emit readiness. A local launch control showed that `setsid` could exit
before WSL collected child output. Keeping the wrapper alive with `setsid --wait`
fixed that handoff; fresh source-bound instances then passed both modes.

Those failed attempts received no recovery or teardown credit. Their protected
diagnostics remain local and remaining ownership was not requalified after the
failed harness exited. No PID-based cleanup of those old attempts was attempted.

## Recheck and scope

```powershell
rtk proxy python -B feasibility/s6-wsl/custody-recovery/check.py
rtk proxy python -O -B feasibility/s6-wsl/custody-recovery/check.py
```

Run from the project root on the existing Windows/Ubuntu setup. The default
verifies saved source/artifact/reference hashes, generated runtime equality and
closed public schemas. Add `--develop` for the four live tests. Linux runs with
`-I -S -B`; Linux optimization is unqualified. The final snapshots do not extend
the original coordinator deadlines or change its settled unknown verdict.

The runtime remains within the existing 128 KiB decompressed-source limit and
64 KiB transport envelope. Obsolete, unreachable fixture recovery drivers are
removed only from this new composition. Earlier sealed cohorts remain unchanged.
The one-second lease, five-second Windows guardian deadline, service limits and
protected capture budgets remain in use. These are not a lifetime quota on all
writes. Public evidence omits raw process identities and runtime paths; protected
local captures retain them. Hashes detect drift without signed provenance.

GPT-6 Luna at max completed a supplied-design review. Its process-binding concern
led to socket-bound pidfd verification. GLM-5.3-Flash Free at max and DeepSeek V4.1
Flash Free at max timed out without findings. The parent implemented and reviewed
the final code; no external final-code audit is claimed.

Lost enrollment acknowledgements, inspector death, keeper restart/reboot and
hostile same-UID behavior are not live-qualified here. The historical missing
terminal incident remains unattributed. This is live custody inspection, not
persistent recovery ownership or recovered data copying.

Next: qualify lost inspector-enrollment acknowledgements and inspector death
without permitting replacement or release, then define explicit recovery of
unknown data beyond this live diagnostic path. Native execution/admission remain
disabled. L1/L2 remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD. C0
configuration and final-PATH observation remain separate pending work.
