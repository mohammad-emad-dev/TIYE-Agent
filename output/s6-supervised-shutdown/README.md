# S6 supervised shutdown preserves unknown custody

The validated lease-parser correction is now integrated into the full Windows
guardian and Ubuntu keeper fixture. Protocol faults remain diagnostic evidence
and cannot authorize successful retention, automatic deletion or native execution.

## What changed

The composed namespace worker uses the sealed bounded parser and unconditional
status-71 exit boundary. The keeper checks worker exit and terminal binding before
attempting normal retention. Protocol-fault, missing or invalid terminal evidence
enters the independent unknown-custody holder. Failure to write or acknowledge
the unknown receipt does not authorize closing the held mount descriptor.

Normal EOF and expiry still pass through the original terminal verifier. The
protocol reason and last accepted sequence are reported separately from cleanup
authority. Receipt, invocation, process and mount bindings remain checked.

The new composition preserves the earlier cohorts unchanged. It removes obsolete
fixture drivers from its packed runtime to stay within the existing 128 KiB
decompressed-source limit. The 64 KiB transport envelope, resource partitions,
one-second lease, five-second Windows guardian deadline and service limits remain
unchanged. These limits do not establish a lifetime quota on all writes.

## Live verification

Seven tests passed in both normal and optimized Windows host Python. Five use
actual Windows Jobs, Ubuntu systemd services, original held process handles and
pidfds, service cgroup observations and a transferred private mount descriptor.

| Windows schedule | Input | Observed terminal |
| --- | --- | --- |
| Owner exit | Truncated frame followed by EOF | `fault-truncated` |
| Owner exit | Oversized pending frame | `fault-oversize` |
| Stalled owner | Wrong nonce | `fault-heartbeat` |
| Guardian loss | Normal producer closure | Normal EOF or expiry |
| Owner exit | Normal producer closure | Normal EOF or expiry |

Each result verifies an unknown receipt and live keeper custody, including probes
before and after the observer closes its duplicate mount descriptor. Generic
session closure is refused while custody remains held. Explicit synthetic fixture
disposal uses the original keeper pidfd and a freshly held, strictly identified
fixture sentinel. It does not grant cleanup credit: each public result remains
unknown with retry, deletion and native admission disabled after disposal.

The two boundary tests reject altered process/mount/invocation bindings, invalid
terminal reasons and sequences, permission promotion, invalid guardian results
and disposal before a settled unknown observation. Saved evidence validation
also requires the exact five-case matrix and unchanged before/after verdicts.

## Windows observation race

An initial run obtained valid protocol-fault and held-custody reports but failed
the inherited Windows outcome checker in two cases. The injected fault had
already stopped the service and WSL client; the owner then exited with status 17.
The guardian sampled an empty Job before its owner-exit branch and returned
`job-empty`, status 0 and active count 0. This is distinct from the guardian
terminating remaining Job processes after observing owner exit.

The new checker accepts that narrow outcome only for the owner-exit fault
fixtures. It still requires exact identity/composition bindings, root status 17,
an empty Job, a signaled root, zero active processes, bounded timing and guardian
status 0. Other outcomes use the sealed original verifier. Boundary mutations
exercise this branch. No deadline was extended and no result was promoted.

Those initial failed attempts did not receive teardown credit. Their protected
diagnostics are retained; remaining ownership was not requalified after the
failed harness exited. No cleanup by PID rediscovery was attempted. Final
qualification uses fresh instances bound to the current source hashes.

## Review and scope

GPT-6 Luna at max completed a supplied-design review and identified accidental
mount release through the old keeper's `finally` as the principal risk. The
parent implemented and reviewed the patch. GLM-5.3-Flash Free at max and DeepSeek
V4.1 Flash Free at max both failed without final findings. They did not audit
the final code. No substitute model was used.

This cohort live-tests three protocol faults and two normal controls under the
shared Windows schedule. Missing/invalid terminal files and receipt/channel I/O
failures are handled in code but are not injected here. Direct-service exclusive
terminal-file collision coverage remains in the sealed shutdown-evidence cohort.
Recovery enrollment helpers remain composed; their earlier recovery scenarios
are not requalified by these five schedules. Linux optimization, keeper loss,
reboot recovery, hardware failures and hostile same-UID behavior are unqualified.
The exact historical missing-terminal failure remains unattributed.

Public artifacts contain verdicts, timings and hashes. Runtime paths, process
identities and raw diagnostics remain local. Hashes detect drift, without signed
provenance. Tests use fixed synthetic actors and make no provider requests.

## Recheck

```powershell
rtk proxy python -B feasibility/s6-wsl/supervised-shutdown/check.py
rtk proxy python -O -B feasibility/s6-wsl/supervised-shutdown/check.py
```

Add `--develop` to run the seven live checks on the existing Windows/Ubuntu setup.
The default verifies saved source/artifact/reference hashes, generated runtime
equality and the closed public schema. Live runs also refuse a stale runtime.
Linux runs with `-I -S -B`.

Next: qualify absent/invalid terminal evidence and failed unknown-receipt
publication under keeper supervision, then connect that uncertainty to the
existing recovery enrollment path. Native execution/admission remain disabled.
L1/L2 remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD. C0 configuration
and final-PATH observation remain separate pending work.
