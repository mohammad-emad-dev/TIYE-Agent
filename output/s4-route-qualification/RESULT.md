# S4 route qualification result form (C1)

**Date:** 2026-11-09
**Test:** S4 — login access per provider
**Mode:** Repository-evidence review. No new native process, login, credential
inspection, provider request or product implementation was started.
**Evidence result:** **Closed by owner — verbal-only accepted as final.**
**Owner decision:** **S4 APPROVED-BY-OWNER-EXCEPTION (CLOSED)** for the
OpenAI Codex official-CLI route. Real-CLI S1/S2/S6 cohorts are unlocked.
Owner override 2026-11-09 (verbal-only exception); written-evidence pursuit
closed 2026-11-11. Provider integration and release remain **HOLD**.

## Owner override — 2026-11-09

**Decision:** The project owner explicitly accepts a verbal OpenAI support
assurance, received by voice call and reported by the owner, as sufficient
basis and orders S4 approved. The OpenAI Codex route is
**APPROVED-BY-OWNER-EXCEPTION** and is **not evidence-qualified**.

| Field | Record |
|---|---|
| Authority | Project owner; explicit authorization recorded 2026-11-09 |
| Provider / route | OpenAI — official Codex CLI user login (`gpt-6-luna`, `max` proposed) |
| Basis | Owner-reported verbal assurance from OpenAI support during a voice call |
| Call details as supplied | Voice call with OpenAI support; verbal assurance. No call date/time, participant name or team, ticket, recording or transcript was supplied. |
| Evidence class | **VERBAL-ONLY** |
| Route status | **APPROVED-BY-OWNER-EXCEPTION — not evidence-qualified** |
| Unlocked | Real-CLI S1/S2/S6 qualification cohorts |
| Not granted | Written policy permission, client ID, plan/model entitlement, provider integration, capability-data promotion, release |
| Owner-reported answers | The owner reports that questions 1–5 below were answered verbally on the call; no written answers are on file. |

### Residual risks accepted by the owner

1. **No written confirmation.** The assurance exists only as an owner-reported
   verbal statement; no letter, email, policy interpretation or written
   eligibility path is on file.
2. **No ticket reference.** The call produced no case ID, ticket or receipt
   number that can be cited, verified or followed up.
3. **Policy position reversible.** OpenAI may change or withdraw its position;
   this record captures the owner's risk acceptance, not a durable permission.
4. **Questions 1–5 answered verbally, not in writing.** The five S4 questions
   remain without written answers and cannot be independently verified.
5. **Call metadata incomplete.** The date/time, OpenAI participant's identity
   and authority, and any recording or transcript were not supplied; the
   assurance is attributed to the owner's report only.

The owner accepts these risks for the purpose of unlocking real-CLI
qualification. This override does not convert the verbal assurance into
evidence, does not promote capability data, and does not admit a provider
adapter, login member or API member.

## Owner closure — 2026-11-11

**Decision:** The project owner closes the written-evidence pursuit for the
OpenAI Codex route. The owner states that verifying this point would put their
information at risk, and considers the issue resolved.

| Field | Record |
|---|---|
| Authority | Project owner; explicit closure recorded 2026-11-11 |
| Reason | Information-risk concern; the owner declines to pursue written confirmation from OpenAI |
| Previous status | APPROVED-BY-OWNER-EXCEPTION (VERBAL-ONLY) |
| New status | **APPROVED-BY-OWNER-EXCEPTION (CLOSED)** |
| Evidence gap | Unchanged — the five residual risks listed in "Owner override — 2026-11-09" still exist; no written evidence has been obtained |
| Residual risks 1–5 | **Accepted as final by the owner.** The evidence gap is permanent; the owner accepts it rather than retiring the risks. |
| FOLLOW-UP.md | **Withdrawn by owner decision.** The draft was never sent and will not be sent. |
| Effect on unlocked cohorts | None — real-CLI S1/S2/S6 qualification cohorts remain unlocked per the 2026-11-09 override |
| Effect on HOLD items | None — provider integration and release remain HOLD; capability-data restriction stands |

This closure does not introduce new evidence, does not retire the residual
risks, and does not change the evidence-review finding. It records the owner's
permanent acceptance of the verbal-only basis and withdrawal of the
written-evidence pursuit.

## C1 result fields

