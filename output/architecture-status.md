# TIYE Agent — Architecture Status

**Date:** 2026-11-10
**Scope:** pre-code architecture/feasibility phase (Phase 0) and approved bounded-construction exceptions
**Overall:** ~73% complete (68–78% judgment); construction gate **HOLD**, with approved synthetic/offline exceptions through Phase 3H, an owner-approved S4 route exception (verbal-only), and completed bounded real-CLI S1/S2/S6 cohorts.

## Gate status (S1–S6)

| Gate | Status | Remaining to close |
|---|---|---|
| S1 — terminal/lifecycle | **Partial** | Real-CLI display/input/paste/Unicode/resize observed for Codex and Claude Code; OpenCode paste/Unicode fail and teardown is inconclusive; approval, Ctrl+C, lifecycle recovery and Windows Terminal parity still open |
| S2 — control channel | **Partial** | Codex bounded round trip, approval fail-closed, auth/model/network errors, resume and cancellation observed; rate limit and crash not run; Claude Code/Gemini/OpenCode blocked by unqualified S4 routes; interactive approval UI not observed |
| S3 — worktrees | **Partial** | Representative project setup/cost; native commit attribution; authenticated push; watcher limits; rollback/merge recovery; no real-CLI cohort yet |
| S4 — provider access | **Approved by owner exception — VERBAL-ONLY; not evidence-qualified** | Written confirmation, ticket/reference, reversible-policy risk and the five verbal-only answers; native auth/model cohort |
| S5 — performance | **Partial** | Five real terminals; flood/rich/long-run/views/search; memory settling; acceptance or remediation for historical spikes |
| S6 — WSL | **Partial; all nine rows partial** | Real-CLI inventory, paths, environment, ConPTY launch, TUI draw, PTY cleanup and stdio MCP attach observed for Codex 0.157.1; WSL login blocked the model turn; renderer parity, graceful lifecycle, real transport and cross-side worktrees still open |

## Real-CLI cohorts (2026-11-09/10)

Bounded cohorts were run under the owner exception. Results are recorded in
[S1](s1-terminal/RESULT.md), [S2 Codex](s2-control/codex/RESULT.md) and
[S6](s6-real-cli/RESULT.md); the filled summary is
[real-cli-matrix.md](real-cli-matrix.md) and draft capability data is in
[capability-data/](capability-data/README.md).

| Cohort | Result | Establishes | Does not establish |
|---|---|---|---|
| S1 Codex 0.164.0 | Pass (bounded) | Installed launch, startup, input, edit, paste, Unicode and resize; exact PID+creation teardown | Approval, cancellation, lifecycle recovery, Windows Terminal parity, model behavior |
| S1 Claude Code 2.1.321 | Pass (bounded) | Same seven display/input slices; exact teardown | S2–S6 behavior |
| S1 OpenCode 2.2.5 | Partial/Fail | Launch, startup, input; visual edit and resize change | Multiline paste and Unicode display fail; edit/resize teardown inconclusive; TUI had updater + five failed plugins |
| S1 Gemini CLI | Not tested | — | Command absent; installation refused |
| S2 Codex 0.164.0 | Pass (bounded) / Partial | One real task→test→`report_result` round trip; fail-closed approval; 401 auth; 400 `model_not_found`; injected network failure; resume; SIGINT exit 130 | Interactive approval UI; rate limit; crash; non-Codex CLIs |
| S6 WSL Codex 0.157.1 | Partial | Inventory, fixed-path discovery, `wslpath` cases, drvfs/ext4 Git, WSLENV, ConPTY `--version`, TUI draw, PTY cleanup, stdio MCP `initialize`/`tools/list` | Model turn (401 in WSL), tool call, renderer → `wsl.exe` parity, graceful quit/main crash, real network transport, cross-side worktrees |

**Blockers.** WSL Codex is not logged in; no login or credential handling was
attempted. The other three CLIs have no S2 cohort because their S4 routes remain
unreviewed. Full renderer → WSL parity is unqualified because the S1 TUI harness
refuses `wsl.exe`. `wslpath` accepts relative and empty inputs (validation must
live above it). OpenCode's TUI was updating and five plugins failed, including a
PTY plugin; its behavior is host-state-specific.

**Effect on architecture.** Codex remains the only CLI with an end-to-end S2
round trip. Approvals and cancellation must be app-owned: non-interactive exec
mode cannot prompt, and a signalled run can still emit `turn.completed`. Resume
requires a persisted thread id and working directory. WSL CLIs must be found by
configured location, not fixed `PATH`, and WSL login stays user-controlled.

## S4 route decision

