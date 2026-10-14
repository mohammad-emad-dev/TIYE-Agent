# S5 five-terminal Electron shell

Reviewed 15 October 2026. This bounded feasibility shell connects five real
node-pty sessions to five xterm instances through a sandboxed preload and
per-member ordered IPC. Each PTY is isolated in its own Electron-as-Node worker;
Electron main does not load node-pty. No vendor CLI or provider model is used.

## Native observations

| Source version | Grid / focus observation |
|---|---|
| Initial shared-process PTYs | One complete hidden-window smoke passed |
| Runner revision | One complete smoke passed; an earlier attempt failed before member 5 completed |
| Producer-ready handshake, shared-process PTYs | Grid completed; focus exited with native `0xC0000005` |
| First isolated workers | One complete hidden-window smoke passed |
| Isolated workers with streaming UTF-8 decoding | Two consecutive complete hidden-window smokes passed |

Every passing view checked five member identities, zero terminal exit codes,
stream hashes/byte counts against persisted files and renderer receipt, no
pending xterm write callbacks, and 40 expected Unicode records per parsed
terminal buffer. Worker versions also require zero worker exit codes and a
complete terminal-exit frame. Focus retains four hidden xterm instances and
continues processing their output.

This establishes bounded delivery/parsing behavior. It is not a graphical frame
rate test, keyboard-input measurement, visual-layout approval or reliability
guarantee. Hardware acceleration was disabled and all measured windows were
hidden. PTY controls/line endings can differ from source stdout; screen buffers
are parsed terminal state rather than a byte-identical representation of input.

## Crash investigation and limits

The installed node-pty 1.1.0 source contains an unsynchronized process-global
PTY-handle vector. [Upstream issue 921](https://github.com/microsoft/node-pty/issues/921)
and [fix 922](https://github.com/microsoft/node-pty/pull/922) describe a matching
Windows race. This is a source-backed hypothesis for the observed crash, not a
dump-confirmed diagnosis. Process isolation avoids sharing that vector across
members without modifying S1's installed dependencies. The bundled native
dependency itself is not patched or upgraded by this prototype.

Failed runtime folders were preserved for identity review. A read-only check
after the final successful repeat found no running synthetic producer matching
this fixture. The prototype does not qualify abnormal subtree cleanup, durable
process ownership or PID-reuse recovery. On failure it stops directly captured
worker/host handles and preserves runtime files; it does not assume descendants
have been safely cleaned. Success cleanup validates the owned root marker,
allowed files, canonical paths and absence of links before exact unlink/rmdir.

## Run and prerequisites

This package reuses the installed S1 toolchain via `toolchain.js`; no install or
S1 mutation is performed. Observed runtime versions: Electron 38.8.6, node-pty
1.1.0 and xterm 5.5.0. esbuild 0.21.5 builds the renderer/preload into ignored
`dist/`. Missing dependencies fail explicitly and need a separately reviewed setup.

```text
npm run build
npm run check
npm run check:runtime
npm run smoke
```

`smoke` refuses to overwrite its existing worker UTF-8 observation before
launching anything. The already-recorded repeat uses `node run-smoke.js --cohort
workers-utf8-repeat` and also refuses replacement. `npm start` shows a short
grid/focus demonstration and does not rewrite evidence; it is not a persistent
interactive terminal application and does not accept keyboard task input.

`check` validates historical source snapshots and all five passing smoke
artifacts, retains both failed observations, and runs seven protocol/evidence
tests. `snapshots/` binds historical observations to their actual source bytes;
those observations do not qualify changed source. Renderer/preload build hashes
are recorded separately in `runtime-manifest.json`.

## Remaining S5 work

The visible five-terminal flood, input-to-display timing, frame/freezes, resize,
cursor/spinner workloads, CPU/memory, hour-long mixed run, feed/search and
abnormal worker recovery remain open. The next cohort should add the visible
60-second workload and input instrumentation to the isolated-worker shell.
**Full S5 and production eligibility remain false.**

Muse completed supplied-design reviews; MiMo/Claude outcomes are in the review
seal. Delegates did not independently verify the native results. Agy delegation
was not dispatched because the reviewed consumer wrapper restriction applies.
The current MiMo request timed out. Claude 2.1.300 timed out after reporting an
unrecognized `Atria-Dawn-Preview` model; the earlier Claude 2.1.294 request hit
quota 429. Those failed reviews do not count as verification.
Original temporary artifacts for the first three dispatches are no longer
available; their status is retained from prior tool results, with that audit
coverage gap recorded. The later worker-review artifacts were inspected directly.