| Field | Entry |
|---|---|
| Test and CLI | S4 route qualification; installed candidates: Codex 0.157.1, Claude Code 2.1.294, OpenCode 2.0.28, MiMo 0.1.15, Agy 1.3.5; Gemini command unavailable |
| Tool versions | Windows 11 host; Linux Codex 0.157.1 pinned in WSL; Node/Electron not exercised for S4; Git not relevant |
| Result | Fail (no route evidence-qualified); superseded for execution by the owner override above |
| Owner override | OpenAI Codex route **APPROVED-BY-OWNER-EXCEPTION (VERBAL-ONLY)**; real-CLI S1/S2/S6 cohorts unlocked |
| What worked | Published-policy review, local version/help inventory, Codex Linux install/hash/schema capture, offline JSONL replay/framing and synthetic stdio |
| What did not | Account/product applicability, native authentication, model entitlement and live provider behavior for every candidate |
| Workaround used | None; no substitution, token reuse, credential extraction or API-billing switch |
| Measurements | No new measurements. Existing evidence is documentary/offline only. |
| Evidence | [S4 research](../../feasibility/s4-provider-access/RESULTS.md), [route inventory](../../feasibility/s4-provider-access/routes.json), [conditions](../../feasibility/s4-provider-access/conditions/README.md), [Codex candidate](../s4-codex-candidate/README.md), [route refresh](../s4-codex-route-refresh/README.md), [transport assessment](../s4-codex-transport-assessment/README.md), [Agy decision](../../feasibility/s4-provider-access/antigravity-consumer/route.json) |
| Architecture impact | Real-CLI S1/S2/S6 qualification cohorts unlocked by the owner exception. No capability data promoted; no provider adapter, login member or API member admitted; provider integration and release remain HOLD. |

## Primary attempted route

| Field | Entry |
|---|---|
| Provider | OpenAI |
| Model | `gpt-6-luna`, `max` effort (proposed; entitlement not qualified) |
| Authentication | Official Codex CLI user login / subscription, user-controlled; Sign in with ChatGPT and API-key routes kept separate |
| Account applicability | Operator supplied a non-secret plan/country declaration (not retained). TIYE's paid desktop/Free-tier distribution is not established. The app-server commercial/hosted restriction applies; Sign in with ChatGPT commercial availability is limited and TIYE has no client ID or acceptance. The authorized inquiry was submitted 2026-10-16; no response or receipt number is recorded. |
| Installed native behavior | Linux Codex 0.157.1 installed and SHA-256 verified; `--version`, app-server schema/help, offline JSONL replay/framing and synthetic Windows stdio captured. No login, auth-status check, app-server session or model request was run. |
| Result | **APPROVED-BY-OWNER-EXCEPTION — not evidence-qualified.** The repository evidence remains Fail: no written policy/account eligibility and no native authentication/model behavior is recorded. The owner override above accepts the residual risks and unlocks the cohorts. This is not a class D ban. |

### S4 step check — OpenAI Codex

| Step | Finding | Verdict |
|---|---|---|
| 1. Read current terms and automation policy | App-server commercial/hosted restriction recorded; Sign in with ChatGPT commercial participation limited; paid-local-desktop scope unresolved | Fail |
| 2. CLI subscription login | Documented and installed; no live login performed | Unverified |
| 3. Scripted/non-interactive use | Documented; applicability to TIYE's distribution unresolved | Fail |
| 4. Official third-party method | No recorded TIYE client ID, registration or acceptance; inquiry pending | Fail |
| 5. API-key route | Documented; not selected, priced or authorized as a substitute | Unverified |
| 6. Classify provider | Official CLI user-auth route remains unqualified; app-server variant not approved; credential reuse not attempted | Fail |

## Candidate failure ledger

