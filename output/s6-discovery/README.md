# Initialized Ubuntu prerequisite discovery — 16 October 2026

**Prerequisite discovery completed; full S6 remains unqualified.** The operator
confirmed first-run setup, the Windows registry indicated a nonzero default UID,
and the Ubuntu query returned UID 1000. The earlier
[installation snapshot](../s6-prerequisites/README.md) remains unchanged.

| Observation | Result from this capture |
|---|---|
| Distribution release | `/etc/os-release`: `ID=ubuntu`, `VERSION_ID=26.04`, `PRETTY_NAME=Ubuntu 26.04.1 LTS` |
| Shared WSL kernel | `6.18.33.2-microsoft-standard-WSL2` |
| Linux-native Git | `/usr/bin/git`, resolved to `/usr/bin/git`, ELF magic `7f454c46`, `git version 2.53.0` |
| Node | Not found on the tested PATH |
| Candidate CLI names | `codex`, `claude`, `opencode`, `gemini`, `agy`, `mimo`: not found on the tested PATH |
| Query outcomes | Five fixed queries; all exit 0, no timeout, empty stderr |

These are local observations, not a general claim about Ubuntu's bundled tools
or the latest upstream releases. Missing executables may exist outside this
restricted PATH, including user-managed installations. Neither CLI installation
nor provider entitlement is inferred from the Windows installation.

## Method and integrity

The [discovery script](../../feasibility/s6-wsl/discover.py) follows the
[recorded plan](../../feasibility/s6-wsl/PLAN.md). It explicitly selects `Ubuntu`,
uses `/usr/bin/env -i` and a fixed Linux PATH, invokes `/bin/sh -s` with UTF-8/LF
script bytes, and does not load login profiles. A UID check precedes the other
queries; zero or malformed UID stops discovery. Git/Node version execution
requires a resolved path outside `/mnt` and an ELF header. Non-ELF wrappers are
reported as present but not executed for versions. Agent CLIs are presence-only.

The [manifest](discovery.json) contains exact commands/scripts, query timestamps,
exit status, source hashes and raw stdout/stderr artifact hashes and lengths.
Source hashes matched before/after execution. There was one attempt per query;
each had a 30-second timeout and the cohort had a five-minute deadline. The
output directory is created exclusively to preserve an existing capture.
No provider CLI, credential file or model was accessed by the Ubuntu discovery
script; separately authorized host-side delegate reviews are recorded below.

From the repository root, verify this specific saved capture without launching WSL:

```powershell
rtk proxy python -X utf8 feasibility/s6-wsl/check-discovery.py
```

This checker pins the observed Git version and PATH outcomes to this capture;
it is not a portable Ubuntu support test. The native discovery script refuses
the existing output directory. Start a separately named cohort for later native
measurements rather than deleting evidence to rerun it.

## Limits and next step

No Electron PTY, display/input parity, path translation, filesystem/worktree
operation, Windows tool-server connection, environment-propagation sentinel,
process-tree cleanup or cross-side Git interoperability was tested. No packages
were installed. The core-construction gate and S4 eligibility remain unchanged.

Next, define and run bounded local path/Git fixtures on both filesystems using
the available Linux Git and shell. Use separate disposable roots and explicit
Git ownership sides; preserve the user's checkout. Node is not a prerequisite
for those fixtures. Add developer tools or a provider CLI only in a separately
scoped setup step; provider-backed work still needs S4 qualification.

## Delegation and review

Muse Spark 1.3 Free xhigh and the authorized Space Bunny Free xhigh and DeepSeek
V4.1 Flash Free max fallbacks completed supplied-context reviews. Recursive
event inspection found no tool events; their changed-worktree reports correspond
to parent-created discovery files during the calls. They did not independently
inspect the workspace or verify the measured Linux results. The parent verified
the stored artifacts and documented the findings. See [review metadata](review.json).

Retained caveats: distinguish the shared kernel from OS release, resolve
symlinks, retain non-ELF refusal, and scope missing tools to the tested PATH.
The proposed retry was rejected to preserve the declared one-attempt protocol;
a failed query would remain incomplete, not prove absence. Killing the WSL client
on timeout is not proof of Linux-tree cleanup. No timeout occurred here.

The exact requested Codex model was previously unsupported on this account;
the consumer Agy route remains excluded. Neither was dispatched or silently
replaced by a metered route. Fallback reviews do not qualify product access.
