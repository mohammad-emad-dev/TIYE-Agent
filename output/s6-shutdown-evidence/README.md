# S6 worker shutdown evidence on malformed lease input

A reproduced lease-parser failure no longer bypasses terminal evidence. The
updated worker records closed protocol-fault reasons and its last accepted
heartbeat sequence, then exits through the existing unconditional stop path.
Fault records remain invalid as normal lease-cleanup proof.

## Investigation

The historical failed run's protected Windows guardian report records owner exit
at approximately 0.66 seconds with a five-second deadline. Its terminal file was
absent. This evidence does not establish the exact cause of that historical run.

Source inspection found a concrete failure mechanism: the original namespace
worker called `lease_loop` before entering the `try/finally` that persisted the
terminal record and exited. Truncated EOF or malformed heartbeat input could
raise from that parser and bypass terminal persistence. A live control using
the sealed original parser and original namespace worker reproduced this behavior:
the service stopped, terminal evidence was missing, and its exit status was 1.
This control is not a replay of the complete historical Windows execution.

## Implemented change

The new lease loop preserves the existing nonce/sequence validation, one-second
lease, fixed read/buffer bounds and normal EOF/expiry behavior. Known malformed
input returns `fault-truncated`, `fault-oversize` or `fault-heartbeat`, preserving
the last accepted sequence. An OS read/selector error returns `fault-read`; that
branch is implemented but OS I/O faults were not injected in this cohort.

Lease processing and terminal persistence now sit inside the worker's
unconditional exit boundary. The existing status 71 stop still occurs when
terminal persistence fails. File presence or exit status alone grants no credit:
the unchanged `terminal_evidence` verifier rejects protocol-fault records.

No malformed heartbeat is treated as a valid heartbeat, normal EOF, successful
initialization or verified cleanup. No retry or native admission is enabled.

## Actual service tests

Thirteen cases passed in normal and optimized Windows host Python. Each uses
actual Ubuntu systemd service processes, held main/leaf pidfds, service cgroup
emptiness checks and a transferred private mount descriptor. The relay and test
controller retain mount ownership while the service stops.

| Cases | Expected result |
| --- | --- |
| Original parser and worker with truncated EOF | Missing terminal record reproduced; exit 1 |
| Updated normal EOF, expiry and fragmented producer writes | Normal terminal evidence accepted; exit 71 |
| Truncated EOF and exactly 4096 unfinished bytes | `fault-truncated`; cleanup evidence refused |
| Oversized buffer | `fault-oversize`; cleanup evidence refused |
| Malformed JSON, invalid UTF-8, wrong nonce, skipped sequence and empty frame | `fault-heartbeat`; cleanup evidence refused |
| Existing empty terminal file prevents exclusive creation | Worker still exits 71; invalid file earns no credit |

The protocol-fault cases record sequence 1, the last accepted heartbeat. The
fragmented-write case accepts sequence 2. Producer write fragmentation does not
prove which individual reads the OS chose. The persistence-refusal case uses
a controlled exclusive-file collision, not a hardware storage-failure simulation.

All public case outcomes remain unknown: these tests do not establish complete
Windows Job cleanup or persistent-copy retention. Normal lease evidence acceptance
is reported separately from overall cleanup. Fixed test mount references are
closed explicitly; diagnostic directories remain retained.

## Verification

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/shutdown-evidence/check.py
```

Run from the project root on the existing Windows/Ubuntu setup. The default
verifies saved source/artifact/reference hashes, generated runtime equality and
closed public verdict schemas. Add `--develop` for the thirteen live cases. Live
development also rejects a stale generated runtime before starting. Linux uses
`-I -S -B`; Linux optimization is not qualified.

The fixed matrix's combined verdict/private-locator report has an explicit 8 KiB
limit. The service source composition keeps its existing 128 KiB decompressed
cap, source transport keeps its 64 KiB envelope, and existing service/collector
budgets remain in use. These bounds are not a lifetime quota on all writes.

Runtime paths, process identities and diagnostics remain in protected local
captures. Public evidence contains selected verdicts and hashes. The historical
guardian finding is recorded with the source report's digest, without its paths
or identities. Previous sealed cohorts are unchanged. Hashes detect drift and
do not provide signed provenance.

## Remaining limits and next step

The fix is qualified in this direct service/lease fixture. It has not yet been
ported into the latest full Windows keeper/recovery composition. Keeper behavior
on protocol-fault shutdown, unknown-state preservation through that full schedule,
collector/keeper loss and restart recovery remain separate qualification work.

The exact historical failure remains unattributed. The reproduced parser path
is fixed here; other causes of missing terminal evidence remain possible.

Next: integrate the validated lease component into Windows keeper supervision
and verify protocol faults remain unknown while mount ownership is preserved.
Native execution/admission remain disabled. L1/L2 remain PARTIAL, P1/P2 OPEN,
A1 BLOCKED and Phase 1 HOLD. C0 configuration and final-PATH observation remain
separate pending work.
