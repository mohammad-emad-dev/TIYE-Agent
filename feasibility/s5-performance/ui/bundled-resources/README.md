# Bundled ConPTY resource pilot — 16 October 2026

This additive pilot checks resource observability and the existing bounded
input/RAF proxies with the bundled backend that passed the separate resize
experiments. Each view runs five PTYs for 60 seconds, then keeps the Electron
shell idle through at least 120 seconds. Grid and focus run sequentially; all
three delegate processes completed before the pilot began. No native fault
experiment overlaps these resource windows.

The fixture, backpressure logic, sampling cadence and metric thresholds match
the previous resource pilot. Workers explicitly select experimental
`useConptyDll:true`; an exact-PID module query records the loaded bundled DLL
before the start barrier. Sources, bundles and backend DLL/OpenConsole binary
hashes are saved before launch and checked after both views exit.

## Measurements and scope

Both native view runs completed and passed active/idle coverage and the existing
synthetic input/RAF targets. Four regression tests passed, including rejection
of a missing active worker and an early idle sample. Both separate recovery
cohorts also passed their corrected bounded contracts.

| Observation | Grid | Focus |
|---|---:|---:|
| Pilot duration | 121.88 s | 121.44 s |
| Flood / transition / idle samples | 12 / 1 / 10 | 12 / 1 / 10 |
| Main peak private committed memory | 89.86 MiB | 90.82 MiB |
| Renderer peak private committed memory | 118.36 MiB | 122.09 MiB |
| Main peak CPU, one-core interval percent | 41.16% | 40.40% |
| Renderer peak CPU, one-core interval percent | 53.46% | 35.14% |
| Input probes completed / planned | 28 / 28 | 28 / 28 |
| Maximum dispatch → renderer ACK | 15.90 ms | 17.51 ms |
| Maximum RAF scheduling gap | 25.0 ms | 16.5 ms |
| Maximum resource collection duration | 382.82 ms | 313.28 ms |

Cost remains relevant: the bundled runs captured 28,572,831 and 26,268,319 decoded
bytes, versus 11,151,063 and 10,633,792 in the older system-backend pilot. The new
runs emitted fewer producer records (127,800 / 117,512 versus 138,256 / 130,256),
yet had higher observed main-process CPU interval peaks (the earlier values
were 11.11% / 11.76%). These are separate, unpaired runs, with different decoded
stream volumes; they do not establish a causal regression percentage. No CPU/RAM
budget passes simply because the responsiveness proxies pass.

Each view's result contains every owned-role sample and derived resource series.
Main, renderer, five workers/producers and registered Electron auxiliaries are
sampled by exact PID, with start-identity checks and status-aware CPU intervals.
Active coverage requires every required role present in every flood sample and
at least eight samples per required role. Idle requires at least eight samples
for main/renderer; the verifier also rejects missing idle observations. Collections
crossing 60 seconds are transition samples; idle starts after 65 seconds and
worker completion. No sample is removed to improve a verdict.

CPU uses cumulative process CPU milliseconds divided by actual sampled elapsed
milliseconds. **100% represents one logical CPU; a multithreaded process can
exceed 100%.** It is an interval average, with no whole-machine CPU claim.
Private bytes mean private committed memory. Working set includes shared
resident pages; working sets must not be summed as unique physical memory.
Sampling duration is retained as observer overhead and is not subtracted.

No CPU/RAM pass budget is introduced. The short idle period does not qualify
memory settling, leak freedom or the hour-long mixed feed/search workload.
Console-helper/OpenConsole processes and the sampler are outside the owned-role
resource inventory. Product core and whole-machine accounting are absent.
Input/RAF verdicts retain their native focus/visibility coverage requirements;
a skipped input cannot become a successful latency observation. These proxies
do not measure physical keyboard-to-photon time or GPU frame rate.

## Artifacts and commands

The [public output](../../../../output/s5-bundled-resources) retains full view
results, module observations and the prelaunch manifest. Each decoded PTY log is
stored as lossless gzip **after** measurement, with compressed and uncompressed
hashes/lengths in `evidence.json`. Verification decompresses and reconciles each
log with main's stored hash and renderer's receipt hash. Compression does not
change the authoritative decoded-string-as-UTF-8 byte unit.

From the repository root, using the existing S1 dependencies:

```powershell
rtk proxy node feasibility/s5-performance/ui/bundled-resources/check-evidence.js
rtk proxy node --test feasibility/s5-performance/ui/bundled-resources/test/backend.test.js
```

`check-evidence.js --runtime` additionally checks recorded local bundles and
backend binaries. Native probes refuse existing output/evidence; old cohorts
are immutable. This pilot retains its marked runtime/profile and does not claim
cleanup. The [renderer-recovery check](../bundled-recovery/README.md) and
[isolated fault check](../bundled-faults/README.md) use separate owned runtimes.
Full S5 and production eligibility remain false.

The next step is the longer mixed-workload and memory-settling verification with
this backend, while tracking decoded-volume and processing cost. The earlier
system-backend results remain evidence for that backend only. Helper accounting,
whole-host recovery and broader platform/provider gates also remain open.

## Delegation

Muse, Space Bunny and DeepSeek completed supplied-context reviews without tool
use or independent workspace verification. Parent implementation and executed
checks establish the result. Applicable advice about unchanged thresholds,
phase separation, exact bytes and helper-process exclusions was used. DeepSeek's
suggested two-second maximum sampling gap does not match the existing five-second
cadence and was not adopted; its one-core 100% ceiling claim was corrected above.
Space's broader Unicode/style/reflow recovery expectations do not describe the
fixed-geometry ASCII renderer-crash contract. No new production write path or
power-loss durability is claimed from the synthetic SQLite tests.

GPT-6.1 Luna was not retried after the recorded unsupported-account rejection.
The recorded consumer Agy route remains excluded. No credentials, protected
service or provider/model configuration was changed.
