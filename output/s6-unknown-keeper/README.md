# S6 supervised keeper: copy refusal and explicit fixture disposal

The supervised Linux keeper now retains its mount reference when bounded
inventory or copying raises `ValueError` or `OSError`. It writes a separate
exclusive unknown receipt before acknowledging the refusal. Receipt or channel
failure does not authorize disposal. The keeper then serves a separate local
administration endpoint while retaining the mount.

Two actual Ubuntu lifecycle cases passed through the Windows collector, in normal
and optimized Windows Python. The first verifies ordinary supervised retention
and independently reopens the copy after the observer and keeper exit. The second
introduces one empty unexpected fixture file after service cleanup and verifies
the inventory refuses it. No unexpected file content is read.

## Holding and release

In the refusal case the observer closes its mount descriptor and control socket.
The keeper remains the mount owner. The observer reconnects to the administration
endpoint and checks that the receipt is unchanged and the keeper pidfd remains
live after a wrong nonce, malformed UTF-8 and a request timeout. A separate process
with the same UID and nonce is refused. Probe and release requests require the
original observer's socket credentials, full live identity and unsignaled pidfd.
Liveness is checked again immediately before returning from the release handler.

Only the explicit fixed-refusal fixture permits `release-fixed-fixture`. The
keeper checks that the injected file remains a regular empty file with the
expected owner, link count and permissions. This disposes the mount reference
containing known synthetic test bytes. The exclusive receipt remains unknown
before and after disposal; no copy, retry or native-admission credit is granted.
Other copy refusals have no qualified disposal route. Endpoint setup failures
retain ownership and retry endpoint setup; invalid requests and timeouts keep the
mount held. Original observer death cannot authorize a replacement observer.

## Verification

From the project root on the existing Windows/Ubuntu setup:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/unknown-keeper/check.py
```

This verifies saved source, artifact and reference hashes, deterministic runtime
composition and the closed observation schema. Add `--develop` to run the two
fixed Linux lifecycle cases. Linux runs with `-I -S -B`; Linux optimization is not
qualified. The previous supervised cohort's five tests were also rerun, covering
four Windows/Ubuntu schedules and its receipt-refusal test. Old sealed sources
and reports were preserved.

Private paths, identities, receipts and diagnostics stay in protected local
captures. Public evidence contains verdicts and hashes. The service still uses
its existing budgets, designated tmpfs limits and lease cleanup. Receipt content
is capped at 4 KiB. These limits do not impose a total lifetime storage quota.
Hashes detect drift and do not provide signed build provenance.

## Scope and next work

This checkpoint integrates the refusal policy into the composed supervised
keeper and tests its Linux service/observer lifecycle. It does **not** qualify the
new unknown result through the shared Windows phase coordinator. The earlier
Windows regression suite exercises its sealed successful-retention runtime.

The tested refusal is unexpected inventory. Other filesystem failures are routed
to holding in code but were not fault-injected here. Unknown state after observer
death, replacement-owner authentication, keeper failure, reboot survival and
hostile same-UID actors remain unqualified. The process and its mount reference
must survive for holding to continue. A receipt alone cannot recover a lost mount.

Next: propagate the unknown receipt and retained ownership through the shared
Windows schedule, preserving unknown after explicit synthetic teardown. Define
and qualify replacement-owner recovery before admitting native uncertain state.

Native execution/admission remain disabled. L1/L2 remain PARTIAL, P1/P2 OPEN,
A1 BLOCKED and Phase 1 HOLD. C0 configuration and final-PATH observation remain
separate pending work.
