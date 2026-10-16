# S6 path/Git fixtures — 16 October 2026

**Partial result:** Linux Git completed the Linux-filesystem fixture. It failed
to initialize a repository in the Windows temporary-folder fixture because a
permission operation on `.git/config.lock` was refused. This is a bounded host
observation, not proof that every Windows-mounted location fails.

| Fixture/check | Observed result |
|---|---|
| Linux Git on Windows-mounted temporary root | Initialization failed, exit 128: `chmod` on `.git/config.lock` returned `Operation not permitted`; Git could not set `core.filemode=false` |
| Linux Git in Ubuntu `/tmp` | Base commit, linked worktree, Unicode file edit/commit, fast-forward merge, refs, byte checks, clean status, clean worktree removal and reopen assertions completed |
| Windows temporary-root path round trip | Windows → Linux → Windows matched after `ntpath.normpath`/`normcase` normalization |
| Linux repository path containing spaces, Arabic and Japanese | Linux → `\\wsl.localhost\Ubuntu\…` → Linux matched exactly |
| Windows-mounted Unicode repository round trip | Not reached after initialization failure |
| Native Windows Git / cross-side worktree interoperability | Not tested |

## Execution and evidence

The [protocol](../../feasibility/s6-wsl/path-git/protocol.json) and
[fixture shell script](../../feasibility/s6-wsl/path-git/fixture.sh) were saved
before launch. Both filesystem fixtures use Linux `/usr/bin/git` 2.53.0 as the
non-root Ubuntu user, not Windows Git. Each query uses an empty inherited
environment with fixed Linux PATH and `C.UTF-8`, system/global Git config disabled,
synthetic author identity, hooks/templates disabled per Git invocation and
explicit line-ending/signing settings. The Linux config-origin output contains
local repository and command-line values. No decoy-config isolation test was run.

The [original coordinator](../../feasibility/s6-wsl/path-git/run.py) stopped at
the first fixture failure, preserving [its manifest](evidence.json) and raw
stdout/stderr. It did not retry or repair the Windows-mounted fixture.
The independent Linux fixture had not been attempted. A separately recorded
[follow-up coordinator](../../feasibility/s6-wsl/path-git/finish-linux.py) ran it
once using the same frozen shell source and the already-created marker-owned
Linux root. Its [manifest](linux-followup.json) pins the original evidence hash.
The original coordinator has a 300-second deadline, the follow-up a 120-second
deadline, and every child query a 30-second timeout. No query timed out. This
follow-up is an explicit continuation after failure, not a successful two-profile
execution of the original coordinator.

Both manifests retain commands, source hashes, query start times, same-process
elapsed durations, raw stream lengths/hashes and their distinct outcomes. Hashes
matched before/after execution. The Linux blob and both working-file checks
matched the declared UTF-8/LF content SHA-256
`793f9a1d798cc7cddb572138b4ebbeda638a0a6f31c1ee55a262f228c93fb4e9`.
The Linux run retained Git's normal `Preparing worktree` stderr message; stderr
was not empty and was inspected. Commit IDs are observations with ordinary
commit timestamps, not expected cross-run constants.

The fixture rechecks canonical worktree paths under its owned root and its
marker before Git removes the clean linked worktree. Both small fixture roots
and their main repositories/partial repository remain in temporary storage;
their locations are in the manifests. No recursive root deletion or Linux-tree
termination was attempted. The checks do not prove generic path containment,
invalid-path refusal, symlink safety, physical disk allocation or process cleanup.

Verify the saved result without launching WSL:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/path-git/check.py
```

A zero checker exit verifies this **partial** result, including the required
Windows failure; it does not promote it to a successful Windows fixture or S6
pass. The launchers refuse existing evidence. Preserve this cohort and use a
separately named protocol for another native experiment.

## Architecture consequence and next step

Keep Git execution side explicit. A Windows filesystem path convertible by
`wslpath` is not evidence that Linux Git can safely initialize or operate there.
Use the tested Ubuntu filesystem as the bounded candidate for Linux-owned Git
fixtures; Windows-mounted Git remains unqualified on this host. A separate
native Windows Git fixture and cross-side read/interoperability observation
should precede a final per-project Git-side rule. Do not change mount metadata,
permissions, `safe.directory` or global Git configuration to hide this failure.

No dependency installation, provider CLI/model, Electron PTY, terminal parity,
Windows team-tool networking, environment-propagation contract or abnormal
recovery test ran. Full S6, S4 eligibility and the Phase 1 construction gate stay
open. The [full coverage plan](../../feasibility/s6-wsl/PLAN.md) remains the
reference; this fixture supplies bounded parts of steps 4 and 5 only.

## Review

Muse Spark 1.3 Free xhigh, Space Bunny Free xhigh and DeepSeek V4.1 Flash Free
max supplied context-only reviews. They did not inspect the workspace or the
subsequent permission failure. All streams had zero observed tool events.
The parent implemented, ran and checked the actual cohort; provenance is in
[review metadata](review.json). The requested exact Codex model remains
previously unsupported on this account and the recorded consumer Agy route
excluded; neither was dispatched.

Retained advice: isolate Git configuration, check bytes and ancestry, preserve
Unicode script encoding, retain failures and avoid cross-side or performance
claims. Rejected: changing ownership or adding `safe.directory` to force success,
equating a Linux `/tmp` parent with root ownership of the user-created fixture,
and requiring cross-run commit/hash equality. Per-run byte hashes are the evidence.
