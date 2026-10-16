# S6 coverage assessment — 16 October 2026

**S6 is partial. Phase 1 construction remains on HOLD.** This assessment
consolidates the saved Ubuntu cohorts through commit `dce05d5`; it runs no new
native experiment. It supersedes the S6 status and next-step guidance in the
historical [Phase 0 snapshot](../phase0-readiness/ASSESSMENT.md) and
[initial S6 plan](../../feasibility/s6-wsl/PLAN.md). Those source records remain
unchanged; only their S6 status interpretation and next-step guidance are
superseded. Neither successful mock checks nor checker exit 0 qualifies a CLI.

## All nine requirements

Rows follow the [original S6 requirements](../../architecture/TIYE-Agent-Feasibility-Test-Plan.md#s6-wsl).
Each row is **partial** against its full requirement. A failure or refusal within
a row remains a failure or refusal; it is not converted into a successful test.

| Step | Evidence and bounded observation | Remaining qualification |
|---|---|---|
| 1 — WSL/distribution discovery | [Installation](../s6-prerequisites/README.md) and [discovery](../s6-discovery/README.md): explicitly selected Ubuntu, non-root UID 1000, Ubuntu 26.04.1 LTS and shared WSL kernel recorded | Reusable app-side discovery and truthful initialization/error handling; no finished UI is required for this feasibility check |
| 2 — Linux CLI discovery | [Discovery](../s6-discovery/README.md): Linux Git 2.53.0 resolved; Node and six candidate CLI names not found on the fixed tested Linux PATH | One eligible Linux-native CLI with resolved executable, version and capability mapping; user-managed paths were not searched, so global absence is not established |
| 3 — PTY input/display | [Mock PTY](../s6-pty/README.md): Electron/xterm → requested experimental ConPTY → WSL; synthetic ASCII/Unicode/multiline paste, resize, Linux SIGINT and normal exit checked | Real qualified CLI behavior and S1 parity, actual keyboard/clipboard interaction, rendering and abnormal-exit cases; decoded VT is not raw child stdout; no new loaded-DLL inspection |
| 4 — both filesystems/worktrees | [Path/Git](../s6-path-git/README.md) and [owner controls](../s6-cross-git/README.md): Linux filesystem and native Windows Git fixture flows succeeded; Linux Git init on Windows-mounted temporary storage failed with a permission error | A qualified CLI in both intended worktree locations, representative dependency setup and comparable Git/install costs; recorded query durations are not a performance comparison |
| 5 — task/ownership paths | [Path/Git](../s6-path-git/README.md): Windows temporary-root round trip after Windows normalization; Linux path with spaces/Arabic/Japanese round-tripped exactly through UNC | Windows-mounted Unicode case was not reached; invalid/unrelated roots, symlinks and task/ownership containment remain unqualified; lexical translation is not safe access |
| 6 — Windows team tools | [Connectivity](../s6-connectivity/README.md): observed NAT; direct Ubuntu loopback refused; distinct interop pipe route and Windows control completed two-member authenticated mock exchanges | Other available networking modes and real CLI tool attachment; original coordinator exit 1 and inconclusive shutdown connection check remain, supplemented by a later empty listener table; helper/crash cleanup is unqualified |
| 7 — environment | [Environment](../s6-environment/README.md): explicit seven-key allowlist and synthetic Git identity inputs reached Python root/child; positive decoy-import control and filtered baseline; decoded briefing matched | Real CLI commit attribution/instruction adherence, credential delivery and broader environment cases; selected keys used explicit Linux env arguments, not seven-key WSLENV transport; no commit was made |
| 8 — quit/crash/restart ownership | [Lifecycle](../s6-lifecycle/README.md): graceful root/child absence; start-time mismatch refused; both Linux identities already absent after owned Windows launcher termination, so recovery sent zero signals. [PTY](../s6-pty/README.md): normal mock exit and fresh Linux absence check | Actual Electron main crash/restart, live-survivor verified cleanup, duplicate-launch refusal under recovery, descendants/races and fault cases; launcher exit and no-survivor observations do not qualify these paths |
| 9 — cross-side worktrees | [Cross-Git](../s6-cross-git/README.md): each owner-side control succeeded; Linux peer read failed on Windows pointer interpretation; Windows peer read refused ownership/non-local directory | Cross-side sharing is not qualified. The Windows refusal does not prove later pointer parsing fails. Apply the plan's one-Git-side fallback; do not repair metadata or add automatic trust exceptions |

## Decisions supported by these observations

- Pin one Git execution side for the entire project before creating worktrees.
  All Git operations for that project and its linked worktrees use that side;
  do not mix Windows Git and Linux Git within a project. The successful owner
  controls were separate disposable projects, not a mixed-side project.
- Keep team tools bound to Windows loopback. The measured Python → Windows Node
  interop pipe route is a candidate for NAT; it is not a qualified production bridge.
- Build the launch environment explicitly. The tested public tuple and structured
  stdin briefing support mock mechanics; they do not define a secret transport.
- Inspect durable Linux ownership identity before recovery or relaunch. An
  uncertain identity must not authorize cleanup or an automatic duplicate.
- Retain the bundled ConPTY choice as experimental. This capture does not select
  the production terminal backend or resolve S5's historical latency spikes.

These are bounded design constraints and candidates, not implemented product
services. The core service, event store and team engine are still unimplemented.
The existing build order and command/effect persistence contract continue to apply.

## Next work, in order

1. **Exercise recovery with a live surviving mock.** Write a separately named,
   bounded protocol before launch. It must demonstrate a live owned Linux
   identity after an actual Electron main crash, then identity-verified cleanup
   on restart and refusal to launch a duplicate while identity/outcome is
   uncertain. Include an identity-mismatch control that sends no signal. If no
   survivor occurs, report that branch as unexercised rather than retrying until
   a desired outcome appears. No provider access is needed for this mock work.
2. **Qualify a Linux CLI through S4 before provider experiments.** Record the
   exact eligible route, model, native executable/version, authentication method
   and applicable account conditions. A successful host delegate review cannot
   supply this qualification. The recorded consumer Agy route is excluded; its
   operator declaration was received. Do not invoke that route for integration,
   delegation or review. No automatic API or paid-route substitution.
3. Use that eligible CLI for the remaining S6 terminal, worktree/setup and tool
   attachment checks. Treat other network modes and path refusal cases as
   separately scoped protocols, preserving failures and version limits.
4. Reconcile S1–S6 before changing the construction gate. S1–S3 remain partial;
   S4 has no qualified product route; S5 still has memory/hour/platform/cleanup
   gaps and unresolved historical latency observations. The completed diagnostic
   series does not automatically restart. Production UI/core integration belongs
   to construction and must not become a circular feasibility prerequisite.
   These broader gate statuses carry forward the linked Phase 0 assessment;
   this S6-only review does not re-verify S1–S5 runtime behavior.

No requirement is waived or removed by this assessment. The next task is the
recovery protocol and its bounded mock implementation, not another broad S6 run.

## Verification and provenance

[Coverage ledger](coverage.json) records all nine rows and SHA-256 hashes of
the source documents, saved manifests and review records used here. Verification
re-runs only the seven existing offline S6 evidence checkers: discovery, path/Git,
cross-Git, connectivity, environment, lifecycle and PTY. The seven cohorts cover
overlapping parts of the nine rows; checker count is not a row completion count.
Installation/prerequisite records are hash-checked, not re-executed. This checks
stored observations, including expected failures; it launches neither WSL nor a
provider and does not qualify a CLI or close S6.

[Review metadata](review.json) records the exact requested delegate routes,
outcomes, artifact hashes and observed tool-event counts. Supplied-context reviews
are advice on this summary, not independent workspace or runtime verification.
The parent checks source claims, links, preserved evidence bytes and checker exits.
