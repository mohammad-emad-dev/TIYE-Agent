# Bundled ConPTY resize mitigation — 16 October 2026

**The bundled backend passes both the held control and the original active-output
resize/scroll scenario on this Windows host.** This is a bounded mitigation,
with no full-S5 or production qualification. Earlier failures remain unchanged.

## Change and native results

The installed node-pty 1.1.0 exposes experimental `useConptyDll`. The new workers
set it to `true`, keeping `useConpty:true`, the original producer/fixture bytes,
xterm 5.5.0 and the resize protocol. PowerShell queries each exact worker PID's
loaded modules after PTY creation. All five workers in each run report the
package's `prebuilds/win32-x64/conpty/conpty.dll`. Prelaunch hashes fingerprint
that DLL and its adjacent `OpenConsole.exe`; both hashes remain unchanged after
execution. DLL loading is observed; individual OpenConsole helper identities
are not tracked by this experiment.

| Run | Resize phases | Exact content and scroll checks | Final records, members 0–4 |
|---|---|---|---|
| Bundled backend, producers held during resize | All five completed | Pass | 111, 111, 111, 110, 111 |
| Bundled backend, original active-output protocol | All five completed | Pass | 188, 187, 186, 187, 186 |

Geometry follows the original sequence: 100×12, 60×16, 132×10, 80×20, 100×12.
The active run resumes producers before geometry changes, waits for at least
five additional records before resizing and at least fifteen before the next
HOLD. Output then continues while scrolled to the top. All five terminals retain
the exact record history and top viewport anchor, move seven lines correctly,
and return to the bottom. No strings are trimmed, normalized or deduplicated;
no redraw chunks are suppressed. All comparisons preserve literal spaces.

Five isolated workers and five Node producers are used per run. Native assertions
and the independent verifier check actual xterm buffers, canonical producer
records, child TTY sizes, captured file hashes, chunk-prefix receipt chains,
ordered ACKs and ten worker/producer exit observations. Each run completes
normally; both runtime profiles remain retained (`ownedCleanup=false`). The
Windows host build remains 26300, Electron 38.8.6, Node 26.7.0.

## Interpretation and remaining work

The original system-backend failures and their offline replay still fail.
The new result supports using the bundled backend for the tested resize path.
The module query adds startup work, and scheduling/counts differ between runs;
these are separate native observations rather than timing-matched experiments.
They do not prove a particular ConPTY bug or a character-width formula.

[Record diagnostics](record-differences.json) retain exact first-divergence
offsets and trailing-space counts from the earlier replay. Offsets and lengths
are UTF-16 code units, **not display-cell measurements**. The replay alternatives
still show four appended spaces; the new bundled runs have no record mismatch.
The suggested CJK/combining-width arithmetic remains an untested hypothesis.

The backend option stays experimental and is enabled only in these additive
feasibility directories. Before selecting it for the product, verify the earlier
resource/performance and recovery cases with this backend; their system-backend
results cannot automatically be transferred. Full process-tree cleanup, physical
wheel/paint, broader Windows coverage and full S5 remain open. The product core
has not been implemented by this change.

## Evidence and commands

- [Held native output](../../../../output/s5-interaction-conpty)
- [Active native output](../../../../output/s5-interaction-conpty-active)
- [Active source](../interaction-conpty-active)
- `evidence.json`: prelaunch/post-exit hash checks, artifact inventory and verdict scope
- `backend-*.json`: observed loaded DLL paths per exact worker PID
- `journal.json`, `member-*.log`: original decoded chunks and byte-identical captures
- `checkpoints.jsonl`, `result.json`: terminal snapshots and completed phase observations
- `expected-*.jsonl`, `control-*.jsonl`: producer intentions and HOLD/SIZE reports

With the existing S1 dependencies, from the repository root:

```powershell
rtk proxy node feasibility/s5-performance/ui/interaction-conpty/check-evidence.js
rtk proxy node --test feasibility/s5-performance/ui/interaction-conpty/test/backend.test.js
```

Three tests cover both native captures, UTF-16/combining-mark diagnostics and
literal spaces. After both directories have been built, the checker accepts
`--runtime` to verify local bundles and backend binary hashes too. Probes refuse
existing evidence/output. Dist files, dependency binaries and runtime profiles
are not committed. Raw capture files and manifests are committed.

## Delegated review

Muse, Space Bunny and DeepSeek completed supplied-context work without tool use.
Muse's loaded-backend validation advice was used; the installed typings expose
the option as experimental, rather than unsupported. Space proposed a content
matrix that remains unrun. Its inference that equal results from two backends
would prove padding originated before the PTY is not justified and was not used.
DeepSeek's non-mutating record-diff function was adapted; its invalid Unicode
test expression was replaced with real `node:test` assertions.

The requested GPT-6.1 Luna was not retried after the recorded account rejection.
The recorded consumer Agy route remains excluded. Parent implementation, native
execution and independent checks determine these findings; no delegate performed
independent workspace verification.
