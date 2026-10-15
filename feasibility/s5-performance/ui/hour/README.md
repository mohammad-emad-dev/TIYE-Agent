# S5 combined PTY, feed and search workload

This additive harness runs five isolated native PTYs alongside a SQLite
event-feed worker, rendered query pages and process resource sampling. The
smoke and hour profiles use actual monotonic elapsed time. No simulated clock,
provider request or user-project data participates.

## Recorded results — 15 October 2026

The [combined smoke](evidence-smoke.json) and actual
[hour observation](evidence-hour.json) passed output and feed integrity on
the same measured source/build bytes. Total hour observation time was
3,664.59 seconds, including idle/collection/final checks; each of the five
producer clocks recorded at least 3,600.254 seconds of mixed activity.
Normal owned-runtime cleanup completed. The five closed decoded-PTY logs
contained 150,923,190 bytes in total; hashes are retained rather than raw logs.

| Hour observation | Grid | Focus |
|---|---:|---:|
| View phases, approximately five minutes each | 6 | 6 |
| Planned / completed / skipped input probes | 59 / 18 / 41 | 60 / 13 / 47 |
| Delivered input ACK maximum | 37.39 ms | 25.40 ms |
| RAF scheduling gap maximum, including idle | 216.6 ms | 208.4 ms |
| RAF gaps above 500 ms | 0 | 0 |
| Full-hour input target | unqualified | unqualified |

The window lacked focus for 88 probes, so neither full-hour input target is
declared passed. No missed samples were replaced or discarded. The earlier
combined smoke had all 17 planned input probes complete and passed both
views' initial input targets; that does not replace missing hour coverage.

The hour feed reached 50,000 verified/reopened rows through 3,491 ingestion
observations. All 716 query/page checks matched expected counts, IDs and
visible DOM text, with at most 20 rows. Database query p95/max were
3.89/10.14 ms; request-through-DOM/RAF p95/max were 148.20/648.40 ms. Five
search completion samples exceeded 500 ms, while all remained below the
separate 2,000 ms search target. These delays do not represent RAF gaps.

All required roles had complete active/idle resource coverage across 356
samples. Main/renderer/feed peak private memory was 89.96/62.27/38.15 MiB.
Their peak interval CPU was 37.88%/68.06%/4.55% of one logical CPU. Five idle
samples per retained role showed small private-memory decreases, but this
short window does not establish settling or absence of leaks. No forced GC
or threshold tuning was performed. Full S5 and production eligibility
remain false.

## Fixed profiles

| Profile | Mixed activity | Idle observation | View interval | Output cycle / burst | Input interval |
|---|---:|---:|---:|---:|---:|
| smoke | 90 s | 30 s | 15 s | 30 s / first 10 s | 5 s |
| hour | 3,600 s | 60 s | 300 s | 300 s / first 60 s | 30 s |

Each producer emits eight colored Unicode records per batch with a 10 ms
wait during a scheduled burst; otherwise it emits one shorter record with a
500 ms wait. Stdout drain handling can reduce the achieved rate. View changes
alternate grid/focus in one window; all five PTYs continue in either view.
The last view remains selected during idle.

Feed inserts are scheduled about once per second, targeting
`floor(elapsed / mixed duration * 50,000)` events, capped at 50,000. The fixed
public fixture is generated as needed in the separate Node SQLite worker.
It is not bulk-loaded before the mixed activity. At completion, the database
is closed/reopened and its ordered row digest, count and FTS integrity are
checked against the full 50,000-event fixture.

Queries alternate known `needle` matches, the current last page and an absent
term about every five seconds. Their counts and exact IDs/text are checked
against the number of rows committed when that query runs. The feed renders
at most 20 row elements. This exercises changing query pages rather than a
continuous wheel/drag scrolling smoothness test.

## Integrity and timing boundaries

The stored UTF8 projection of decoded PTY text is hashed incrementally and
checked again by streaming the complete closed log. Producer output and
ConPTY output are different domains and are not compared as identical bytes.
The renderer independently calculates a chunk-order-sensitive SHA256 chain:
`next = SHA256(previous 32 bytes + current UTF8 chunk)`, starting with 32 zero
bytes. Its final chain, byte count and chunk count must match main capture.
This verifies delivery and xterm write callbacks; it does not qualify every
parsed screen record or physical display scanout.
Terminals retain fixed 100-column dimensions in this benchmark. Responsive
terminal fitting, clipping behavior and resize quality are not qualified by
the input ACK or byte-delivery checks.

