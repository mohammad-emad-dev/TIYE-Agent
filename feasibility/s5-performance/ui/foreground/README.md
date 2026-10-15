# S5 foreground input cohort

This additive experiment records main-window focus and visibility alongside
synthetic terminal input during a two-minute combined workload. It preserves
the earlier [hour](../hour/README.md) and [settling](../settling/README.md)
sources and evidence, including their missing input coverage.

## Recorded observation — 15 October 2026

The corrected [native cohort](evidence-foreground.json) completed in 134.04
seconds including drain and final checks. Every producer ran at least
120.014 seconds. All five capture/storage SHA-256 and renderer receipt-chain
checks matched across **20,822,094 decoded PTY bytes**. SQLite verified and
reopened all 50,000 events; all 24 exact query/page checks passed. Thirteen
owned-process snapshots were retained and normal cleanup completed.

| Bounded proxy | Grid | Focus |
|---|---:|---:|
| Planned/completed input probes | 29 / 29 | 29 / 29 |
| Skipped probes | 0 | 0 |
| Maximum host dispatch-through-render ACK | 26.91 ms | 26.05 ms |
| Maximum RAF gap during mixed activity | 16.60 ms | 12.70 ms |

All 1,155 main snapshots reported focused, visible and not minimized; the
largest gap was 116.33 ms and the final snapshot reached 120,016.65 ms.
There were no recorded loss events. Renderer focus was true at both ends
with no recorded loss. The post-measurement control observed main hidden and
unfocused, renderer unfocused, and renderer visibility still visible. This
confirmed the corrected control without changing the measured interval.

All bounded input, RAF and search proxy targets passed. Maximum DB query time
was 4.19 ms and maximum search request-through-DOM/two-RAF completion was
26.61 ms. Four regression tests and measured source/build hash checks passed.
These observations qualify only this two-minute cohort. The earlier hour's
88 skipped inputs and settling attempt's 33 skips remain unchanged; they
are not retroactively qualified. Full S5 remains partial.

## Fixed experiment

The [profile](profiles.js) runs five isolated node-pty workers for 120 seconds,
alternating grid and focus views every 30 seconds. All five producers emit
the same eight-record/10 ms burst pattern throughout both views. Backpressure
can affect achieved throughput. Focus view displays member zero while the
other four continue producing output; this is not five simultaneously visible
terminals in focus view. SQLite WAL/FTS5 receives 50,000 synthetic events
incrementally, with exact bounded 20-row query/page checks every approximately
five seconds. Synthetic input is scheduled approximately every two seconds.
A ten-second drain/idle interval follows the measured mixed interval.

This is an explicit fork of the combined harness with local profile, main,
renderer, preload, producer, worker, build, runner and checker files. It reuses
the unchanged hour feed client/worker and shared SQLite, process-sampling,
protocol and metric modules. New common abstractions would alter previously
measured source mappings, so those experiments remain self-contained.

## Predeclared qualification

The measured [gate](foreground-gate.js) fixes these provisional requirements
before launch:

- Main snapshots begin at elapsed zero, reach the end of the 120-second
  mixed interval, have consecutive sequence numbers and increasing finite
  timestamps, and never have a gap over 500 ms. The intended interval is
  100 ms; scheduling delays are retained.
- Every snapshot must report `BrowserWindow.isFocused()`, `isVisible()` and
  `!isMinimized()`. Main focus/blur/show/hide/minimize/restore events are also
  retained. Any blur, hide or minimize event disqualifies exposure even if
  focus has returned when the state is read.
- Renderer `document.hasFocus()` and visibility must be true at measurement
  start and mixed-interval end. RAF observations and window/document events
  must never record lost focus or visibility. A blur event disqualifies the
  result independently of its accompanying state read.
- Each view needs at least 12 planned inputs, zero skips and an ACK for every
  planned input. Ordinals, dispatch/ACK times, latency values, focus states
  and dispatch/ACK views must agree. ACKs must arrive inside the mixed
  interval and in their dispatch view. An incomplete view is null, never
  passed; complete coverage passes only with maximum latency below 100 ms.
- RAF maximum below 500 ms and search request-through-DOM/two-RAF completion
  below 2,000 ms are separate targets, gated by the complete exposure record.
  DB query timing is reported separately from visible completion.

