# Codex protocol and transport readiness — 16 October 2026

**Phase 1 remains HOLD. S4/S6 remain partial; no product provider route is qualified.**
This dated consolidation describes preserved local evidence. It makes no new
native measurement or current provider-policy check. The planned paid desktop
and Free tier remain the product scope; the core service, event store and team
engine are not implemented.

## Evidence by level

| Evidence | What is established | What remains unqualified |
| --- | --- | --- |
| [Linux prerequisite](../s4-codex-candidate/README.md) | Pinned official Codex 0.157.1 ELF installed; explicit Ubuntu, UID 1000; version/help captured | Native authentication, model/effort entitlement, full startup/helper behavior and TIYE integration scope |
| [Schema capture](../s4-codex-schema/README.md) | 314 version-specific JSON declarations | Listener, handshake, runtime ordering, auth/model access or protocol completeness |
| [Offline replay](../s4-codex-replay/README.md) | 14 behavior tests, 17 synthetic steps; typed IDs, owned completion, duplicate/conflict handling and local single-use reply plans | Real vendor approvals, enforcement, application outcomes or durable effects |
| [Offline framing](../s4-codex-framing/README.md) | 11 behavior tests, 9 synthetic steps; UTF-8 JSONL bounds, malformed records, EOF and closed-connection replies | Real CLI transport, reconnect/resume, lifetime memory bounds or runtime limits |
| [Windows Python stdio](../s4-codex-stdio/README.md) | 8 scenarios, 8 capture tests; actual pipes, peer-observed synthetic denial, write error, output-prefix limits and direct-child cleanup | Provider behavior, WSL parity, arbitrary process trees, production transport selection |
| [Windows pipe lifetime](../s4-codex-pipe-lifecycle/README.md) | 3 adversarial scenarios, 6 capture tests; peer execution after stdout EOF and continued reads while a writer is blocked | Real CLI backpressure, delivered byte count of a cancelled write, all buffers or full post-kill drain |

Tests, scenarios, schema files and transcript steps are different measures;
they are not added into a coverage percentage. A passing saved checker establishes
artifact consistency within its scope, not source authenticity or qualification.
Host delegate calls are separate authorized review activity, not evidence of
access from TIYE's proposed Linux integration.

Protocol completion, process exit and task success remain separate. The synthetic
fixtures retain `taskSuccess: null`. Replay fingerprints cover canonical decoded
JSON, not raw wire bytes, human authorization or exact external-effect binding.
The captured reasoning-effort string does not establish `max` entitlement. The
captured `chatgptAuthTokens` variant has an internal-use warning; it supplies no
approval to use that variant and says nothing definitive about other routes.

## Current route decision

The [candidate route record](../s4-codex-candidate/route.json) remains the authority
for this dated snapshot. Account declaration has been received; account values
are not republished here. Selected-route eligibility, native authentication and
model access remain unqualified. Sign-in-with-ChatGPT acceptance is unrecorded;
the usage-billed API route is a separate, unselected option. A working personal
login, public sign-in button or successful host review does not settle TIYE's
paid local orchestration scope.

The [provider clarification draft](../s4-codex-candidate/PROVIDER-CLARIFICATION.md)
is prepared and **unsent**. No inquiry, registration, token exchange, billing
substitution or business-model change occurs in this task. The recorded consumer
Agy route remains excluded from integration and delegation. This assessment does
not generalize that exclusion or the Codex schema warning into a ban on all CLI
workflows. Current official policy must be reviewed before a future native run;
this report preserves the earlier unresolved decision rather than revalidating it.

## S6 overlay on the historical assessment

All nine [test-plan rows](../../architecture/TIYE-Agent-Feasibility-Test-Plan.md#s6-wsl)
remain partial. The [earlier nine-row assessment](../s6-assessment/coverage.json)
and [Phase 0 snapshot](../phase0-readiness/ASSESSMENT.md) are preserved historical
records. This report updates their relevant observations without rewriting them:

- **Row 2:** the later explicit-path Linux Codex version/help capture adds a pinned
  executable. The original absence on the tested PATH is not global absence;
  reusable app discovery, native auth and model capability remain open.
- **Row 8:** the [later recovery cohort](../s6-recovery/README.md) observed an
  intentionally detached Linux supervisor/child after an actual Electron crash,
  duplicate/mismatch refusals and pidfd-bound cleanup with verified absence.
  Natural provider trees, concurrent recovery, actual PID reuse and timeout
  cleanup remain unqualified.
- **Rows 3–7:** real CLI PTY parity, intended filesystem/worktree behavior and
  representative costs, root/path containment, Windows team-tool attachment and
  native environment/adherence remain open. Windows Python pipes do not close
  WSL rows. NAT direct loopback refusal, mock relay success and the inconclusive
  shutdown-connect check are all retained.
- **Rows 4/9:** keep the mounted-path Git initialization failure and cross-side
  peer-read failures/refusals. Use one Git execution side for the project and all
  linked worktrees. Windows Git's UNC trust refusal does not establish what its
  pointer parsing would do beyond that refusal; no trust bypass is prescribed.

The [machine-readable map](readiness.json) includes every row, evidence references,
eight open requirement groups, dependencies and observable acceptance criteria.
S1–S3 and S5 limits in the Phase 0 snapshot remain open; this is not a replacement
assessment of all their individual cohorts.

## Next execution decision

Resolve the selected route's scope and any required onboarding using the prepared
draft. Sending it requires the user's explicit authorization; none is inferred
from “continue.” No further account plan/country declaration is requested.

The [conditional native plan](NEXT-RUN.md) is reviewable preparation, not an
executed protocol or route approval. After eligibility is established, finalize
its exact native control surface, identities, deadlines and sanitized witnesses
before launching an authenticated task. Do not turn generated schemas into a
production transport choice or migrate the frozen Python harness into product code.

Architecture [3.8](../../architecture/TIYE-Agent-Architecture.md#38-durable-command-and-external-effect-contract)
continues to require committed effect intent before external action, atomic
outcome/state recording and reconciliation of uncertainty. An unknown write or
request outcome does not authorize resend, callback replay or a duplicate member.
The finished product UI/event store is later construction, not a prerequisite
that feasibility tests must first implement. No requirement is waived here.

## Verification

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/codex-transport-assessment/check.py
```

The checker verifies [index.json](index.json), referenced local files, the six
Codex cohorts' recorded source/artifact hashes, count agreement and non-qualifying
status/dependencies. Other historical records are pinned as snapshots, not rerated.
It launches no process, CLI, WSL, provider or website. Architecture and the older
plan use explicit UTF-8/LF-normalized hashes; measured inputs use raw byte hashes.
`--seal` exclusively creates the index and refuses an existing index. It does not
refresh native observations, policy applicability or entitlement. Review scope
and outcomes are recorded in [review.json](review.json).
