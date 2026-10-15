# S5 bounded memory-settling and focused-input cohort

This additive cohort extends the combined harness with a memory criterion
chosen before measurement. It runs five isolated PTYs and incremental
50,000-event SQLite feed/search for three minutes, then observes the retained
main, renderer and feed worker for five minutes idle. Earlier source/evidence,
including the hour run and its 88 skipped input probes, stay byte-identical.

## Recorded observation — 15 October 2026

The [native observation](evidence-settling.json) lasted **486.50 seconds**,
including final checks. Each PTY producer ran at least 180.468 seconds.
All five decoded-output capture/storage hashes and renderer receipt chains
matched. The feed reached 50,000 verified/reopened rows and all 36 query/page
checks matched. Active and idle process coverage passed; 47 resource samples
were recorded and normal owned-runtime cleanup completed.

Every retained role had 12 samples in the fixed tail, spanning 113.32 seconds
with a largest sampling gap of 10.47 seconds:

| Retained role | OLS slope, MiB/min | Private-memory range, MiB | Bounded gate |
|---|---:|---:|---|
| Main | +0.258 | 1.293 | pass |
| Renderer | −0.112 | 0.504 | pass |
| Feed worker | −0.043 | 0.066 | pass |

The criterion was not changed after measurement. This result describes the
recorded exposure/background state; it is not proof of foreground-only
memory behavior or absence of a long-term leak.

The focused-input attempt remains **unqualified**. Grid completed 2 of 17
planned probes (15 skipped); focus completed 0 of 18 (18 skipped). The two
delivered grid ACKs were below 17 ms, but visibility was lost during the run.
Raw RAF gap maxima were about 1,008.4 ms in both views, and maximum search
request-through-DOM/RAF time was 1,761.2 ms. Database queries stayed below
4.03 ms. Visible input, RAF and rendered-search targets are not marked
passed for this cohort. No focused retry or threshold adjustment hides the
missing samples. Previous hour input coverage remains unchanged.

## Predeclared memory criterion

The measured [memory gate](memory-gate.js) fixes the evaluation window at
elapsed **360,000–480,000 ms**, the final two minutes of the planned idle
observation. It uses `privateBytes` from Windows
`Process.PrivateMemorySize64` through the existing owned-process sampler.
Working set/RSS is not substituted.

Each of main, renderer and feed must have:

- At least 10 present samples spanning at least 100 seconds.
- No inter-sample gap above 15 seconds.
- Finite, nonnegative private-memory counters and no missing/reused process.
- OLS private-memory slope at most **1 MiB/min**.
- Maximum minus minimum private memory at most **8 MiB**.

OLS uses relative monotonic elapsed minutes and relative private MiB to avoid
large absolute-counter rounding. Duplicate/out-of-order/invalid timestamps
or incomplete role/window coverage make the result null (unqualified).
Every in-window sample participates; none is interpolated or discarded.
If any role is incomplete the overall result is null; otherwise every role
must pass. A null result never sets the bounded qualification flag.

These provisional tolerances define one bounded experiment, not leak-free
proof or a universal memory budget. The full-S5 `memorySettlingQualified` flag
stays false; `boundedMemorySettlingQualified` reports this criterion only.
The product core is absent. Raw measurement arrays and retained xterm/feed
state remain in memory and their overhead is included. No forced garbage
collection, window changes or threshold relaxation is performed after launch.
The window uses host collection-start elapsed timestamps; the separately
recorded collection duration includes process-query overhead.

## Load and input scope

The fixed profile uses 180 seconds mixed activity, 300 seconds idle, 30-second
view phases, 60-second output cycles with a 20-second burst and five-second
synthetic input scheduling. Its burst periods fall in grid phases; focus
phases exercise quieter terminal output with continuing feed/search. Thus
these view timing samples are not an equal-load grid/focus comparison.

All 50,000 events are appended across the three-minute interval rather than
seeded before the run. SQL, feed paging, decoded-PTY byte/hash chains and
normal cleanup keep the [hour harness contracts](../hour/README.md).
Renderer/preload/feed-worker/client code is reused explicitly; local
main/runner/profile/producer/PTY-worker/build files form the measured fork.
The rolling receipt chain avoids retaining all raw terminal output.

Bounded input targets require every planned probe in that view to complete
with maximum host-dispatch/render ACK below 100 ms. Any skipped probe or
lost visibility leaves that view unqualified. The harness does not steal
focus before each probe or retry to manufacture a pass. These results cannot
retroactively qualify missing input coverage from the hour run. RAF gaps
below 500 ms and search completion below 2,000 ms are separate proxy targets,
not physical keyboard-to-photon or GPU/OS responsiveness measurements.

## Commands and prerequisites

Native Windows, existing S1 Electron 38.8.6 / node-pty 1.1.0 / xterm 5.5.0 /
esbuild 0.21.5, host Node 26.7.0 with SQLite/FTS5, and Windows PowerShell are
the tested environment. No new dependency or provider call is introduced.
From this directory:

```powershell
rtk proxy npm run test
rtk proxy npm run build
rtk proxy npm run probe
rtk proxy npm run check
rtk proxy npm run check:runtime
```

`test` runs four tests covering slope/range math, continued growth, spikes,
missing/invalid samples, fixed window selection, gaps and evidence tampering.
`check` recomputes the
memory gate, combined contracts and source hashes from recorded evidence;
`check:runtime` additionally checks ignored build hashes. `probe` refuses to
overwrite `evidence-settling.json` with `Existing evidence preserved; no new
launch`. The runner fingerprints sources/builds before launch and refuses
success if bytes change during measurement. Further cohorts need separate
preserved evidence/source mappings.

Normal cleanup follows the marked canonical no-link inventory after DB,
workers and file callbacks close. Native failures retain their owned runtime
and print its path. Abnormal recovery, product/core memory behavior, WSL,
provider integration, scroll/resize quality and full S5 remain unqualified.

## Review and next step

Muse Spark 1.3 Free xhigh returned a supplied-design review without code
inspection or execution. MiMo Atria timed out with no final response. Claude
Atria xhigh failed with connection refusal and an unrecognized-model
diagnostic. Native review streams contain no tool calls; Claude's read-only
tripwire corresponds to parent-created settling files. Parent implementation,
native observation and regression checks provide verification. Artifact audits
and deliverable hashes are in [review-seal.json](review-seal.json).

Agy fallback was not dispatched under the recorded
[consumer-route restriction](../../../s4-provider-access/antigravity-consumer/README.md).
No credentials, model/fleet configuration or protected service was changed.

Next: a foreground-controlled input qualification and isolated abnormal
recovery checks. The bounded memory gate passed this cohort; full S5 remains
partial and the hour's missing input probes remain unresolved.
