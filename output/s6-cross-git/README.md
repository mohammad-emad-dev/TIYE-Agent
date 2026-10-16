# S6 native Windows Git and peer worktree reads — 16 October 2026

**Result: bounded owner-side controls succeeded; both foreign reads refused.**
The earlier [Linux-Git Windows-mounted initialization failure](../s6-path-git/README.md)
remains unchanged. This cohort used fresh disposable fixtures.

| Check | Observation |
|---|---|
| Native Windows Git | `2.55.0.windows.5`; init, base commit, linked worktree, edit commit, fast-forward merge, ancestry, payload bytes, clean status and HEAD controls completed |
| Ubuntu Git reads Windows-created linked worktree | Exit 128: `not a git repository`; the diagnostic shows the Windows `C:/…` Git directory pointer interpreted beneath the Linux worktree path |
| Linux owner | Git 2.53.0 completed commit/worktree/merge, ancestry, payload and clean-status assertions; later owner HEAD controls succeeded |
| Windows Git reads Linux-created linked worktree through `wsl.localhost` UNC | Exit 128: `detected dubious ownership`; `.git` may refer to a non-local directory |
| Content observations around foreign reads | Windows file-path/hash inventory equal before/after; Linux file/hash listing bytes equal before/after; owner HEAD controls unchanged |

The reverse-direction refusal occurs at an ownership/non-local-directory gate.
It does **not** establish whether Windows Git could resolve the Linux Git directory
pointer if that gate were changed. No exception was added and no metadata was
rewritten. `wslpath` translation is not cross-side worktree support.

## Protocol, harness errors and continuation

The [protocol](../../feasibility/s6-wsl/cross-git/protocol.json),
[coordinator](../../feasibility/s6-wsl/cross-git/run.py) and
[Linux fixture](../../feasibility/s6-wsl/cross-git/linux-fixture.sh) were saved
before native launch. Queries had 30-second timeouts and the original coordinator
a 300-second deadline. Each peer read was attempted once, without retry.

The [original manifest](evidence.json) remains **incomplete**. After the Linux Git
operations passed, its metadata-observation line incorrectly assumed that Git's
internal worktree directory retained the filesystem basename including spaces.
Git had converted spaces to hyphens. Reading the guessed `commondir` failed;
the nonzero exit is a **harness error**, not a Linux Git lifecycle failure.

The [follow-up](../../feasibility/s6-wsl/cross-git/finish-peer-read.py) reads the
actual `.git` pointer and its `commondir`, verifies owner state and records the
previously unattempted Windows peer read. It does not recreate the fixture or
rewrite Git metadata. Its [manifest](peer-followup.json) hashes the original
evidence, freezes its own source and uses a 120-second deadline with the same
30-second query limit. No query timed out.

An earlier follow-up preflight failed a host-side command-prefix assertion
before issuing any native query. Its [initial state record](peer-preflight.json)
is retained; the prefix selection was corrected before the measured follow-up.
This record alone contains no diagnostic; the failure is described here and in
the review metadata. Native peer-read counts remain one per direction.
The original frozen scripts retain their measured behavior; use a new cohort
for future runtime changes, rather than rerunning these launchers over evidence.

Both roots and linked worktrees remain in temporary storage for inspection,
with root paths in the manifests. Retention was chosen instead of linked-worktree
removal in this cohort. No root deletion or process-tree cleanup was performed.

## Integrity and scope

The native Windows Git binary was resolved explicitly. Both sides disabled
system/global Git configuration, used synthetic identity, disabled signing and
automatic line-ending conversion and pinned hooks/templates per invocation.
Windows used an owned empty global-config file and empty hook/template folders;
Linux used `/dev/null` for the global configuration. Config-origin logs are saved.
Foreign reads were exactly `rev-parse --verify HEAD` with optional locks disabled.

Raw streams, command arguments, source SHA-256, and query elapsed durations are
retained. Both payload checks matched UTF-8/LF content SHA-256
`ca307c5e94731d59471db41cbd06820bfb0c74153bc1d35dafe72be04c0d6923`.
Content inventories cover files, not timestamps, empty directories, permissions,
outside-root writes or a general guarantee that a foreign command cannot write.
The Linux owner metadata read preceded the Linux before/after inventory.
No performance comparison follows from these fixed-order observations.

Verify the saved controls and expected refusals without executing Git or WSL:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/cross-git/check.py
```

Checker success verifies this partial result, including both refusals and the
preserved harness error. It is not a full-S6 pass or permission to mix Git sides.

## Implementation rule and next step

Pin one Git execution side per project. Keep Windows-owned linked worktrees
under Windows Git and Linux-owned linked worktrees under Ubuntu Git in the
prototype; do not automatically cross-open them, rewrite pointers or grant
`safe.directory` exceptions. This conservative rule follows the test plan's
fallback and does not establish support across every Windows volume or Linux
distribution. Git-side selection must be explicit before worktree creation.

No Node/provider installation, real provider access, Electron PTY, terminal
parity, Windows team-tool connectivity or abnormal recovery was qualified.
Full S6 and the Phase 1 gate remain open. Next is a bounded mock team-tool
connection from Ubuntu to a Windows-owned server, with actual route observations
and no host networking configuration changes.

## Review

Muse Spark 1.3 Free xhigh, Space Bunny Free xhigh and DeepSeek V4.1 Flash Free
max completed supplied-context reviews before execution. They did not inspect
the workspace or independently verify these observations. Recursive stream
inspection found zero tool events. [Review metadata](review.json) records hashes
and the parent's verification. The previously unsupported exact Codex model and
excluded consumer Agy route were not invoked.

Retained advice: separate pointer failures from ownership refusal, preserve raw
diagnostics, use owner controls and limit inventory claims to captured bytes.
No unmeasured claims about UNC truncation, mount UID mapping or other UNC aliases
were adopted. The earlier failure was on a Windows-mounted path, not Linux `/tmp`.
