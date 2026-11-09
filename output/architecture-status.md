# TIYE Agent — Architecture Status

**Date:** 2026-11-09
**Scope:** pre-code architecture/feasibility phase (Phase 0) and approved bounded-construction exceptions
**Overall:** ~70% complete (65–75% judgment); construction gate **HOLD**, with approved synthetic/offline exceptions through Phase 3H.

## Gate status (S1–S6)

| Gate | Status | Remaining to close |
|---|---|---|
| S1 — terminal/lifecycle | **Partial** | Real CLI terminal parity; input/approval/resize/paste/Ctrl+C; descendant races; abnormal recovery; platform matrix |
| S2 — control channel | **Partial** | Supported CLI/version matrix; native error/auth/network/hang/resume signals |
| S3 — worktrees | **Partial** | Representative project setup/cost; native commit attribution; authenticated push; watcher limits; rollback/merge recovery |
| S4 — provider access | **Partial; no qualified route** | One route with written account applicability and native auth/model behavior |
| S5 — performance | **Partial** | Five real terminals; flood/rich/long-run/views/search; memory settling; acceptance or remediation for historical spikes |
| S6 — WSL | **Partial; all nine rows partial** | Eligible Linux CLI; real terminal/worktree/tool attachment; live-survivor recovery; cross-side limits |

## S4 route decision

**No provider/model/auth route qualifies.** The primary attempt — OpenAI Codex
official CLI user login with `gpt-6-luna`/`max` — fails on unresolved paid-desktop/
account eligibility and missing native authentication/model qualification. Claude
Code, Gemini CLI, OpenCode, Agy, API-key routes and unresolved aliases also fail
for the reasons recorded in [the S4 result form](s4-route-qualification/RESULT.md).
S4 remains partial; provider/native integration stays HOLD.

**Decision (2026-11-09):** time-boxed. The Codex follow-up is drafted in
[FOLLOW-UP.md](s4-route-qualification/FOLLOW-UP.md) and should be sent by
2026-11-10; the decision deadline is 2026-11-23. If OpenAI has not provided a
written eligibility path by then, pivot to the Anthropic unmodified Claude Code
route, subject to commercial-condition review and a native auth cohort.

## Freeze check (Phase 0 HOLD vs implementation)

**Post-Phase-3H work:** the approved implementation (`df26d71`), its
qualification repairs and sealed evidence (`05765a2`), and this close-out
commit — all inside the approved Phase 3H exception. Qualifying defects were
corrected within that scope, not waived. Single local branch, synced to
`origin/master` after this commit.

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
| Feasibility execution S1–S6 | ~50% (S4 ~20%; others ~50–60%) |
| Phase deliverables (result matrix, capability data, architecture updates) | ~40% |
| Construction-gate decision | 0% (HOLD) |
| **Overall architecture phase** | **~70% (65–75%)** |

## Top 3 next steps

1. **Qualify one S4 route.** Obtain written paid-desktop/account applicability
   for OpenAI Codex official CLI user auth (or resolve Anthropic's commercial
   conditions for the unmodified CLI), then run one bounded native login/auth/
   model cohort. No provider-backed work before this.
2. **Run real-CLI S1/S2/S6 cohorts with that route.** Capture terminal parity,
   one team-tool round trip, WSL paths/tool attachment, and per-CLI result forms;
   keep all effects synthetic and owned.
3. **Close the phase.** Fill the per-CLI matrix and capability data, apply the
   resulting architecture changes, decide S5 acceptance/remediation and S3
   representative-project scope, and take the gate recommendation to the owner.
   Phase 3H is now closed; that exception grants no further construction.
