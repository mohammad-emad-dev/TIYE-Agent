# S6 — Ubuntu prerequisites and qualification plan

Recorded 16 October 2026. **S6 is not run.** Ubuntu installation is a prerequisite,
not a terminal, control-channel or recovery result. The
[installation record](../../output/s6-prerequisites/README.md) separates these states.

## Next bounded cohort: initialized-user discovery

Start only after the operator confirms Ubuntu's interactive first-run account
setup is complete. Inspect the selected `Ubuntu` distribution explicitly; do not
use the default distribution. A nonzero registry `DefaultUid` is a supporting
indicator, not sufficient proof of a usable account. Do not bypass initialization
using a root account or collect a password in the harness.

The discovery cohort has one attempt per fixed query, a 30-second timeout per
query and a five-minute total deadline. Preserve nonzero exits/timeouts as
incomplete evidence; no automatic retry or tool installation. Query only OS
release, shared WSL kernel, current-user UID, Linux Git/Node executable presence
and versions, and the presence of the candidate CLI executables. Do not invoke
provider CLIs, read their configuration or authentication, or request a model.

Use a fixed Linux PATH (`/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`)
and resolve executable paths before version commands. A Windows-interoperability
path is not Linux-native availability. A missing Node executable under this PATH
means **not found on the tested PATH**, not absent from the whole distribution;
user-managed installations are outside this initial cohort. Record Ubuntu release
from `/etc/os-release`; `uname -r` identifies the shared WSL kernel.

Proposed workspace policy for later fixtures: dedicated disposable test roots
on Windows and Ubuntu filesystems, Linux Git for Linux-owned fixtures, and
separate explicit interoperability fixtures for the cross-side test. Do not
convert or reuse the user's main checkout as an interoperability experiment.
Determine concrete roots and versions during discovery before approving a runtime
protocol. No filesystem/Git policy is qualified by this plan.

## Coverage map for the full S6 test

The rows below preserve all nine requirements in the
[existing test plan](../../architecture/TIYE-Agent-Feasibility-Test-Plan.md#s6-wsl).
They are planned qualification work, not observations. Runtime protocols must
pin exact versions, fixtures, deadlines, ownership and cleanup before launch.

| Test-plan step | Required future evidence | Current status |
|---|---|---|
| 1 — detect WSL/distributions | App-side discovery with exact names/version and truthful initialization status | Windows-side inventory recorded; app integration untested |
| 2 — detect Linux CLIs | Per-distribution Linux-native paths/version, supported route identity and capability mapping | Waiting for user setup; no CLI invoked |
| 3 — PTY display/input | A qualified CLI launched through `wsl.exe` inside Electron's PTY; compare the S1 input/display behaviors | Not run; requires a qualified S4 route for provider work |
| 4 — both filesystems | Separate Windows/Ubuntu filesystem worktree fixtures; Git/setup timing, cost and path failures | Not run |
| 5 — path translation | Exact Windows/Linux round trips, including spaces/Unicode and refusal of invalid or unrelated roots | Not run |
| 6 — Windows tool server | Correlated mock team-tool round trip with per-member authentication for each available WSL network mode; unavailable modes explicitly untested | Not run; no network configuration changes approved here |
| 7 — environment | Explicit allowlisted sentinel and Git attribution variables reach the owned WSL child, without exporting secrets | Not run |
| 8 — graceful/crash cleanup | Separate quit and abnormal-main-exit fixtures, durable process identity, verified child absence or verified survivor handling, no duplicate launch | Not run; Windows Job Object behavior is not Linux-tree cleanup proof |
| 9 — cross-side Git worktrees | Windows-created worktree used with Linux Git and the reverse, using isolated fixtures and preserving failure/refusal evidence | Not run; choose one Git side per project if interoperability is unsafe |

Provider-backed experiments remain behind S4 qualification. Local mock probes
can establish mechanics only. The full-S6 decision requires the nine rows to be
reviewed against their evidence and limitations; installing Ubuntu closes none
of them by itself. Product construction remains subject to the Phase 0 gate.
