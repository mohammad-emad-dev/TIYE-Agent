# Ubuntu installation for S6 — 16 October 2026

**Ubuntu is installed as WSL 2; first-run user setup is pending.** The operator
approved Ubuntu for this work. The parent installed it with automatic launch
disabled:

```powershell
rtk proxy wsl.exe --install Ubuntu --no-launch --version 2
```

This command describes the completed installation; do not rerun it as a test.
The installed WSL help lists the positional distribution, `--no-launch` and
`--version` options. Its help invocation returned a nonzero status despite
printing the option list; no help-command success claim is made.

## Observations

- [Installation](installation.json) returned exit 0 and empty stderr. Ubuntu was
  absent before and registered afterward; distribution count increased from one
  to two. The [raw UTF-16LE installer stdout](install-stdout.utf16le) matches the
  recorded byte count and SHA-256.
- [Registered distributions](registered-distributions.txt) and
  [selected registry facts](setup-state.json) show Ubuntu as WSL 2, Docker Desktop
  still registered and default, and Ubuntu's default UID zero/unset. This is an
  initialization indicator; it does not prove a usable Linux account.
- The parent did not launch Ubuntu or perform Linux discovery. OS release,
  Linux-native Git/Node/CLI availability and the test workspace remain unmeasured.
  No developer tool or provider access was installed/configured in Ubuntu.
- Docker configuration equality was not measured. No full registry baseline was
  captured; continued registration/default status is the bounded observation.

## User step and continuation

Open PowerShell and run:

```powershell
wsl.exe -d Ubuntu
```

Complete Ubuntu's first-run Linux username/password setup and tell the developer
when ready. Keep the password in Ubuntu's prompt. On setup failure, report the
error without sharing credentials; discovery remains pending.

Then follow the [S6 plan](../../feasibility/s6-wsl/PLAN.md): one bounded Linux
prerequisite-discovery cohort before terminal/network/worktree/cleanup tests.
S6, Phase 0 and product eligibility remain unqualified. The
[earlier inventory](../phase0-readiness/wsl-prerequisites.json) remains a historical
snapshot from before installation.

## Review scope

Muse Spark 1.3 Free xhigh and the authorized Space Bunny Free xhigh and DeepSeek
V4.1 Flash Free max fallbacks completed supplied-context reviews. No independent
workspace checks were performed by the reviewers. Their streams contained zero
observed tool events; parent edits during the calls explain the latter two
relays' changed-worktree reports. The parent owns installation, verification and
GitHub synchronization. See [review metadata](review.json).

Retained advice: separate installation from initialization, preserve explicit
distribution targeting, avoid Windows PATH false positives and gate Linux checks
on user setup. Full-registry capture, a hardcoded UID 1000 requirement and claims
that every system path must be under one particular directory were not adopted:
the recorded projection, operator confirmation and executable provenance checks
serve the actual discovery contract. No claim of byte-identical Docker settings
or a qualified WSL account follows.

The exact requested Codex model remains previously unsupported on this account;
the recorded consumer Agy route remains excluded. Neither was invoked. The
fallbacks are review calls separate from S4 product-route qualification.
