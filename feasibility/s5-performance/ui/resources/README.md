# S5 resource measurement pilot

This additive cohort prepares process measurements for the S5 long run. Each
view runs five isolated native PTY producers for 60 seconds, then retains the
Electron shell for an idle observation to at least 120 seconds total. It does
not satisfy the plan's about-hour mixed workload with a large event feed.
Full S5, memory settling and production eligibility remain unqualified.

The [initial observation](evidence-initial.json) and its exact
[main-process source](snapshots/main-initial.cjs) remain preserved. Its sample
near 64 seconds was tagged flood after producers had exited, so its active
coverage is false. The current source makes this lifecycle interval explicit
as transition. No sample is removed or replaced, and the 60-second flood,
120-second minimum total and performance targets are unchanged.

## Corrected observations

Reviewed 15 October 2026. [Evidence](evidence.json) records all five members'
raw PTY capture, persisted bytes and renderer receipts with matching hashes;
each producer runs at least 60 seconds and exits normally. Both views have
complete active and idle sample coverage under the definitions below.
Normal owned-runtime cleanup completed.

| Measurement | Grid | Focus |
|---|---:|---:|
| Total pilot duration | 121.87 s | 121.63 s |
| Flood / transition / idle snapshots | 12 / 1 / 10 | 12 / 1 / 10 |
| Main peak private bytes, MiB | 89.94 | 87.63 |
| Renderer peak private bytes, MiB | 92.71 | 71.85 |
| Main peak CPU, one-core percent | 11.11% | 11.76% |
| Renderer peak CPU, one-core percent | 47.23% | 20.08% |
| Synthetic input ACK maximum, 28/28 completed | 24.08 ms | 33.86 ms |
| RAF scheduling gap maximum | 16.6 ms | 13.1 ms |
| Resource collection call maximum | 377.42 ms | 341.98 ms |

CPU peaks are interval averages across the sampled run, not instantaneous
peaks. Per-worker, per-producer and auxiliary-process series and memory
maxima are retained in the evidence. These measurements have no CPU/RAM
pass threshold. Only the existing synthetic input and RAF gap targets pass;
memory settling remains unqualified.

## Process measurement contract

Worker PIDs come directly from process launch. Each worker sends its actual
PTY producer PID over its dedicated Node IPC channel. Main and renderer PIDs
come from Electron's own process APIs; auxiliary Electron processes are also
registered. A fixed PowerShell script receives only this bounded PID list over
stdin and reads each process individually. It performs no command-line or
system-wide process inventory, and never selects a process to terminate.

The sampler runs approximately every five seconds, with sampling duration
added to the interval. It records cumulative process CPU time, working set,
private committed bytes and a monotonic timestamp for each present process.
Process start identity is compared across samples. Published evidence retains
role labels and counters, with raw PIDs and start identities removed.
The application core does not yet exist and is explicitly absent from this
measurement. Console helper processes and the sampling PowerShell process
are outside the role inventory; this is not whole-machine accounting.

CPU is computed as `delta CPU milliseconds / delta elapsed milliseconds * 100`.
100% represents one fully used logical CPU, not 100% of the machine. Working
set includes shared pages; do not sum working sets as physical memory use.
Private bytes are committed memory, not resident memory. Missing, inaccessible
or identity-changed processes have no fabricated zero counters. CPU intervals
never bridge a missing sample; decreasing counters or nonpositive intervals
produce null CPU values.

Flood-phase coverage requires every required role present at each flood-tagged
sample and at least eight present samples per role. Producers and workers
naturally exit after output completes; their absence during idle is expected.
Idle count coverage requires at least eight present samples for main and
renderer; the evidence check also refuses gaps in a claimed idle pass.
The five-second lifecycle sampling can straddle process exit: any
missing role in a flood-tagged sample conservatively makes flood coverage
incomplete. The corrected cohort tags collections that finish at or after
60 seconds as `transition` until idle begins. Idle starts only after 65 seconds
and all workers have exited. Transition samples are retained with all their
counters/statuses and are excluded from active and idle coverage counts.

Observer overhead is recorded as each sample's collection duration; it is
not subtracted. The renderer retains the bounded run's receipt chunks for
output verification, and final digest allocation occurs after sampling.
No forced garbage collection is used. Short idle deltas cannot establish
memory settling, a leak, or long-run stability.

## Reused and changed sources

The previous [flood cohort](../flood/README.md) stays byte-identical. This
cohort forks only its main, worker, renderer, build and runner sources as a
separate measured version. It reuses the unchanged producer, preload,
HTML and metric functions through explicit paths. The worker adds PID IPC;
main adds sampling and the idle observation. No new dependency or vendor
provider/model call is made by the benchmark.

The same raw PTY storage, capture and renderer receipt hashes are compared.
Synthetic input-to-render ACK and RAF scheduling proxy measurements retain
the previous boundaries and thresholds. They do not measure physical
keyboard-to-photon latency or GPU frame rate. Only terminal zero receives
input probes; all five terminals produce output.

## Reproduction and checks

Native Windows prerequisites are the existing S1 installation resolved by
the parent [toolchain](../toolchain.js): Electron 38.8.6, node-pty 1.1.0,
xterm 5.5.0 and esbuild 0.21.5, plus Windows PowerShell. No install is run.
From this directory:

```powershell
rtk proxy npm run check
rtk proxy npm run build
rtk proxy npm run check:runtime
```

The offline check recomputes resource summaries and inherited flood metric
contracts and verifies measured source hashes. The runtime check additionally
verifies ignored local bundles against recorded build hashes. Regression
tests cover CPU scaling, missing intervals, identity changes and malformed
sampler responses.

`rtk proxy npm run probe` runs grid then focus, with a 180-second per-view
deadline. It refuses to overwrite existing evidence with
`Existing evidence preserved; no new launch`. Keep the benchmark foreground
during input probes. Future native cohorts need separate evidence/source
mappings, rather than deleting an existing observation.

Successful cleanup checks marked canonical ownership and the complete local
inventory, then removes exact files/directories. Failures preserve the owned
temporary root and print its path. Abnormal process-tree recovery remains
unqualified. The protected OpenCode service is outside this harness.

## Review and next step

Muse Spark 1.3 Free at xhigh returned a supplied-design review. MiMo Atria
timed out with no final output; Claude Atria at xhigh failed with connection
refusal and an unrecognized-model diagnostic. Structured native artifacts
contain no tool events. Claude's read-only tripwire detected parent-created
resource files, which were inspected. Parent implementation, native runs and
seven regression tests provide the verification; the delegate review does
not independently verify this source or the later phase correction.
See [the review seal](review-seal.json) for artifact audits and file hashes.

Agy fallback was not dispatched under the existing
[consumer route decision](../../../s4-provider-access/antigravity-consumer/README.md).
No service, authentication or provider configuration was changed.

Next is the separate about-hour mixed workload with a large synthetic event
feed and search, followed by memory settling and abnormal recovery checks.
This pilot supplies resource observability for that work; it does not finish
S5 or implement the product engine/event store. S4 and S6 remain open.
