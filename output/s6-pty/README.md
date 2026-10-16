# S6 WSL mock through Electron/ConPTY/xterm — 16 October 2026

**Bounded mock PTY run passed.** One Windows PTY worker launched one Ubuntu
Python mock through `wsl.exe`. This capture does not qualify a provider CLI,
Windows Terminal parity, actual keyboard/clipboard operation or full S6.

| Check | Observation |
|---|---|
| Linux terminal | `isatty` true on stdin/stdout/stderr; termios ECHO off and ISIG on |
| ASCII paste | 28 UTF-8 payload bytes, Linux SHA-256 matched |
| Arabic/Chinese/Japanese/Korean paste | 48 UTF-8 payload bytes, Linux SHA-256 and xterm buffer rows matched |
| Three-line paste | 46 payload bytes matched after xterm's declared LF-to-CR conversion; all three visible rows matched |
| Resize | Linux size observation changed from 120×24 to 100×16 after the host and renderer resize requests |
| Ctrl+C | Linux SIGINT handler emitted the nonce-bound event; the mock remained available for STOP |
| STOP | PTY and Windows worker exit 0; original Linux identity absent in a fresh WSL inspector, same boot-ID hash |
| Main-to-renderer receipts | All 792 bytes of the captured decoded VT string matched the renderer's byte count and SHA-256 |

The captured runtime versions are Electron 38.8.6, its Node runtime 22.22.0,
node-pty 1.1.0 and xterm 5.5.0. The renderer is the existing xterm package, not a
new terminal implementation. The [screenshot](terminal-before-stop.png) was
captured before STOP and visually inspected for the Unicode rows and signal/size
events. Buffer content and one screenshot are not physical-paint latency or full
rendering/RTL-shaping qualification.

## Path and evidence

The [protocol](../../feasibility/s6-wsl/pty/protocol.json),
[Electron main](../../feasibility/s6-wsl/pty/main.cjs),
[PTY worker](../../feasibility/s6-wsl/pty/worker.cjs),
[renderer](../../feasibility/s6-wsl/pty/renderer.js) and
[Linux mock](../../feasibility/s6-wsl/pty/mock.py) were saved before native launch.
Existing S1 dependencies built the local renderer; no package was installed.
The worker requested `useConpty=true` and `useConptyDll=true`, retaining the
experimental bundled backend choice. Relevant native binary hashes were frozen;
this cohort did not independently enumerate loaded DLL modules.

The input path was a synthetic renderer hook calling xterm `Terminal.paste` or
`Terminal.input`, through preload IPC, main, worker IPC and the PTY to Linux.
Linux parsed bracketed-paste frames, hashed payload bytes and emitted ACKs before
its separate colored `VISIBLE` rows. ECHO was disabled, so those rows are deliberate
mock output. The script never evaluates pasted text as a shell command.

The installed xterm `Clipboard.ts` source was read and hashed before launch:
`prepareTextForTerminal` converts CRLF/LF to CR. The multiline fixture therefore
compares against that expected byte sequence, rather than claiming unchanged LF
delivery. Renderer-generated terminal device/focus replies also appear in the
input record; they are not additional user paste cases.

The Linux SIGWINCH handler reports the size queried from its TTY; the Linux
SIGINT handler reports an actual signal, not just receipt of byte `0x03`.
Normal STOP follows the termios-restoration path before successful exit.
Forced-exit restoration and interrupt behavior of real CLIs remain untested.

[Native evidence](native.json) records payload hashes, buffer snapshots, versions,
input strings, both Windows process IDs and the distinct Linux identity.
[Prelaunch hashes](prelaunch.json) cover measured sources, local bundles, selected
backend binaries, the toolchain helper and xterm paste source. The
[coordinator](coordinator.json) records exit 0, no timeout and unchanged measured
bytes after exit. Build/dependency files remain ignored; hashes describe this
installed toolchain rather than every runtime dependency.

The [decoded VT transcript](decoded-vt.log) is node-pty's decoded string stream,
not a raw Linux stdout-byte witness. Its final byte count/hash equals the
renderer's received-string bytes after all xterm write callbacks settled. ACK
and buffer ordering do not establish a physical rendering causality or latency.

## Ownership and limits

The [fresh inspector](../../feasibility/s6-wsl/pty/inspect.py) verified the Linux
PID, `/proc` start ticks, UID and public nonce, captured the boot-ID hash and saw
no child processes at the initial inspection. The mock creates no intended
descendant; this is not continuous process-tree monitoring. After exit, that
original PID was absent under the same Linux boot identity. Windows worker and
WSL launcher IDs are separate records, not substitutes for Linux identity.

This was one attempt with no retry, a 30-second mock self-expiry bound and a
45-second coordinator deadline. Normal STOP completed before expiry. The
coordinator's owned temporary runtime and Electron user-data directory were
retained; no recursive deletion ran. ConPTY/helper trees, PID reuse, abnormal
Electron exit, survivor-present cleanup and failed-launch cleanup are not qualified.
No provider task, user credential, networking setting or global configuration
was used or changed by the native mock protocol.

Verify the saved capture without launching Electron/WSL:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/pty/check.py
```

Add `--runtime` to also compare the currently installed bundles/dependency bytes
against prelaunch hashes. Native launch requires the existing S1 dependencies:
`rtk proxy node feasibility/s6-wsl/pty/build.cjs` builds the ignored local bundles.
The coordinator refuses the existing output directory; preserve this cohort and
use a separately named protocol for any later native measurement.

## Next step and review

Consolidate the S6 coverage against all nine test-plan rows before choosing the
next native experiment. Mock PTY mechanics now have bounded evidence; real CLI
parity remains behind S4 route qualification. Survivor-present recovery,
production app integration and the Phase 1 gate remain open.

Muse Spark 1.3 Free xhigh, Space Bunny Free xhigh and DeepSeek V4.1 Flash Free
max supplied context-only reviews before execution. They did not inspect the
workspace, screenshot or native results; structured streams contain zero tool
events. The parent implemented, ran, inspected and verified the capture. See
[review metadata](review.json). The previously unsupported exact Codex model and
excluded consumer Agy route were not dispatched.

Retained advice: require ECHO-off plus Linux ACK hashes, parse events from the
xterm buffer, separate SIGINT from a control byte, inspect Unicode rows and avoid
paint/CLI/cleanup overclaims. Paste normalization was checked against installed
source before launch. Original termios restoration is the source's saved-state
path; no claim that restored ECHO stays off was adopted.
