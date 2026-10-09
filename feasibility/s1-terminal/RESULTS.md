# S1a prototype result — 9 October 2026

**Scope:** Local mock CLI in Electron on Windows 11. This is a prototype result, not a pass for the full S1 feasibility test.

| Check | Result | Evidence |
|---|---|---|
| TypeScript and bundle build | Pass | `rtk npm run check` completed (`tsc --noEmit` and esbuild) |
| Electron-hosted ConPTY channel | Pass | `rtk npm run smoke`: banner, ASCII and Unicode echo, resize, fast output, and clean exit |
| Renderer and preload bridge | Pass | `rtk npm run smoke:window`: renderer READY, terminal output rendered, and screenshot captured at `dist/smoke-shot.png` |

# S1b lifecycle result — 9 October 2026

**Scope:** Same prototype extended with a bounded lifecycle exercise (main-owned single member session, close choice, tray, graceful stop-all, mock-core token re-subscribe). Local mock CLI only.

| Check | Result | Evidence |
|---|---|---|
| 9a Keep Running preserves the PTY | Pass | `rtk npm run smoke:lifecycle`: `9a Keep Running preserved session=s1-…-1-pid12356 pid=12356 spawn#1` — same PID/session identity before and after close |
| Window reopen reattaches, no duplicate spawn | Pass | Same run: new renderer input reached the same PTY (`echo: hello reopen` driven through the new window's `window.tiyeTerminal.sendInput`), `Open reattached to same PTY, no duplicate spawn` (spawn # still 1). This does not verify replay of earlier terminal output. |
| Tray exposes Open and Quit | Pass | Same run: a real Tray object was created with a decoded visible icon; Open and Quit menu entries were inspected via the template (no UI clicks) |
| 9b separate mock-core process re-subscribes | Pass (bounded) | Same run: `mock-core-1` (corePid=…) exited itself on a `SHUTDOWN` line + stdin close (exit 0, actual exit event observed — no force-kill fallback exists for the core), then `mock-core-2` started as a new OS process and completed the SUBSCRIBE/SUBSCRIBED/READY round-trip on the same session/PID (spawn # still 1; PTY echo verified alive after). The smoke asserts the core PID changed while member session ID, member PID and spawn count did not. Narrow stdio JSON-lines IPC only; no team engine. |
| 9c Stop requests graceful shutdown | Pass | Same run: `9c Stop requested graceful shutdown, pty exit 0` (mock CLI `exit` written through the PTY) |
| 9d tray-Quit stop-all requests graceful shutdown | Pass | Same run: fresh member spawned, then `9d tray-Quit stop-all requested graceful shutdown, pty exit 0` via the same stop-all routine the tray Quit button calls |
| Existing S1a checks unbroken | Pass | `rtk npm run check`, `rtk npm run smoke`, `rtk npm run smoke:window` all still PASS after the change |

**Limitation (explicit):** PTY exit code 0 shows the mock CLI exited after its `exit` command was requested through the PTY. It does **not** prove a whole process tree died: no Windows Job Object, no PID+creation-identity orphan enumeration (9e), and no abnormal-main-exit/crash-recovery check (9f) are implemented in this task. The mock core likewise has no force-kill fallback: shutdown is SHUTDOWN + stdin close with the exit event observed, and a core that ignores it fails Stop/lifecycle loudly with its handle retained instead of being treated as stopped. A keep-running PTY is intentionally owned, not an orphan. Output produced without a renderer is buffered up to one million characters; full pre-close terminal history is not replayed.

**Versions tested:** Windows 11 build 26300, Node.js 26.7.0, Electron 38.8.6, node-pty 1.1.0, xterm.js 5.5.0, TypeScript 5.9.3.

**Still required for S1:** Manual comparison with a real installed CLI; interactive approval, resize, multiline paste, Ctrl+C, and CJK/Arabic input checks; interactive close-choice dialog and tray clicks (only internal hooks are automated); orphan enumeration 9e with PID + process-creation identity after 9c/9d (never kill by PID alone); Windows job boundary and abnormal-main-exit cleanup 9f with verified-identity-only cleanup; S6 WSL behavior remains untested. 9b is evidenced here only with a separate mock-core process and the local mock CLI — no team engine, no vendor CLI. Keep S1 status **partial** until those checks are recorded.