Measurement begins after all producers are ready and the renderer starts;
there is no startup retry or stable-focus window that discards an initial
unfocused reading. No focus stealing, pause-on-blur, per-probe retry or
threshold relaxation follows the initial window show/focus request.
Snapshots cannot prove absence of every sub-sample interruption, occlusion,
OS input-routing problem or missed native notification. These are Electron
window/document observations, not an independent Windows foreground monitor.

Each synthetic probe travels from Electron input injection through xterm,
PTY input, producer ACK output, xterm rendering and IPC acknowledgement. It
does not measure physical keyboard-to-photon or GPU/OS responsiveness.
Hardware acceleration is disabled, matching earlier cohorts. RAF collection
ends with the mixed interval, excluding the drain interval. View-boundary
frame gaps are attributed to the current view, and cross-view ACKs prevent
input qualification.

After measured results are captured, the harness hides only its own window.
The negative control requires main hidden/unfocused and renderer unfocused;
its complete readings are recorded separately. An unsuccessful control makes
exposure/input qualification null while preserving measurements. It cannot
alter the mixed-interval record. With `backgroundThrottling:false`, renderer
visibility remains visible even when hidden, as documented by
[Electron](https://www.electronjs.org/docs/latest/api/browser-window#page-visibility).
Renderer visibility is therefore not an independent exposure signal here;
main visibility/minimization and focus observations are required.

The first native attempt failed its post-measurement control because it
incorrectly required renderer visibility to become hidden. Its
[source/build snapshot manifest](failed-attempt/manifest.json) preserves all
26 measured files, hashes for its retained SQLite/output files and the failure
diagnostic. Individual control states and complete timing arrays were not
captured before that assertion; no success evidence or qualification is
claimed for that attempt. Its owned runtime remains local. The corrected
attempt records the control and verdict before writing evidence; none of the
timing thresholds or focus-coverage requirements was relaxed.

## Commands and evidence preservation

Native Windows; existing S1 Electron 38.8.6, node-pty 1.1.0, xterm 5.5.0 and
esbuild 0.21.5; host Node 26.7.0 with SQLite/FTS5; Windows PowerShell. No
dependency installation, provider call or account configuration is involved.
From this directory:

```powershell
rtk proxy npm run test
rtk proxy npm run build
rtk proxy npm run probe
rtk proxy npm run check
rtk proxy npm run check:runtime
```

`probe` refuses an existing `evidence-foreground.json` with `Existing evidence
preserved; no new launch`. Source/build hashes are captured before launch and
checked after exit. `check` recomputes the verdict and combined integrity
contracts and verifies measured source bytes; `check:runtime` additionally
compares ignored build bytes. The regression tests cover complete/slow input,
focus loss, sampling gaps, malformed clocks, event-only blur and incomplete
or incorrectly correlated input, plus native evidence/verdict tampering. The
checker also verifies every preserved failed-attempt source/build snapshot.

Output capture/storage SHA-256 and renderer receipt chains, all five normal
worker/producer exits, exact feed/page content, SQLite/FTS/reopen checks and
bounded DOM rows retain the combined harness contracts. Process samples use
only exact owned PIDs/start identities, then remove those identifiers from
published evidence. No resource settling claim is made by this shorter run.

Normal cleanup checks the canonical parent, owner marker, no-link inventory
and allowed files before individual removals. Failures retain their runtime
and print its path. The runner preserves previous evidence and does not
recover or remove an earlier failed runtime. Product-core behavior, abnormal
recovery, physical interaction, resize/scroll quality, WSL, eligible provider
integration and full S5 remain unqualified. The core and production flags
remain false regardless of these bounded proxy results.

## Delegation

Muse Spark 1.3 Free xhigh supplied a design review; it did not inspect or run
the implementation. The review led to event-only loss rejection, focus at
ACK checks and the post-measurement visibility negative control. MiMo Atria
and Claude Atria xhigh timed out; Claude also emitted an unrecognized-model
diagnostic. All native streams contained zero tool calls. Claude's read-only
tripwire corresponds to the parent-created foreground directory.

Agy fallback was not dispatched under the recorded
[consumer-route restriction](../../../s4-provider-access/antigravity-consumer/README.md).
No credentials, model configuration or protected service was changed. Parent
implementation and native checks supply verification. Delegate artifact hashes
and deliverable hashes are retained in `review-seal.json`.

Next: isolated abnormal-recovery checks. Full-hour foreground input coverage,
product-core behavior and the other open S5 gates require separate evidence.