The renderer retains only current chain state and pending chunks, plus
bounded xterm scrollback. ACK/file-drain flow control pauses downstream PTY
workers. It does not retain all hour-long raw output for a final digest.
Raw RAF samples, resource samples, ingestion counts and query observations
are retained as measurement data and contribute their own memory overhead.

Synthetic terminal-zero input requires the expected unique ACK in its visible
viewport row during xterm `onRender`. Host latency includes event dispatch and
the returned render ACK. Unfocused windows skip planned input probes and
remain incomplete; no zero-latency values replace them. This is not physical
keyboard-to-photon latency. RAF intervals are callback scheduling gaps, not
GPU frame rate or proof the OS never froze. The RAF window includes idle.

Main, renderer, feed worker, five PTY workers/producers and known Electron
auxiliaries are sampled approximately every ten seconds, plus collector
duration. The sealed resource sampler uses exact launched/API-reported PIDs
and process start identity checks. Published rows remove raw PIDs/start IDs.
CPU is interval CPU-time change divided by elapsed change, with 100% equal
to one logical CPU. Working set includes shared pages; private bytes measure
commit, not residency. The collector and console helpers are outside the
role inventory. Observer overhead is recorded, not subtracted.

Resource collections ending before mixed activity completes are tagged
`mixed`; collections crossing completion remain `transition`. Idle requires
all PTY workers exited and at least five seconds past mixed completion.
The actual core process is absent. The short idle window, retained measurement
arrays and lack of settling criteria leave memory settling unqualified.
Abnormal recovery and full S5/production eligibility also remain unqualified.

## Running and verification

Native Windows prerequisites: the existing S1 Electron 38.8.6, node-pty 1.1.0,
xterm 5.5.0 and esbuild 0.21.5 installation; the tested host Node 26.7.0 with
built-in SQLite/FTS5; Windows PowerShell. No package install is performed.

From this directory:

```powershell
rtk proxy npm run build
rtk proxy npm run test
rtk proxy npm run smoke
rtk proxy node check-evidence.js --smoke-only --runtime
rtk proxy npm run hour
rtk proxy npm run check
rtk proxy npm run check:runtime
```

The hour command requires existing smoke evidence. Both native commands
refuse to overwrite their corresponding evidence files with
`Existing evidence preserved; no new launch`. A new measured version needs
separate preserved source/evidence mappings. The runner hashes measured
sources/builds before launch and refuses success if any bytes change during
the run. Tests, checks and documentation can be edited independently of the
measured source list.

The hour workload flag requires its real hour profile and at least an hour
of producer/main activity, complete output checks and verified final feed.
It does not imply that all latency, resource coverage or exposure targets
pass. The offline assessment reports those separately. Initial proxy targets
are maximum input latency below 100 ms, RAF gap below 500 ms and query/RAF
search completion below 2,000 ms; missing exposure/input coverage yields null.

Normal cleanup waits for closed DB, child exits and file callbacks, then
checks marked canonical ownership and a complete no-link inventory before
exact file/directory removal. Native failures retain the runtime and print
its path. No global process kills, provider/config changes or protected
OpenCode service operations are part of the harness. Abnormal main exit
and subtree recovery remain unqualified.

## Review scope

Muse Spark 1.3 Free at xhigh returned a supplied-design review, with no file
inspection or execution. MiMo Atria timed out without output. Claude Atria at
xhigh failed with connection refusal and an unrecognized-model diagnostic.
Captured native review events contain no tool calls; the Claude read-only
tripwire corresponds to the parent-created hour directory. Parent source
review, the native combined smoke and offline checks provide verification.
The final artifact audit is recorded in `review-seal.json`.

Agy was not dispatched under the existing
[consumer-route decision](../../../s4-provider-access/antigravity-consumer/README.md).
No account, authentication, fleet or protected service configuration changed.
All earlier tracked feasibility sources/evidence must remain byte-identical.

Finishing the hour workload alone leaves product core/event-engine work,
continuous scroll interaction, a defined memory-settling gate, abnormal
recovery, eligible provider integration and WSL qualification open. The hour
completion flag and timing/coverage assessment are intentionally separate.