| Candidate | Provider / model | Authentication | Account applicability | Installed native behavior | Result and exact failure |
|---|---|---|---|---|---|
| Codex official CLI | OpenAI / `gpt-6-luna` max | User login in official CLI; API key separate | Paid-desktop scope, app-server restriction, regional terms and model entitlement unresolved; verbal-only owner-reported assurance accepted by override | 0.157.1 installed; prerequisite/schema/offline protocol only; no auth or inference | **APPROVED-BY-OWNER-EXCEPTION — not evidence-qualified**; no written product eligibility and no native authentication or model request |
| Claude Code (unmodified) | Anthropic / model not bound | Official CLI user sign-in, per-user billing; credential intermediation blocked | Commercial/consumer terms and conditional unmodified-CLI route need case-specific review; no accepted agreement recorded | 2.1.294 version/help only; no login/headless run | **Fail** — commercial conditions and approval integration unreviewed; no native auth |
| Gemini CLI | Google / model not bound | Google account login | Direct third-party OAuth backing-service reuse expressly prohibited (class D); official CLI orchestration scope unresolved | `gemini` command unavailable on tested PATH; no installed behavior | **Fail** — blocked OAuth-reuse route and no installed native candidate |
| OpenCode V2 | Provider-dependent / model not bound | CLI-managed provider-specific credentials | Underlying vendor/access permission unresolved; no provider declaration | 2.0.28 version/help only; no headless qualification | **Fail** — no resolved provider/account route; no native auth |
| Agy consumer wrapper | Google / `gemini-3.8-flash-high` | Consumer account login via `agy` | Operator declaration received, but consumer third-party wrapping explicitly unsupported; route class D; wrapper excluded from integration/delegation | 1.3.5; model list/version observed; no native model request; no Gemini CLI parity | **Fail** — policy-excluded route |
| API-key routes | OpenAI / Anthropic / Google / model not bound | API key / API or Vertex | Documented routes, but pricing, regional/account conditions and product applicability unreviewed; no billing switch authorized | No API member or native request qualified | **Fail** — no account/pricing/policy review and no native qualification |
| Atria Dawn / Muse Spark aliases | Vendor/endpoint unresolved / aliases only | Unresolved | Permission unreviewed; delegate aliases do not identify a service vendor | MiMo 0.1.15, Claude 2.1.294, OpenCode 2.0.28 observed; no native request | **Fail** — alias does not establish vendor, endpoint, account or permission |

## Decision (evidence review) — superseded for execution by the owner override

No candidate satisfies all S4 steps: published permission, CLI subscription
login, scripted use, official third-party method, API-key route, and applicable
account/native behavior. S4 cannot be promoted on evidence. Do not promote
capability data, and do not treat model output or delegate reviews as
entitlement.

The least-blocked future attempt is the OpenAI Codex official-CLI user-auth
route because its native prerequisite work is the most complete; it remains
without written paid-desktop/account eligibility and a native auth/model
cohort. Unmodified Claude Code is the alternative, blocked on commercial-condition
review. No route is evidence-qualified by this form.

The owner override above supersedes **only the execution block** for real-CLI
qualification cohorts. The evidence findings and the capability-data restriction
stand; the override is an owner risk acceptance, not provider evidence.

## Decision — 2026-11-09 (time-boxed; superseded for execution)

**Option (c): time-boxed decision deadline with a fallback.**

- The 2026-10-16 Codex commercial inquiry is unanswered after 24 days. Its exact
  unresolved questions are drafted in [FOLLOW-UP.md](FOLLOW-UP.md). The draft is
  **not sent**; sending requires explicit owner authorization.
- **Action:** authorize and send the follow-up by **2026-11-10**.
- **Decision deadline:** **2026-11-23** (14 days). If OpenAI has not provided a
  written eligibility path, a named review owner, or a receipt/reference by then,
  pivot to the Anthropic unmodified Claude Code route.
- **Fallback reasoning:** the published Claude Code route preserves the user's own
  login and per-user billing and has no recorded third-party client-ID gate. It
  still requires commercial-condition review and a native auth/model cohort before
  it can qualify; the pivot is a route to review, not an approval.
- **Until the deadline:** no provider-backed S1/S2/S6 work and no capability-data
  promotion. S4 remains partial and provider/native integration remains HOLD.

**Superseded for execution on 2026-11-09 by the owner override above.** The
time-box and fallback are retained as history. [FOLLOW-UP.md](FOLLOW-UP.md)
remains unsent and optional; it is still the path to written confirmation and
closure of residual risks 1–4.

**Withdrawn on 2026-11-11 by owner closure.** The time-boxed follow-up,
decision deadline, fallback pivot and [FOLLOW-UP.md](FOLLOW-UP.md) are
withdrawn by the owner's decision to close the written-evidence pursuit. The
draft is not merely unsent; it will not be sent. The residual risks are
accepted as final under the owner closure above.

