# S4 provider access: entry plan

**State: research planned; provider classifications unreviewed.** S3 has a
verified bounded evidence inventory and remains partial. S4 documentation
research can proceed independently; production and implementation gates remain
open across feasibility phases.

## First research cohort

Inspect official provider documentation and the installed CLI's documented
version/help behavior for Anthropic, OpenAI and Google. For OpenCode, identify
the provider and access route separately for each supported configuration.
User-requested model aliases identify requested execution routes; they are not
evidence that the CLI vendor supplies that model or grants subscription access.
Additional providers require an explicit scope entry in the research inventory.

This first cohort collects documentation and local version/help information.
Provider login, account changes, live subscription/API requests and cloud
effects belong to later, separately scoped native qualification cohorts.
Existing delegate execution records are not replayed to infer access rights.

## Record per provider and route

| Field | Required evidence |
|---|---|
| Vendor / model / CLI / route | Exact identities; avoid treating aliases or aggregators as official vendor access |
| Official sources | Direct documentation/terms/policy URLs, date reviewed and relevant scope |
| Native capability | CLI version and documented login/non-interactive interfaces; distinguish documented from measured behavior |
| Permitted access | Evidence addressing subscription automation and third-party orchestration for that route |
| Third-party login | Official mechanism, if documented; unresolved applicability remains unreviewed |
| API route | Official availability/limits, billing model and separate credentials model |
| Classification | Test-plan A/B/C/D only after route evidence supports it; unresolved cases remain unreviewed |
| Freshness / review | Date checked, applicability limits and triggers for renewed review |
| Native follow-up | A bounded test with explicit route/model authorization and ownership/cleanup checks |

The presence of a subscription login command does not alone establish that
third-party automation is permitted. Conversely, a provider API route is a
separate access path even when the same model is available through a CLI.
Class D represents documented prohibition or a reviewed unresolved route;
the current `unreviewed` state records that no classification has been assessed.

## Exit conditions for documentation research

- Every proposed route has primary source links and a review date.
- Native capability and permitted access are recorded separately.
- Unsupported or unclear routes are not promoted by delegation success.
- No tokens are extracted, copied or reused from vendor tools; login remains
  in official user-controlled flows when native qualification is later scoped.
- Open questions and any needed native tests are explicit.
- Provider policy conclusions receive the review required by the feasibility
  test plan before release; this research inventory is not release approval.

See [S4 in the test plan](../../architecture/TIYE-Agent-Feasibility-Test-Plan.md#s4-login-access-per-provider)
and [the S3 assessment](../s3-worktrees/ASSESSMENT.md) for outstanding gates.