**Owner override (2026-11-09): S4 is APPROVED-BY-OWNER-EXCEPTION for the OpenAI
Codex official-CLI user-login route.** The project owner accepts a verbal OpenAI
support assurance from a voice call as sufficient basis and orders S4 approved.
The route is **not evidence-qualified**: the repository evidence still shows no
written policy/account eligibility or native authentication/model behavior.
Real-CLI S1/S2/S6 cohorts are unlocked; capability data, provider integration
and release remain HOLD.

**Residual risks accepted by the owner:**

1. No written confirmation.
2. No ticket reference.
3. The policy position is reversible.
4. Questions 1–5 were answered verbally, not in writing.
5. Call date/time, participant identity/authority and any recording were not
   supplied and are not independently recorded.

The earlier time-boxed decision (follow-up by 2026-11-10; deadline 2026-11-23)
is superseded for execution. [FOLLOW-UP.md](s4-route-qualification/FOLLOW-UP.md)
remains unsent and optional; it is still the path to written confirmation.
The evidence review and candidate ledger are in
[the S4 result form](s4-route-qualification/RESULT.md).

## Freeze check (Phase 0 HOLD vs implementation)

**Post-Phase-3H work:** the approved implementation (`df26d71`), its
qualification repairs and sealed evidence (`05765a2`), the S4 owner-override
record, the bounded real-CLI S1/S2/S6 cohorts and their result forms, and the
close-out commits — all inside the approved Phase 3H / Phase 0 feasibility
scope. Qualifying defects were corrected within that scope, not waived. Single
local branch, synced to `origin/master` after each commit.

| Work unit | Verdict |
|---|---|
| Phase 1A core | approved-exception (explicit owner approval) |
| Phase 1B synthetic effects | approved-exception (approved Phase 1 amendment; coverage record in `output/phase1b-approval/`) |
| Attention resolution | approved-exception (required by the approved first-core contract; coverage record in `output/attention-resolution/APPROVAL.md`) |
| Shared task registry | approved-exception (core convergence; coverage records in `output/task-registry/APPROVAL.md`) |
| Phases 2A–3G | approved-exception (separate approval JSON per phase, bound to proposal hashes) |
| Phase 3H | approved-exception (approval `ce002a0`; read-only failure view); qualified at `05765a2` (588 tests: 552 retained + 36 new); bounded exit acceptance (`output/phase3h-exit/decision.json`) |
| S1–S6 feasibility prototypes | approved-exception (Phase 0 Feasibility Test Plan; no product integration) |
| Evidence and LinkedIn outputs | not implementation |

**Violations:** none established. **Governance close-out:** Phase 1B, attention
resolution and the shared task registry now have standalone coverage records
(`output/phase1b-approval/`, `output/attention-resolution/APPROVAL.md`,
`output/task-registry/APPROVAL.md`). They are determinations derived from existing
owner approvals, not new or fabricated approvals. The Phase 1A approval's
`phase1bExecutionAllowed:false` is retained unchanged because its hash is bound by
Phase 1A evidence; the later 1B coverage record is the operative determination.
Phase 3H is qualified at `05765a2` and its exit decision records bounded
acceptance (`output/phase3h-exit/decision.json`); neither grants new scope. No
product code outside an approved phase was found in `packages/`.

## Completion estimate

| Component | Estimate |
|---|---|
| Architecture/product documents | ~100% |
| Feasibility execution S1–S6 | ~60% (real-CLI S1/S2/S6 cohorts executed within the owner exception; S4 evidence ~20%; S3 real-CLI and S5 acceptance still open) |
| Phase deliverables (result matrix, capability data, architecture updates) | ~60% (S1/S2/S6 forms, C2 matrix and draft capability data written; S3/S5 rows and promotion review open) |
| Construction-gate decision | 0% (HOLD) |
| **Overall architecture phase** | **~73% (68–78%)** |

## Top 3 next steps

1. **Convert the S4 owner exception into written evidence.** Pursue written
   paid-desktop/account applicability for the Codex official-CLI route and
   record any ticket/reference; this closes residual risks 1–4. If written
   eligibility is refused, revisit the route decision.
2. **Close the real-CLI gaps that need owner control.** Have the owner sign in
   to Codex inside WSL (the app must not read or relay credentials), then re-run
   the S6 model/tool turn, renderer → `wsl.exe` parity, graceful quit and crash
   lifecycle. Re-run OpenCode 2.2.5 paste/Unicode/teardown after the updater and
   failed-plugin state is controlled.
3. **Finish the unfilled rows and take the gate recommendation to the owner.**
   Run a real-CLI S3 cohort, decide S5 acceptance/remediation, close or defer the
   S2 rate-limit/crash and interactive-approval rows, review capability data for
   promotion (currently all `productionEligible: false`), and present the
   construction-gate decision. Phase 3H is closed; that exception grants no
   further construction.
